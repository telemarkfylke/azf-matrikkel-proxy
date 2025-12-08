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
  
  logger('info', ['call-freg', 'Trying to call freg'])
  const response = await fetch(freg.api.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${fregToken}`,
    },
    body: JSON.stringify(fregBody)
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    logger('error', ['call-freg', `Freg API responded with status ${response.status} : ${response.statusText} :: ${errorText}`])
    throw new Error(`Freg API responded with status ${response.status} : ${response.statusText}`)
  }

  try {
    const data = await response.json()
    logger('info', ['call-freg', 'Successfully called freg and got the data'])
    return data
  } catch (error) {
    logger('error', ['call-freg', 'Failed trying to get freg data', error])
    throw new Error(`Failed trying to get freg data: ${error.message} : ${error.stack}`)
  }
}

module.exports = {
  fregBySSN
}
