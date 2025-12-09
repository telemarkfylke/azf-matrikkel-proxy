const { logger } = require("@vestfoldfylke/loglady")
const Sjablong = require("@vtfk/sjablong") // Replace placeholders in templates
const { matrikkelApi } = require("../config")
const { MatrikkelClient } = require("../lib/KartverketMatrikkelAPI/MatrikkelClient")
const { getTemplate } = require("../lib/TemplateClient/TemplateClient")

module.exports = async (_context, req) => {
	logger.logConfig({
		prefix: "matrikkelenheter"
	})

	if (!req.body.matrikkelContext) {
		req.body.matrikkelContext = {}
	}

	if (req.body.koordinatsystemKodeId !== undefined) {
		req.body.matrikkelContext.koordinatsystemKodeId = req.body.koordinatsystemKodeId
	}

	req.matrikkelContext = Sjablong.replacePlaceholders(getTemplate("matrikkelContext.xml"), req.body.matrikkelContext)

	// Oppretter en ny klient for å kontakte matrikkelen.
	const client = new MatrikkelClient(matrikkelApi.MATRIKKELAPI_USERNAME, matrikkelApi.MATRIKKELAPI_PASSWORD, "matrikkelapi/wsapi/v1/MatrikkelenhetServiceWS")

	const result = await client.getMatrikkelPolygon(req, req.body.polygon)

	let units
	if (result[0]["soap:Envelope"]?.["soap:Body"].findMatrikkelenheterResponse.return !== undefined) {
		// If result[0]['soap:Envelope']?.['soap:Body'].findMatrikkelenheterResponse.return.item is not an array make it an array (it should always be an array, but sometimes it's not :D)
		if (!Array.isArray(result[0]["soap:Envelope"]?.["soap:Body"].findMatrikkelenheterResponse.return.item)) {
			units =
				result[0]["soap:Envelope"]?.["soap:Body"].findMatrikkelenheterResponse.return.item?.value === undefined
					? ""
					: [result[0]["soap:Envelope"]?.["soap:Body"].findMatrikkelenheterResponse.return.item?.value] // Denne kan være undefined, håndter det returns [ undefined ]
		} else {
			units = result[0]["soap:Envelope"]?.["soap:Body"].findMatrikkelenheterResponse.return.item.map((unit) => unit.value)
		}
	} else {
		units = result[0].findMatrikkelenheterResponse?.return?.item.map((unit) => unit.value)
	}

	if (units === undefined || units.length < 0) throw new Error("Fant ingen enheter innenfor polygonet")

	logger.info("Got {MatrikkelUnitCount} units from matrikkel MatrikkelenhetServiceWS", units.length)

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
