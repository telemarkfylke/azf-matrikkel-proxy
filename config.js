module.exports = {
  matrikkelApi: {
    MATRIKKELAPI_BASEURL: process.env.MATRIKKELAPI_BASEURL || "matrikkel base url",
    MATRIKKELAPI_USERNAME: process.env.MATRIKKELAPI_USERNAME || "matrikkel username",
    MATRIKKELAPI_PASSWORD: process.env.MATRIKKELAPI_PASSWORD || "matrikkel password"
  },
  freg: {
    scope: process.env.AZF_FREG_SCOPE || "scope",
    url: process.env.AZF_FREG_URL || "url"
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
