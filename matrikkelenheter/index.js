const { logConfig } = require('@vtfk/logger')
const TemplateClient = require('../lib/TemplateClient/TemplateClient')
const Sjablong = require('@vtfk/sjablong') // Replace placeholders in templates
const { matrikkelApi } = require('../config')
const { MatrikkelClient } = require('../lib/KartverketMatrikkelAPI/MatrikkelClient')

module.exports = async function (context, req) {
  logConfig({
    prefix: 'azf-matrikkel-proxy - matrikkelenheter',
    teams: {
      onlyInProd: false
    },
    azure: {
      context,
      excludeInvocationId: true
    }
  })

  if (!req.body.matrikkelContext) {
    req.body.matrikkelContext = {}
  }

  if (req.body.koordinatsystemKodeId !== undefined) {
    req.body.matrikkelContext.koordinatsystemKodeId = req.body.koordinatsystemKodeId
  }

  req.matrikkelContext = Sjablong.replacePlaceholders(TemplateClient.getTemplate('matrikkelContext.xml'), req.body.matrikkelContext)

  // Oppretter en ny klient for å kontakte matrikkelen.
  const client = new MatrikkelClient(matrikkelApi.MATRIKKELAPI_USERNAME, matrikkelApi.MATRIKKELAPI_PASSWORD, 'matrikkelapi/wsapi/v1/MatrikkelenhetServiceWS')

  const result = await client.getMatrikkelPolygon(req, req.body.polygon)

  let units
  if (result[0]['soap:Envelope']?.['soap:Body'].findMatrikkelenheterResponse.return !== undefined) {
    // If result[0]['soap:Envelope']?.['soap:Body'].findMatrikkelenheterResponse.return.item is not an array make it an array (it should always be an array, but sometimes it's not :D)
    if (!Array.isArray(result[0]['soap:Envelope']?.['soap:Body'].findMatrikkelenheterResponse.return.item)) {
      units = result[0]['soap:Envelope']?.['soap:Body'].findMatrikkelenheterResponse.return.item?.value === undefined ? '' : [result[0]['soap:Envelope']?.['soap:Body'].findMatrikkelenheterResponse.return.item?.value] // Denne kan være undefined, håndter det returns [ undefined ]
    } else {
      units = result[0]['soap:Envelope']?.['soap:Body'].findMatrikkelenheterResponse.return.item.map(unit => unit.value)
    }
    console.log(units)
  } else {
    units = result[0].findMatrikkelenheterResponse?.return?.item.map(unit => unit.value)
  }

  if (units === undefined || units.length < 0) throw new Error('Fant ingen enheter innenfor polygonet')

  try {
    return {
      status: 200,
      body: {
        units,
        koordinatsystemKodeId: req.body.koordinatsystemKodeId
      }
    }
  } catch (error) {
    return {
      status: 500,
      body: error
    }
  }
}
