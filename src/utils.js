const { bigInt } = require('snarkjs')
const { mimcsponge } = require('circomlib')

/** BigNumber to hex string of specified length */
const toFixedHex = (number, length = 32) =>
  '0x' + (number instanceof Buffer ? number.toString('hex') : bigInt(number).toString(16)).padStart(length * 2, '0')

const mimcHash = (items) => toFixedHex(mimcsponge.multiHash(items.map((item) => bigInt(item))))

module.exports = {
  toFixedHex,
  mimcHash,
}
