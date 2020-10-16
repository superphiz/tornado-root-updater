require('dotenv').config()
const Web3 = require('web3')
const { TxManager } = require('tx-manager')
const Redis = require('ioredis')
const farmAbi = require('../abi/farm.json')

const web3 = new Web3(process.env.RPC_URL)
const redis = new Redis(process.env.REDIS_URL)
const farm = new web3.eth.Contract(farmAbi, process.env.FARM_ADDR)
const txManager = new TxManager({ privateKey: process.env.PRIVATE_KEY, rpcUrl: process.env.RPC_URL, config: {
  CONFIRMATIONS: 6
}})

web3.eth.accounts.wallet.add('0x' + process.env.PRIVATE_KEY)
web3.eth.defaultAccount = web3.eth.accounts.privateKeyToAccount('0x' + process.env.PRIVATE_KEY).address

module.exports = {
  web3,
  redis,
  farm,
  txManager,
}
