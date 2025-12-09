const { brreg } = require("../../config");
const { logger } = require("@vestfoldfylke/loglady");

const callBrreg = async (url) => {
  try {
    const response = await fetch(url, {
      method: "GET"
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error("Brreg API call to {URL} failed with status: {Status} : {StatusText} : {@ErrorData}", url, response.status, response.statusText, errorData);
      return null;
    }

    return await response.json();
  } catch (error) {
    logger.errorException(error, "Error occurred while calling Brreg API at {URL}", url);
    return null;
  }
};

/**
 * @param {string} orgNr - OrgNr til den organisasjonen/bedriften du ønsker å søke opp
 * @returns {object}
 */
const brregByOrgNr = async (orgNr) => {
  if (!orgNr) {
    return;
  }

  // Attempt to find the business
  logger.info("Calling Brreg using the main api url for OrgNr: {OrgNr}", orgNr);
  const businessResponse = await callBrreg(`${brreg.main}/${orgNr}`);
  if (businessResponse) {
    logger.info("Got info from Brreg using the main api url for OrgNr: {OrgNr}", orgNr);
    return businessResponse;
  }

  // Attempt to find the branch business
  logger.info("Calling Brreg using the sub api url for OrgNr: {OrgNr}", orgNr);
  const branchResponse = await callBrreg(`${brreg.sub}/${orgNr}`);
  if (branchResponse) {
    logger.info("Got info from Brreg using the sub api url for OrgNr: {OrgNr}", orgNr);
    return branchResponse;
  }

  return undefined;
};

module.exports = {
  brregByOrgNr
};
