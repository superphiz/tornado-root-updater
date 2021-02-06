require('dotenv').config()
const Web3 = require('web3')
const { TxManager } = require('tx-manager')
const tornadoTreesAbi = require('../abi/tornadoTrees.json')
const Redis = require('ioredis')
const ENSResolver = require('./resolver')
const resolver = new ENSResolver()
const redis = new Redis(process.env.REDIS_URL)
const config = require('torn-token')
let tornadoTrees
let tornadoTreesV1

const web3 = new Web3(process.env.RPC_URL)
web3.eth.accounts.wallet.add('0x' + process.env.PRIVATE_KEY)
web3.eth.defaultAccount = web3.eth.accounts.privateKeyToAccount('0x' + process.env.PRIVATE_KEY).address

const txManager = new TxManager({
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: process.env.RPC_URL,
  config: {
    CONFIRMATIONS: process.env.CONFIRMATION_BLOCKS,
    MAX_GAS_PRICE: process.env.GAS_PRICE,
  },
})

async function getTornadoTrees() {
  if (!tornadoTrees) {
    const tornadoTreesAddress = process.env.TORNADO_TREES
      ? process.env.TORNADO_TREES
      : await resolver.resolve(config.tornadoTrees.address)
    tornadoTrees = new web3.eth.Contract(tornadoTreesAbi, tornadoTreesAddress)
    console.log('Resolved tornadoTrees contract:', tornadoTrees._address)
  }
  return tornadoTrees
}

async function getTornadoTreesV1() {
  if (!tornadoTreesV1) {
    const tornadoTreesAddress = process.env.TORNADO_TREES_V1
      ? process.env.TORNADO_TREES_V1
      : await resolver.resolve(config.tornadoTrees.address)
    tornadoTreesV1 = new web3.eth.Contract(tornadoTreesAbi, tornadoTreesAddress)
    console.log('Resolved tornadoTreesV1 contract:', tornadoTreesV1._address)
  }
  return tornadoTreesV1
}

module.exports = {
  web3,
  redis,
  getTornadoTrees,
  getTornadoTreesV1,
  txManager,
}
