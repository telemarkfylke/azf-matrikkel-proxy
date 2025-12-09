const { logger } = require("@vestfoldfylke/loglady")
const Sjablong = require("@vtfk/sjablong") // Replace placeholders in templates
const { matrikkelApi } = require("../config")
const { flattenObject } = require("../lib/helpers/flattenObject")
const { MatrikkelClient } = require("../lib/KartverketMatrikkelAPI/MatrikkelClient")
const { getTemplate } = require("../lib/TemplateClient/TemplateClient")

module.exports = async (_context, req) => {
	logger.logConfig({
		prefix: "storeService"
	})

	if (!req.body.matrikkelContext) {
		req.body.matrikkelContext = {}
	}

	if (req.body.koordinatsystemKodeId !== undefined) {
		req.body.matrikkelContext.koordinatsystemKodeId = req.body.koordinatsystemKodeId
	}

	req.matrikkelContext = Sjablong.replacePlaceholders(getTemplate("matrikkelContext.xml"), req.body.matrikkelContext)

	const client = new MatrikkelClient(matrikkelApi.MATRIKKELAPI_USERNAME, matrikkelApi.MATRIKKELAPI_PASSWORD, "matrikkelapi/wsapi/v1/StoreServiceWS")
	const store = await client.callStoreService(req, req.body.items)

	const flattStore = flattenObject(store)
	const returnTypeCountObject = client.getReturnTypeCountObject(flattStore)
	logger.info("Got data from matrikkel StoreServiceWS: {@Data}", returnTypeCountObject)

	try {
		return {
			status: 200,
			body: {
				store: flattStore
			}
		}
	} catch (error) {
		return {
			status: 500,
			body: error
		}
	}
}
