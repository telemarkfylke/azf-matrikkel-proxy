const { DefaultAzureCredential } = require("@azure/identity");

const credential = new DefaultAzureCredential({});

module.exports = async (scope) => {
  if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET || !process.env.AZURE_TENANT_ID) {
    throw new Error("AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET must be set in environment variables");
  }

  const accessToken = await credential.getToken(scope);
  return accessToken.token;
};
