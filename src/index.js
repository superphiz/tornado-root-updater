require('dotenv').config()
const cron = require('cron')
const { web3, redis, getTornadoTrees, getEthersTornadoTrees } = require('./singletons')
const config = require('torn-token')
const {
  getTornadoEvents,
  getRegisteredEvents,
  getRegisteredEventsV1,
  getEventsForMigration,
} = require('./events')
const { toWei, toHex } = require('web3-utils')
const { action } = require('./utils')
const axios = require('axios')
const MerkleTree = require('fixed-merkle-tree')
const { poseidonHash2 } = require('tornado-trees/src/utils')
const controller = require('tornado-trees')

const broadcastNodes = process.env.BROADCAST_NODES.split(',')
const STARTING_BLOCK = process.env.STARTING_BLOCK || 0
const prefix = {
  1: '',
  42: 'kovan.',
  5: 'goerli.',
}

let previousUpload = action.WITHDRAWAL
// let nonce = Number(process.env.NONCE)
const batchSize = Number(process.env.INSERT_BATCH_SIZE)

const capitalize = (s) => {
  if (typeof s !== 'string') return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

async function main(isRetry = false) {
  const trees = {
    deposit: new MerkleTree(20, [], { hashFunction: poseidonHash2 }), // todo pre-populate
    withdrawal: new MerkleTree(20, [], { hashFunction: poseidonHash2 }), // todo pre-populate
  }
  const tornadoTrees = await getTornadoTrees()
  const newEvents = {}
  const startBlock = Number((await redis.get('lastBlock')) || STARTING_BLOCK) + 1
  const netId = await web3.eth.getChainId()
  const currentBlock = await web3.eth.getBlockNumber()
  const explorer = `https://${prefix[netId]}etherscan.io`
  const instances = Object.values(config.instances[`netId${netId}`].eth.instanceAddress)
  const account = web3.eth.accounts.wallet.add('0x' + process.env.PRIVATE_KEY)
  let nonce = await web3.eth.getTransactionCount(account.address)
  console.log(`Getting events for blocks ${startBlock} to ${currentBlock}`)
  for (const type of Object.values(action)) {
    const v1RegisteredEvents = await getRegisteredEventsV1({ type }) // todo check if they were already processed
    // console.log('v1RegisteredEvents', v1RegisteredEvents)

    const tornadoEvents = getEventsForMigration({ type })
    // console.log('tornadoEvents', type, tornadoEvents)

    newEvents[type] = v1RegisteredEvents.map((e) => tornadoEvents[e])
    if (newEvents[type].some((e) => e === undefined)) {
      console.log('Tree contract expects unknown tornado event')
      console.log(v1RegisteredEvents.find((e) => !tornadoEvents[e]))
      if (isRetry) {
        console.log('Quitting')
      } else {
        console.log('Retrying')
        await redis.set('lastBlock', STARTING_BLOCK)
        await main(true)
      }
      return
    }
  }

  console.log(
    `There are ${newEvents[action.DEPOSIT].length} unprocessed deposits and ${
      newEvents[action.WITHDRAWAL].length
    } withdrawals`,
  )
  console.log(
    `So we can do ${Math.floor(
      newEvents[action.DEPOSIT].length / batchSize,
    )} deposit batches and ${Math.floor(newEvents[action.WITHDRAWAL].length / batchSize)} withdrawal batched`,
  )

  while (newEvents[action.DEPOSIT].length || newEvents[action.WITHDRAWAL].length) {
    const chunks = {}
    const type = previousUpload === action.DEPOSIT ? action.WITHDRAWAL : action.DEPOSIT
    console.log('\nNew run of', type)
    chunks[type] = newEvents[type].splice(0, batchSize)

    console.log(`Submitting tree update with ${chunks[type].length} ${type}s`)

    const { input, args } = controller.batchTreeUpdate(trees[type], chunks[type])
    const proof = await controller.prove(input, './snarks/BatchTreeUpdate')
    const ethersTornadoTrees = await getEthersTornadoTrees()
    const { data } = await ethersTornadoTrees.populateTransaction[`update${capitalize(type)}Tree`](
      proof,
      ...args,
    )

    console.log('nonce', nonce)
    const tx = {
      to: tornadoTrees._address,
      data,
      gasPrice: toHex(toWei(process.env.GAS_PRICE, 'Gwei')),
      nonce: toHex(nonce),
      gasLimit: toHex((2e6).toString()),
    }

    try {
      const signedTx = await account.signTransaction(tx)
      nonce++
      for (let i = 0; i < broadcastNodes.length; i++) {
        const res = await axios.post(broadcastNodes[i], {
          jsonrpc: '2.0',
          method: 'eth_sendRawTransaction',
          params: [signedTx.rawTransaction],
          id: 1,
        })
        if (!res.data.result) {
          console.error('error', res.data)
        }
        console.log(`${nonce}th: https://etherscan.io/tx/${res.data.result}`)
      }
      // if (nonce === 10) {
      //   process.exit(0)
      // }
    } catch (e) {
      console.log('Tx failed...', e)
      if (isRetry) {
        console.log('Quitting')
      } else {
        await redis.set('lastBlock', STARTING_BLOCK)
        console.log('Retrying')
        // await main(true)
      }
      return
    }
    previousUpload = type
  }

  await redis.set('lastBlock', currentBlock)
  console.log('Done')
}

cron.job(process.env.CRON_EXPRESSION, main, null, true, null, null, true)
