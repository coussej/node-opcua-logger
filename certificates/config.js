'use strict'
// ---------------------------------------------------------------------------------------------------------------------
module.exports = {

  subject: {
    commonName: 'FACTRY_OPCUA_LOGGER',
    organization: 'FACTRY BVBA',
    organizationUnit: 'Unit',
    locality: 'Ghent',
    state: 'East-Flanders',
    country: 'BE' // Two letters
  },

  validity: 365 * 15, // 15 years

  keySize: 2048 // default private key size : 2048, 3072 or 4096 (avoid 1024 too weak)
}
