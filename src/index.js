require('dotenv').config()
const cron = require('cron')
const { web3, redis, farm } = require('./singletons')
const instances = require('../instances.json')
const merkleTree = require('fixed-merkle-tree')
const { getFarmEvents, getTornadoEvents } = require('./events')
const { toFixedHex, poseidonHash2 } = require('./utils')

const CONFIRMATION_BLOCKS = process.env.CONFIRMATION_BLOCKS || 12
const STARTING_BLOCK = process.env.STARTING_BLOCK || 0

async function getKnownEvents(type) {
  const startBlock = Number(await redis.get(`${type}LastBlock`) || STARTING_BLOCK) + 1
  const endBlock = await web3.eth.getBlockNumber() - CONFIRMATION_BLOCKS
  const cachedEvents = await redis.lrange(type, 0, -1)
  const newEvents = await getFarmEvents(startBlock, endBlock, type)
  if (newEvents.length > 0) {
    await redis.rpush(type, newEvents)
  }
  await redis.set(`${type}LastBlock`, endBlock)
  return cachedEvents.concat(newEvents)
}

/** Note: Mutates events array and tree */
function getNextChunk(type, events, tree) {
  const leaves = []
  let index = tree.elements().length
  const oldRoot = toFixedHex(tree.root())
  const batch = events.splice(0, process.env.INSERT_BATCH_SIZE)
  for (const e of batch) {
    tree.insert(e.leafHash)
    leaves.push({
      instance: e.instance,
      hash: e.hash,
      block: e.block,
      index: index++,
    })
  }
  const newRoot = toFixedHex(tree.root())
  return {
    oldRoot,
    newRoot,
    leaves,
  }
}

async function checkRoot(type, root, isRetry) {
  const method = type === 'deposit' ? 'depositRoot' : 'withdrawalRoot'
  const rootInContract = await farm.methods[method]().call()
  if (root !== rootInContract) {
    console.log(`Outdated ${type} root: ${root} != ${rootInContract}!`)
    if (isRetry) {
      console.log('Quitting')
    } else {
      console.log('Trying to clear cache and try again')
      await redis.flushdb()
      await main(true)
    }
    return true
  }
  return false
}

async function main(isRetry = false) {
  console.log('Started tree update')
  const newEvents = {}
  const trees = {}
  const startingBlock = Number(await redis.get('lastBlock') || 0) + 1
  const currentBlock = await web3.eth.getBlockNumber() - CONFIRMATION_BLOCKS
  console.log(`Getting events for blocks ${startingBlock} to ${currentBlock}`)
  for (const type of ['deposit', 'withdrawal']) {
    const knownEvents = await getKnownEvents(type)
    newEvents[type]  = await getTornadoEvents(instances, startingBlock, currentBlock, type)
    newEvents[type] = newEvents[type].filter(x => !knownEvents.includes(x.leafHash))
    trees[type] = new merkleTree(process.env.MERKLE_TREE_LEVELS, knownEvents, { hashFunction: poseidonHash2 })
  }

  while(newEvents['deposit'].length || newEvents['withdrawal'].length) {
    const chunks = {}
    for (const type of ['deposit', 'withdrawal']) {
      chunks[type] = await getNextChunk(type, newEvents[type], trees[type])
      if (await checkRoot(type, chunks[type].oldRoot, isRetry)) {
        return
      }
    }

    console.log(`Submitting tree update with ${chunks['deposit'].leaves.length} deposits and ${chunks['withdrawal'].leaves.length} withdrawals`)
    const r = await farm.methods.updateRoots(...Object.values(chunks['deposit']), ...Object.values(chunks['withdrawal']))
      .send({ from: web3.eth.defaultAccount, gas: 10e6 })
    console.log(`Transaction: https://etherscan.io/tx/${r.transactionHash}`)
  }

  await redis.set('lastBlock', currentBlock)
  console.log('Done')
}

cron.job(process.env.CRON_EXPRESSION, main, null, true, null, null, true)

