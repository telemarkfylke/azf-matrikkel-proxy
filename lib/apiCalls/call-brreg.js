const axios = require('axios').default
const { brreg } = require('../../config')
const { logger } = require('@vtfk/logger')
/**
 * @param {string} orgNr - OrgNr til den organisasjonen/bedriften du ønsker å søke opp
 * @returns {object}
 */
const brregByOrgNr = async (orgNr) => {
  if (!orgNr) return
  // Attempt to find the business, if not found, attempt to find it as a branch business
  try {
    logger('info', ['call-brreg', `Trying to call brreg using the main api url for orgNr: ${orgNr}`])
    const response = await axios.get(`${brreg.main}/${orgNr}`)
    logger('info', ['call-brreg', `Got info from Brreg using the main api url for orgNr: ${orgNr}`])
    return response.data
  } catch (error) {
    logger('info', ['call-brreg', `Failed trying to call brreg using the main api url for orgNr: ${orgNr}`])
    try {
      logger('info', ['call-brreg', `Trying to call brreg using the sub api url for orgNr: ${orgNr}`])
      const branchResponse = await axios.get(`${brreg.sub}/${orgNr}`)
      logger('info', ['call-brreg', `Got info from Brreg using the sub api url for orgNr: ${orgNr}`])
      return branchResponse.data
    } catch (error) {
      logger('error', ['call-brreg', `Failed trying to call brreg using the main & sub api url for orgNr: ${orgNr}`])
      return undefined
    }
  }
}

module.exports = {
  brregByOrgNr
}
