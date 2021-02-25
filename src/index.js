require('dotenv').config()
const cron = require('cron')
const { web3, redis, getTornadoTrees, txManager } = require('./singletons')
const config = require('torn-token')
const { getTornadoEvents, getRegisteredEvents } = require('./events')
const { toWei, toHex } = require('web3-utils')
const { action } = require('./utils')
const axios = require('axios')

const broadcastNodes = process.env.BROADCAST_NODES.split(',')
const STARTING_BLOCK = process.env.STARTING_BLOCK || 0
const prefix = {
  1: '',
  42: 'kovan.',
  5: 'goerli.',
}

let previousUpload = action.DEPOSIT
let nonce = Number(process.env.NONCE)
async function main(isRetry = false) {
  const tornadoTrees = await getTornadoTrees()
  const newEvents = {}
  const startBlock = Number((await redis.get('lastBlock')) || STARTING_BLOCK) + 1
  const netId = await web3.eth.getChainId()
  const currentBlock = await web3.eth.getBlockNumber()
  const explorer = `https://${prefix[netId]}etherscan.io`
  const instances = Object.values(config.instances[`netId${netId}`].eth.instanceAddress)
  console.log(`Getting events for blocks ${startBlock} to ${currentBlock}`)
  for (const type of Object.values(action)) {
    const newRegisteredEvents = await getRegisteredEvents({ type })
    const tornadoEvents = await getTornadoEvents({ instances, startBlock, endBlock: currentBlock, type })

    newEvents[type] = newRegisteredEvents.map((e) => tornadoEvents[e])
    if (newEvents[type].some((e) => e === undefined)) {
      console.log('Tree contract expects unknown tornado event')
      console.log(newRegisteredEvents.find((e) => !tornadoEvents[e]))
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

  while (newEvents[action.DEPOSIT].length || newEvents[action.WITHDRAWAL].length) {
    const chunks = {}
    const type = previousUpload === action.DEPOSIT ? action.WITHDRAWAL : action.DEPOSIT
    chunks[type] = newEvents[type].splice(0, process.env.INSERT_BATCH_SIZE)

    console.log(`Submitting tree update with ${chunks[type].length} ${type}s`)

    const args =
      previousUpload === action.DEPOSIT ? [[], chunks[action.WITHDRAWAL]] : [chunks[action.DEPOSIT], []]
    const data = tornadoTrees.methods.updateRoots(...args).encodeABI()
    const account = web3.eth.accounts.wallet.add('0x' + process.env.PRIVATE_KEY)
    const tx = {
      to: tornadoTrees._address,
      data,
      gasPrice: toHex(toWei(process.env.GAS_PRICE, 'Gwei')),
      nonce: toHex(nonce),
      gasLimit: toHex((7e6).toString()),
    }

    try {
      const signedTx = await account.signTransaction(tx)
      console.log(nonce)
      nonce++
      for (let i = 0; i < broadcastNodes.length; i++) {
        const res = await axios.post(broadcastNodes[i], {
          jsonrpc: '2.0',
          method: 'eth_sendRawTransaction',
          params: [signedTx.rawTransaction],
          id: 1,
        })
        if (!res.data.result) {
          // console.error('error', res.data)
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
