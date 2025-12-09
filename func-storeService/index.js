const { app } = require("@azure/functions");
const { logger } = require("@vestfoldfylke/loglady");
const Sjablong = require("@vtfk/sjablong"); // Replace placeholders in templates
const { matrikkelApi } = require("../config");
const { flattenObject } = require("../lib/helpers/flattenObject");
const { MatrikkelClient } = require("../lib/KartverketMatrikkelAPI/MatrikkelClient");
const { getTemplate } = require("../lib/TemplateClient/TemplateClient");

const storeService = async (req) => {
  logger.logConfig({
    prefix: "storeService"
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

    const client = new MatrikkelClient(matrikkelApi.MATRIKKELAPI_USERNAME, matrikkelApi.MATRIKKELAPI_PASSWORD, "matrikkelapi/wsapi/v1/StoreServiceWS");
    const store = await client.callStoreService(req, requestBody.items);

    const flattStore = flattenObject(store);
    const returnTypeCountObject = client.getReturnTypeCountObject(flattStore);
    logger.info("Got data from matrikkel StoreServiceWS: {@Data}", returnTypeCountObject);

    return {
      status: 200,
      jsonBody: {
        store: flattStore
      }
    };
  } catch (error) {
    logger.errorException(error, "Error occured in storeService");
    return {
      status: 500,
      jsonBody: {
        error
      }
    };
  }
};

app.http("storeService", {
  authLevel: "function",
  handler: storeService,
  methods: ["POST"],
  route: "store"
});
