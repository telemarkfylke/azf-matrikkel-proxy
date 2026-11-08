# azf-matrikkel-proxy

API in front of Kartverket's [Matrikkel](https://matrikkel.no/matrikkelapi/wsapi/v1/dokumentasjon/index.html): the properties inside a polygon, properties, plots and owners by id, and for owners, optionally FREG (Folkeregisteret, through azf-freg) and Brønnøysundregistrene.

TypeScript on Azure Functions v4, Node 24. Version 2 replaces the JavaScript proxy (1.x).

## Authentication and roles

App Service built-in authentication validates the token and passes the caller in `X-MS-CLIENT-PRINCIPAL`; the code checks the app role on every endpoint and logs which app called. In Azure it refuses every request if built-in authentication is off.

| Role | Can |
|---|---|
| `matrikkel.read` | Everything except FREG data |
| `matrikkel.read.freg` | Also FREG data for persons (`?enrich=freg`, and the `freg` field on `/store`) |

## Endpoints

Every body can have `koordinatsystemKodeId` (Matrikkel's coordinate system: 24 = WGS 84, 10 = ETRS89 UTM 32N; default 24) and `matrikkelContext: { klientIdentifikasjon }`.

| Method and route | Body | Answer |
|---|---|---|
| `POST /api/v2/units/search` | `{ polygon: [[x, y], …] }` | `{ unitIds: number[] }` |
| `POST /api/v2/units` | `{ ids: number[], positions?: boolean }` | `{ units: Unit[] }` with ownerships, plots, and the main plot's position when asked for |
| `POST /api/v2/plots` | `{ ids: number[] }` | `{ plots: Plot[] }` with area and representative point |
| `POST /api/v2/owners?enrich=freg,brreg` | `{ ids: number[] }` | `{ owners: Owner[] }`, with `freg` / `brreg` when asked for |
| `POST /api/matrikkelenheter` | `{ polygon }` | The 1.x answer: `{ units: string[], koordinatsystemKodeId }` |
| `POST /api/store` | `{ items: [{ type, namespace, value }] }` | The 1.x answer: `{ store: [ … ] }`, owners with `freg`/`brreg`, `handleManually`, `avviklet` … |

The types are in `src/domain/model.ts`. Lists are always lists and numbers are numbers.

- **FREG** is asked with `includeFortrolig: false`, so a protected address (fortrolig, strengt fortrolig, klientadresse) never reaches this API; owners get `protectedAddress: true` and the grading instead. FREG and Brreg run a few at a time with a timeout; one that fails marks that owner (`freg: { error }`) and the rest are answered.
- **Errors** are `{ message }` with a status: 400 for invalid input (checked before Matrikkel is asked) or a Matrikkel validation fault, 401/403 for auth, 502 when Matrikkel, FREG or the credentials fail, 503 when FREG isn't configured, 504 when Matrikkel doesn't answer in time.
- **The 1.x endpoints** answer like 1.x (checked against what 1.x answered, `test/fixtures/legacy`), with these fixes: a protected address no longer crashes a batch, a FREG failure marks the owner instead of failing the request, an empty search gives `units: []`, and a SOAP fault is an error status instead of a 200. They go away when masseutsendelse's old Vue app is retired.

## Settings

| Setting | Required | What |
|---|---|---|
| `MATRIKKELAPI_BASEURL`, `MATRIKKELAPI_USERNAME`, `MATRIKKELAPI_PASSWORD` | yes | Matrikkel, e.g. `https://www.matrikkel.no` (with or without a trailing slash) |
| `AZF_FREG_URL`, `AZF_FREG_SCOPE` | for FREG | azf-freg's `/api/personer` and its scope |
| `TENANT_ID`, `AZF_FREG_CLIENT_ID`, `AZF_FREG_CLIENT_SECRET` | | Client secret for FREG tokens. Without it, the managed identity is used (`MANAGED_IDENTITY_CLIENT_ID` for a user-assigned one) |
| `BRREG_MAIN`, `BRREG_SUB` | | Default: data.brreg.no's `enheter` and `underenheter` |
| `MATRIKKEL_TIMEOUT_MS`, `FREG_TIMEOUT_MS`, `BRREG_TIMEOUT_MS`, `ENRICHMENT_CONCURRENCY` | | Default 30 s, 10 s, 10 s and 5 |
| `TEAMS_WEBHOOK_URL`, `BETTERSTACK_*`, `CONSOLE_*`, `APP_NAME` | | loglady |
| `AUTH_MOCK_ROLES` | | Local only: roles for requests without `X-MS-CLIENT-PRINCIPAL`. Refused in Azure |

The 1.x settings `APIKEY1`, `DEBUG` and `AZF_FREG_X_FUNCTIONS_KEY` are no longer used and can be removed.

## Development

```bash
npm ci
npm test          # lint, typecheck, unit tests, contract tests, build
npm start         # func start, needs local.settings.json with the settings above
```

The contract tests call the real handlers with msw standing in for Matrikkel, azf-freg, Brønnøysund and Entra ID.

## Deploying

`deploy-test.yml` deploys to TEST on push to `main`; `deploy-prod.yml` to PROD when a release is published.
