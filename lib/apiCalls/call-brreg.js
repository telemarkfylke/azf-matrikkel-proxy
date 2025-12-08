const { brreg } = require('../../config')
const { logger } = require('@vtfk/logger')

const callBrreg = async (url) => {
  try {
    const response = await fetch(url, {
      method: 'GET'
    })

    if (!response.ok) {
      const errorData = await response.json()
      logger('error', ['call-brreg', `Brreg API call to ${url} failed with status: ${response.status} : ${response.statusText}`, errorData])
      return null
    }

    return await response.json()
  } catch (error) {
    logger('error', ['call-brreg', `Error occurred while calling Brreg API at ${url}: ${error.message} : ${error.stack}`])
    return null
  }
}

/**
 * @param {string} orgNr - OrgNr til den organisasjonen/bedriften du ønsker å søke opp
 * @returns {object}
 */
const brregByOrgNr = async (orgNr) => {
  if (!orgNr) {
    return
  }

  // Attempt to find the business
  logger('info', ['call-brreg', `Trying to call brreg using the main api url for orgNr: ${orgNr}`])
  const businessResponse = await callBrreg(`${brreg.main}/${orgNr}`)
  if (businessResponse) {
    logger('info', ['call-brreg', `Got info from Brreg using the main api url for orgNr: ${orgNr}`])
    return businessResponse
  }

  // Attempt to find the branch business
  logger('info', ['call-brreg', `Trying to call brreg using the sub api url for orgNr: ${orgNr}`])
  const branchResponse = await callBrreg(`${brreg.sub}/${orgNr}`)
  if (branchResponse) {
    logger('info', ['call-brreg', `Got info from Brreg using the sub api url for orgNr: ${orgNr}`])
    return branchResponse
  }

  return undefined
}

module.exports = {
  brregByOrgNr
}
