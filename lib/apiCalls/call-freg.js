const axios = require('axios').default
const getAccessToken = require('../get-entraid-token')
const { freg } = require('../../config')
const { logger } = require('@vtfk/logger')

/**
 * @param {string} ssn - Fødselsnummer til den du ønsker å søke opp
 * @param {boolean} raw - Ta med rå dataen som kommer fra freg API
 * @param {boolean} fortrolig - Ta med fortrolig info, nb ikke bruk denne om du ikke må
 * @returns {object}
 */
const fregBySSN = async (ssn, raw, fortrolig) => {
  const fregToken = await getAccessToken(freg.appReg.scope)
  const fregBody = {
    ssn,
    includeFortrolig: fortrolig,
    includeRawFreg: raw
  }
  try {
    logger('info', ['call-freg', 'Trying to call freg'])
    const data = await axios.post(freg.api.url, fregBody, { headers: { Authorization: `Bearer ${fregToken}` } })
    logger('info', ['call-freg', 'Successfully called freg and got the data'])
    return data.data
  } catch (error) {
    logger('error', ['call-freg', 'Failed trying to call freg', error])
    throw new Error(`Failed trying to call freg: ${error.message} : ${error.stack}`)
  }
}

module.exports = {
  fregBySSN
}
