const getAccessToken = require('../get-entraid-token')
const { freg } = require('../../config')
const { logger } = require('@vestfoldfylke/loglady')

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
  
  logger.info('Trying to call freg')
  const response = await fetch(freg.api.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${fregToken}`,
    },
    body: JSON.stringify(fregBody)
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    logger.error('Freg API responded with status {Status} : {StatusText} :: {ErrorText}', response.status, response.statusText, errorText)
    throw new Error(`Freg API responded with status ${response.status} : ${response.statusText}`)
  }

  try {
    const data = await response.json()
    logger.info('Successfully called freg and got the data')
    return data
  } catch (error) {
    logger.errorException(error, 'Failed trying to get freg data')
    throw new Error(`Failed trying to get freg data: ${error.message} : ${error.stack}`)
  }
}

module.exports = {
  fregBySSN
}
