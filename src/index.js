require('dotenv').config()
const Web3 = require('web3')
const Redis = require('ioredis')
const farmAbi = require('../abi/farm.json')
const instances = require('../instances.json')
const merkleTree = require('../lib/merkleTree')
const { getTornadoDeposits, getFarmDeposits } = require('./events')
const { toFixedHex } = require('./utils')

const web3 = new Web3(process.env.RPC_URL)
const redis = new Redis(process.env.REDIS_URL)

async function main() {
  const account = web3.eth.accounts.privateKeyToAccount('0x' + process.env.PRIVATE_KEY)
  web3.eth.accounts.wallet.add('0x' + process.env.PRIVATE_KEY)
  web3.eth.defaultAccount = account.address

  const farm = new web3.eth.Contract(farmAbi, process.env.FARM_ADDR)
  const startingBlock = Number(await redis.get('lastBlock') ?? 0) + 1
  const currentBlock = await web3.eth.getBlockNumber() - 12
  console.log(`Getting events for blocks ${startingBlock} to ${currentBlock}`)
  const farmCachedDeposits = await redis.lrange('deposits', 0, -1)
  const farmDeposits = (await getFarmDeposits(startingBlock, currentBlock)).map(x => x.leafHash)
  const knownDeposits = farmCachedDeposits.concat(farmDeposits)
  const tree = new merkleTree(process.env.MERKLE_TREE_LEVELS, knownDeposits)

  let deposits = await getTornadoDeposits(instances, startingBlock, currentBlock)
  const knownDepositsSet = new Set(knownDeposits)
  deposits = deposits.filter(x => !knownDepositsSet.has(x.leafHash))
  const newDeposits = deposits.map(x => x.leafHash)

  let index = knownDeposits.length
  while(deposits.length) {
    const batch = deposits.splice(0, process.env.INSERT_BATCH_SIZE)
    const leaves = []
    const oldRoot = toFixedHex(await tree.root())
    for (const d of batch) {
      await tree.insert(d.leafHash)
      leaves.push({
        instance: d.instance,
        hash: d.hash,
        block: d.block,
        index: index++,
      })
    }
    const newRoot = toFixedHex(await tree.root())

    console.log(`Submitting tree update from ${oldRoot} to ${newRoot} adding ${leaves.length} new leaves`)
    const r = await farm.methods.updateDepositsRoot(oldRoot, newRoot, leaves).send({ from: web3.eth.defaultAccount, gas: 4e6})
    console.log(r.transactionHash)
  }
  if (newDeposits.length > 0) {
    await redis.rpush('deposits', newDeposits)
  }
  await redis.set('lastBlock', currentBlock)
  console.log('Done')
  process.exit(0)
}

main()
// test()
