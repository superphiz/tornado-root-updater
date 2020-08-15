const tornadoAbi = require('../abi/tornado.json')
const farmAbi = require('../abi/farm.json')
const { mimcHash } = require('./utils')

// todo make global web3
const Web3 = require('web3')
const web3 = new Web3(process.env.RPC_URL)

async function getTornadoEvents(instance, eventName, hashName, startBlock, endBlock) {
  const contract = new web3.eth.Contract(tornadoAbi, instance)
  // todo paging
  const events = await contract.getPastEvents(eventName, { fromBlock: startBlock, toBlock: endBlock })
  return events
    .sort((a, b) => a.returnValues.index - b.returnValues.index)
    .map(e => ({
      instance,
      hash: e.returnValues[hashName],
      block: e.blockNumber,
      leafHash: mimcHash([instance, e.returnValues[hashName], e.blockNumber]),
    }))
}

async function getTornadoDeposits(instance, startBlock, endBlock) {
  if (!Array.isArray(instance)) {
    return getTornadoEvents(instance, 'Deposit', 'commitment', startBlock, endBlock)
  } else {
    return (await Promise.all(instance.map(i => getTornadoDeposits(i, startBlock, endBlock)))).flat()
  }
}

async function getTornadoWithdrawals(instance, startBlock, endBlock) {
  if (!Array.isArray(instance)) {
    return getTornadoEvents(instance, 'Withdrawal', 'nullifierHash', startBlock, endBlock)
  } else {
    return (await Promise.all(instance.map(i => getTornadoWithdrawals(i, startBlock, endBlock)))).flat()
  }
}

async function getFarmEvents(eventName, startBlock, endBlock) {
  const farm = new web3.eth.Contract(farmAbi, process.env.FARM_ADDR)
  const events = await farm.getPastEvents(eventName, { fromBlock: startBlock, toBlock: endBlock })
  return events
    .sort((a, b) => a.returnValues.index - b.returnValues.index)
    .map(e => ({
      instance: e.returnValues.instance,
      hash: e.returnValues.hash,
      block: e.returnValues.block,
      leafHash: mimcHash([e.returnValues.instance, e.returnValues.hash, e.returnValues.block]),
    }))
}

function getFarmDeposits(startBlock, endBlock) {
  return getFarmEvents('DepositData', startBlock, endBlock)
}

function getFarmWithdrawals(startBlock, endBlock) {
  return getFarmEvents('WithdrawalData', startBlock, endBlock)
}

module.exports = {
  getTornadoDeposits,
  getTornadoWithdrawals,
  getFarmDeposits,
  getFarmWithdrawals,
}
