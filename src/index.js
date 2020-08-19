require('dotenv').config()
const cron = require('cron')
const { web3, redis, farm } = require('./singletons')
const instances = require('../instances.json')
const merkleTree = require('fixed-merkle-tree')
const { getFarmEvents, getTornadoEvents } = require('./events')
const { toFixedHex, poseidonHash2 } = require('./utils')

async function getEvents(startBlock, endBlock, type) {
  const farmCachedEvents = await redis.lrange(type, 0, -1)
  const farmEvents = (await getFarmEvents(startBlock, endBlock, type)).map(x => x.leafHash)
  const knownEvents = farmCachedEvents.concat(farmEvents)
  const knownEventsSet = new Set(knownEvents)

  let newEvents = await getTornadoEvents(instances, startBlock, endBlock, type)
  newEvents = newEvents.filter(x => !knownEventsSet.has(x.leafHash))
  return { knownEvents, uncachedEvents: farmEvents, newEvents }
}

async function main() {
  const startingBlock = Number(await redis.get('lastBlock') || 0) + 1
  const currentBlock = await web3.eth.getBlockNumber() - 12
  const types = ['deposit', 'withdraw']

  let knownEvents = {}
  let newEvents = {}
  let uncachedEvents = {}
  let trees = {}
  let index = {}

  console.log(`Getting events for blocks ${startingBlock} to ${currentBlock}`)
  for (const type of types) {
    ({
      knownEvents: knownEvents[type],
      newEvents: newEvents[type],
      uncachedEvents: uncachedEvents[type],
    } = await getEvents(startingBlock, currentBlock, type))
    trees[type] = new merkleTree(process.env.MERKLE_TREE_LEVELS, knownEvents[type], { hashFunction: poseidonHash2 })
    index[type] = knownEvents[type].length
  }

  // zip deposit and withdraw arrays
  let events = Object.keys(newEvents).map(type => newEvents[type].map(event => ({ type, event }))).flat()

  while(events.length) {
    let oldRoots = {}
    let newRoots = {}
    let leaves = {}

    for (const type of types) {
      leaves[type] = []
      oldRoots[type] = toFixedHex(trees[type].root())
    }
    const batch = events.splice(0, process.env.INSERT_BATCH_SIZE)
    for (const d of batch) {
      trees[d.type].insert(d.event.leafHash)
      leaves[d.type].push({
        instance: d.event.instance,
        hash: d.event.hash,
        block: d.event.block,
        index: index[d.type]++,
      })
    }
    for (const type of types) {
      newRoots[type] = toFixedHex(trees[type].root())
    }

    console.log(`Submitting tree update with ${leaves['deposit'].length + leaves['withdraw'].length} items`)
    const r = await farm.methods.updateRoots(
      oldRoots['deposit'],
      newRoots['deposit'],
      leaves['deposit'],
      oldRoots['withdraw'],
      newRoots['withdraw'],
      leaves['withdraw'],
    ).send({ from: web3.eth.defaultAccount, gas: 8e6 })
    console.log(`Transaction: https://etherscan.io/tx/${r.transactionHash}`)
  }

  for (const type of types) {
    if (newEvents[type].length > 0 || uncachedEvents[type].length > 0) {
      await redis.rpush(type, uncachedEvents[type].concat(newEvents[type].map(x => x.leafHash)))
    }
  }
  await redis.set('lastBlock', currentBlock)
  console.log('Done')
}

cron.job(process.env.CRON_EXPRESSION, main, null, true, null, null, true)
