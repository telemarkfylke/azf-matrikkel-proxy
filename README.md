# Matrikkel proxy
Proxy api for calling the matrikkel api developed by kartverket.
https://matrikkel.no/matrikkelapi/wsapi/v1/dokumentasjon/index.html

## Setup
1. Clone the repo
2. Run ``npm i`` 
3. Create a local.settings.json file and add the environment variables
4. Run ``func start``

## Environment Variables
| Variable              | Description                     | Example                                                 |
|-----------------------|---------------------------------|---------------------------------------------------------|
| MATRIKKELAPI_BASEURL  | Endpoint for the matrikkel api  | https://www.nd.matrikkel.no/                            |
| MATRIKKELAPI_USERNAME | username provided by kartverket | [Username]                                              |
| MATRIKKELAPI_PASSWORD | password provided by kartverket | [Password]                                              |
| AZF_FREG_SCOPE        | Scope for the freg api          | [Scope]                                                 |
| AZF_FREG_URL          | Endpoint for freg api           | https://**[url]**.**[domain]**/api/personer             |
| AZURE_CLIENT_ID       | App reg client id for freg      | [Guid]                                                  |
| AZURE_CLIENT_SECRET   | App reg client secret for freg  | [Guid]                                                  |
| AZURE_TENANT_ID       | TenantId                        | [TenantId]                                              |
| BRREG_SUB             | Endpoint for brreg subunits     | https://data.brreg.no/enhetsregisteret/api/underenheter |
| BRREG_MAIN            | Endpoint for brreg main units   | https://data.brreg.no/enhetsregisteret/api/enheter      |