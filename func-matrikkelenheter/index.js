const { app } = require("@azure/functions");
const { logger } = require("@vestfoldfylke/loglady");
const Sjablong = require("@vtfk/sjablong"); // Replace placeholders in templates
const { matrikkelApi } = require("../config");
const { MatrikkelClient } = require("../lib/KartverketMatrikkelAPI/MatrikkelClient");
const { getTemplate } = require("../lib/TemplateClient/TemplateClient");

const matrikkelEnheter = async (req) => {
  logger.logConfig({
    prefix: "matrikkelenheter"
  });

  try {
    const requestBody = await req.json();

    if (!requestBody.matrikkelContext) {
      requestBody.matrikkelContext = {};
    }

    if (requestBody.koordinatsystemKodeId !== undefined) {
      requestBody.matrikkelContext.koordinatsystemKodeId = requestBody.koordinatsystemKodeId;
    }

    req.matrikkelContext = Sjablong.replacePlaceholders(getTemplate("matrikkelContext.xml"), requestBody.matrikkelContext);

    // Oppretter en ny klient for å kontakte matrikkelen.
    const client = new MatrikkelClient(matrikkelApi.MATRIKKELAPI_USERNAME, matrikkelApi.MATRIKKELAPI_PASSWORD, "matrikkelapi/wsapi/v1/MatrikkelenhetServiceWS");

    const koordinatsystemKodeId = requestBody.koordinatsystemKodeId || requestBody.matrikkelContext.koordinatsystemKodeId;

    const result = await client.getMatrikkelPolygon(req, requestBody.polygon, koordinatsystemKodeId);

    let units;
    if (result[0]["soap:Envelope"]?.["soap:Body"].findMatrikkelenheterResponse.return !== undefined) {
      // If result[0]['soap:Envelope']?.['soap:Body'].findMatrikkelenheterResponse.return.item is not an array make it an array (it should always be an array, but sometimes it's not :D)
      if (!Array.isArray(result[0]["soap:Envelope"]?.["soap:Body"].findMatrikkelenheterResponse.return.item)) {
        units =
          result[0]["soap:Envelope"]?.["soap:Body"].findMatrikkelenheterResponse.return.item?.value === undefined
            ? ""
            : [result[0]["soap:Envelope"]?.["soap:Body"].findMatrikkelenheterResponse.return.item?.value]; // Denne kan være undefined, håndter det returns [ undefined ]
      } else {
        units = result[0]["soap:Envelope"]?.["soap:Body"].findMatrikkelenheterResponse.return.item.map((unit) => unit.value);
      }
    } else {
      units = result[0].findMatrikkelenheterResponse?.return?.item.map((unit) => unit.value);
    }

    if (units === undefined || units.length < 0) {
      logger.error("Did not find any units inside the provided polygon");
      return {
        status: 500,
        jsonBody: {
          error: "Fant ingen enheter innenfor polygonet"
        }
      };
    }

    logger.info("Got {MatrikkelUnitCount} units from matrikkel MatrikkelenhetServiceWS", units.length);

    return {
      status: 200,
      jsonBody: {
        units,
        koordinatsystemKodeId: requestBody.koordinatsystemKodeId
      }
    };
  } catch (error) {
    logger.errorException(error, "Error occured in matrikkelEnheter");
    return {
      status: 500,
      jsonBody: {
        error
      }
    };
  }
};

app.http("matrikkelEnheter", {
  authLevel: "function",
  handler: matrikkelEnheter,
  methods: ["POST"],
  route: "matrikkelenheter"
});
