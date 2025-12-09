module.exports = {
  matrikkelApi: {
    MATRIKKELAPI_BASEURL: process.env.MATRIKKELAPI_BASEURL || "matrikkel base url",
    MATRIKKELAPI_USERNAME: process.env.MATRIKKELAPI_USERNAME || "matrikkel username",
    MATRIKKELAPI_PASSWORD: process.env.MATRIKKELAPI_PASSWORD || "matrikkel password"
  },
  freg: {
    appReg: {
      clientId: process.env.AZF_FREG_CLIENT_ID || "clientId",
      clientSecret: process.env.AZF_FREG_CLIENT_SECRET || "client secret",
      scope: process.env.AZF_FREG_SCOPE || "scope"
    },
    api: {
      url: process.env.AZF_FREG_URL || "url",
      xFunctionsKey: process.env.AZF_FREG_X_FUNCTIONS_KEY || "x-functions-key"
    }
  },
  tenant: {
    tenantId: process.env.TENANT_ID || "tenant id"
  },
  brreg: {
    main: process.env.BRREG_MAIN || "main url",
    sub: process.env.BRREG_SUB || "sub url"
  },
  misc: {
    APIKEY1: process.env.APIKEY1,
    APPLICATIONINSIGHTS_CONNECTION_STRING: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    DEBUG: process.env.DEBUG
  }
};
