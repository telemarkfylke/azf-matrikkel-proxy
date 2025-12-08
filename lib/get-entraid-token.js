const { ConfidentialClientApplication } = require('@azure/msal-node')
const { logger } = require('@vestfoldfylke/loglady')
const NodeCache = require('node-cache')
const { freg, tenant } = require('../config')

const cache = new NodeCache({ stdTTL: 3000 })

module.exports = async (scope, options = { forceNew: false }) => {
  const cacheKey = scope

  if (!options.forceNew && cache.get(cacheKey)) {
    return (cache.get(cacheKey))
  }

  logger.info('no token in cache, fetching new from Microsoft')
  const config = {
    auth: {
      clientId: freg.appReg.clientId,
      authority: `https://login.microsoftonline.com/${tenant.tenantId}/`,
      clientSecret: freg.appReg.clientSecret
    },
    cache: {
      claimsBasedCachingEnabled: true
    },
    system: {
      allowPlatformBroker: true
    }
  }

  // Create msal application object
  const cca = new ConfidentialClientApplication(config)
  const clientCredentials = {
    scopes: [freg.appReg.scope]
  }

  const token = await cca.acquireTokenByClientCredential(clientCredentials)
  const expires = Math.floor((token.expiresOn.getTime() - new Date()) / 1000)
  logger.info('Got token from Microsoft, expires in {Expires} seconds', expires)
  cache.set(cacheKey, token.accessToken, expires)
  logger.info('Token stored in cache')
  return token.accessToken
}
