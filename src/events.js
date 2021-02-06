const { web3, getTornadoTrees, getTornadoTreesV1 } = require('./singletons')
const tornadoAbi = require('../abi/tornado.json')
const { poseidonHash } = require('./utils')
const { soliditySha3 } = require('web3-utils')

async function getTornadoEvents({ instances, startBlock, endBlock, type }) {
  const hashName = type === 'deposit' ? 'commitment' : 'nullifierHash'
  const promises = instances.map((instance) => getInstanceEvents({ type, instance, startBlock, endBlock }))

  const raw = await Promise.all(promises)

  const events = raw.flat().reduce((acc, e) => {
    const encodedData = web3.eth.abi.encodeParameters(
      ['address', 'bytes32', 'uint256'],
      [e.address, e.returnValues[hashName], e.blockNumber],
    )
    const leafHash = soliditySha3({ t: 'bytes', v: encodedData })
    acc[leafHash] = {
      instance: e.address,
      hash: e.returnValues[hashName],
      block: e.blockNumber,
    }
    return acc
  }, {})
  return events
}

function getEventsForMigration({ type }) {
  const events = {
    deposit: {
      '0x88f703c0c8811a92cf052438059d2df86d2f63b717ad93c99e7d7402551f7240': {
        hash: '0x004d51bffaafdb3eed0661c1cfd76c8cd6ec1456b80b24bbb855f3a141ebf0be',
        instance: '0x1111000000000000000000000000000000001111',
        block: '0xaaaaaaaa',
      },
      '0xbc93c4693db92285aeaf13d7a9a6b32847757ce61f781f2bca9ab13d457aef65': {
        hash: '0x004d51bffaafdb3eed0661c1cfd76c8cd6ec1456b80b24bbb855f3a141ebf0bd',
        instance: '0x2222000000000000000000000000000000002222',
        block: '0xbbbbbbbb',
      },
      '0xe91ad14ff53f46e9d453c7fa0f44b1dcf85febd4925da43f611bf872dcd1c546': {
        hash: '0x004d51bffaafdb3eed0661c1cfd76c8cd6ec1456b80b24bbb855f3a141ebf0bc',
        instance: '0x3333000000000000000000000000000000003333',
        block: '0xcccccccc',
      },
      '0x246bf3ff523f7751e49e7aa59a948175e5d967238d9784c9fd446737f1588486': {
        hash: '0x004d51bffaafdb3eed0661c1cfd76c8cd6ec1456b80b24bbb855f3a141ebf0bb',
        instance: '0x4444000000000000000000000000000000004444',
        block: '0xdddddddd',
      },
    },
    withdrawal: {
      '0xf13a3ec9c339cb4b4816c1a6ea20797732bb2d53522b16294c14e5462658b487': {
        hash: '0x004d51bffaafdb3eed0661c1cfd76c8cd6ec1456b80b24bbb855f3a141ebf0ba',
        instance: '0x1111000000000000000000000000000000001111',
        block: '0x00000002',
      },
      '0xff6c5705a88cb4c30dbd3d6c20f6c3781d38615a6083156aa6d7027b406843b8': {
        hash: '0x004d51bffaafdb3eed0661c1cfd76c8cd6ec1456b80b24bbb855f3a141ebf0b9',
        instance: '0x2222000000000000000000000000000000002222',
        block: '0x00001683',
      },
      '0xd0dec5045cf46b1930cf737be55a349e1a13e756b1685c564a627e037482ed97': {
        hash: '0x004d51bffaafdb3eed0661c1cfd76c8cd6ec1456b80b24bbb855f3a141ebf0b8',
        instance: '0x3333000000000000000000000000000000003333',
        block: '0x00002d04',
      },
      '0xe532f2bac74041b274d3a1f5ac8d8ce9e7c4f45adada35069e8a3ec88c6b545f': {
        hash: '0x004d51bffaafdb3eed0661c1cfd76c8cd6ec1456b80b24bbb855f3a141ebf0b7',
        instance: '0x4444000000000000000000000000000000004444',
        block: '0x00004385',
      },
    },
  }
  return events[type]
}

async function getInstanceEvents({ type, instance, startBlock, endBlock }) {
  const eventName = type === 'deposit' ? 'Deposit' : 'Withdrawal'

  const contract = new web3.eth.Contract(tornadoAbi, instance)
  const events = await contract.getPastEvents(eventName, {
    fromBlock: startBlock,
    toBlock: endBlock,
  })
  return events
}

async function getMiningEvents(startBlock, endBlock, type) {
  const eventName = type === 'deposit' ? 'DepositData' : 'WithdrawalData'
  const tornadoTrees = await getTornadoTrees()
  const events = await tornadoTrees.getPastEvents(eventName, {
    fromBlock: startBlock,
    toBlock: endBlock,
  })
  return events
    .sort((a, b) => a.returnValues.index - b.returnValues.index)
    .map((e) => poseidonHash([e.returnValues.instance, e.returnValues.hash, e.returnValues.block]))
}

async function getRegisteredEvents({ type }) {
  const method = type === 'deposit' ? 'getRegisteredDeposits' : 'getRegisteredWithdrawals'
  const tornadoTrees = await getTornadoTrees()
  const events = await tornadoTrees.methods[method]().call()
  return events
}

async function getRegisteredEventsV1({ type }) {
  const method = type === 'deposit' ? 'getRegisteredDeposits' : 'getRegisteredWithdrawals'
  const tornadoTreesV1 = await getTornadoTreesV1()
  const events = await tornadoTreesV1.methods[method]().call()
  return events
}

module.exports = {
  getTornadoEvents,
  getEventsForMigration,
  getMiningEvents,
  getRegisteredEvents,
  getRegisteredEventsV1,
}
