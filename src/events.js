const { web3, farm } = require('./singletons')
const tornadoAbi = require('../abi/tornado.json')
const { poseidonHash } = require('./utils')

async function getTornadoEvents(instance, startBlock, endBlock, type) {
  if (Array.isArray(instance)) {
    return (await Promise.all(instance.map(i => getTornadoEvents(i, startBlock, endBlock, type)))).flat()
  }

  const eventName = type === 'deposit' ? 'Deposit' : 'Withdrawal'
  const hashName = type === 'deposit' ? 'commitment' : 'nullifierHash'

  const contract = new web3.eth.Contract(tornadoAbi, instance)
  // todo paging
  const events = await contract.getPastEvents(eventName, { fromBlock: startBlock, toBlock: endBlock })
  return events
    .sort((a, b) => a.returnValues.index - b.returnValues.index)
    .map(e => ({
      instance,
      hash: e.returnValues[hashName],
      block: e.blockNumber,
      leafHash: poseidonHash([instance, e.returnValues[hashName], e.blockNumber]),
    }))
}

async function getFarmEvents(startBlock, endBlock, type) {
  const eventName = type === 'deposit' ? 'DepositData' : 'WithdrawalData'
  const events = await farm.getPastEvents(eventName, { fromBlock: startBlock, toBlock: endBlock })
  return events
    .sort((a, b) => a.returnValues.index - b.returnValues.index)
    .map(e => poseidonHash([e.returnValues.instance, e.returnValues.hash, e.returnValues.block]))
}

module.exports = {
  getTornadoEvents,
  getFarmEvents,
}
