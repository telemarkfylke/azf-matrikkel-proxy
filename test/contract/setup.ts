// The contract tests call the real HTTP handlers. msw stands in for Matrikkel (SOAP), azf-freg,
// Brønnøysund and Entra ID's token endpoint, so the whole path is exercised: auth, validation,
// SOAP request, parsing, enrichment and the answer.

import { HttpRequest } from "@azure/functions";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { BRREG, maskedFreg, soapText } from "../helpers.ts";

export const TENANT_ID = "00000000-0000-0000-0000-00000000c0de";

Object.assign(process.env, {
  MATRIKKELAPI_BASEURL: "https://matrikkel.contract.test/",
  MATRIKKELAPI_USERNAME: "contract-user",
  MATRIKKELAPI_PASSWORD: "contract-password",
  AZF_FREG_URL: "https://freg.contract.test/api/personer",
  AZF_FREG_SCOPE: "api://freg-contract",
  TENANT_ID,
  AZF_FREG_CLIENT_ID: "contract-client",
  AZF_FREG_CLIENT_SECRET: "contract-secret",
  BRREG_MAIN: "https://brreg.contract.test/enheter",
  BRREG_SUB: "https://brreg.contract.test/underenheter",
  CONSOLE_ENABLED: "false"
});

export type Call = { service: string; body: string; headers: Headers };
export const calls: Call[] = [];
export const failures = { freg: new Set<string>() };

/** Which fixture answers a getObjects request, from the ids in it. */
function storeFixture(body: string): string {
  if (body.includes("TeigId")) return "store-teiger.xml";
  if (body.includes("PersonId")) return body.includes(">502<") ? "store-persons-protected.xml" : body.includes(">501<") ? "store-persons.xml" : "store-one-person.xml";
  if (body.includes(">999<")) return "store-empty.xml";
  if (body.includes(">666<")) return "fault.xml";
  return body.includes(">101<") ? "store-units.xml" : "store-one-unit.xml";
}

const xml = (text: string, status = 200) => new HttpResponse(text, { status, headers: { "Content-Type": "text/xml" } });

export const server = setupServer(
  http.post("https://matrikkel.contract.test/matrikkelapi/wsapi/v1/:service", async ({ request, params }) => {
    const body = await request.text();
    calls.push({ service: `matrikkel:${params.service}`, body, headers: request.headers });
    if (params.service === "MatrikkelenhetServiceWS") return xml(soapText(body.includes("<geom:x>0</geom:x>") ? "find-empty.xml" : "find-many.xml"));
    const fixture = storeFixture(body);
    return xml(soapText(fixture), fixture === "fault.xml" ? 500 : 200);
  }),
  http.post("https://freg.contract.test/api/personer", async ({ request }) => {
    const body = await request.text();
    calls.push({ service: "freg", body, headers: request.headers });
    const { ssn } = JSON.parse(body) as { ssn: string };
    if (failures.freg.has(ssn)) return new HttpResponse(null, { status: 500 });
    return HttpResponse.json(maskedFreg(ssn) ?? { foedselsEllerDNummer: null, status: "fant ingen person" });
  }),
  http.get("https://brreg.contract.test/:kind/:orgnr", ({ request, params }) => {
    calls.push({ service: `brreg:${params.kind}`, body: "", headers: request.headers });
    const unit = params.kind === "enheter" ? BRREG[String(params.orgnr)] : undefined;
    return unit ? HttpResponse.json(unit) : new HttpResponse(null, { status: 404 });
  }),
  http.get("https://login.microsoftonline.com/common/discovery/instance", () =>
    HttpResponse.json({
      tenant_discovery_endpoint: `https://login.microsoftonline.com/${TENANT_ID}/v2.0/.well-known/openid-configuration`,
      "api-version": "1.1",
      metadata: [{ preferred_network: "login.microsoftonline.com", preferred_cache: "login.windows.net", aliases: ["login.microsoftonline.com", "login.windows.net", "sts.windows.net"] }]
    })
  ),
  http.get("https://login.microsoftonline.com/:tenant/v2.0/.well-known/openid-configuration", ({ params }) =>
    HttpResponse.json({
      issuer: `https://login.microsoftonline.com/${params.tenant}/v2.0`,
      authorization_endpoint: `https://login.microsoftonline.com/${params.tenant}/oauth2/v2.0/authorize`,
      token_endpoint: `https://login.microsoftonline.com/${params.tenant}/oauth2/v2.0/token`,
      end_session_endpoint: `https://login.microsoftonline.com/${params.tenant}/oauth2/v2.0/logout`,
      jwks_uri: `https://login.microsoftonline.com/${params.tenant}/discovery/v2.0/keys`
    })
  ),
  http.post("https://login.microsoftonline.com/:tenant/oauth2/v2.0/token", async ({ request }) => {
    const scope = new URLSearchParams(await request.text()).get("scope");
    return HttpResponse.json({ token_type: "Bearer", expires_in: 3600, ext_expires_in: 3600, access_token: `contract-token-for:${scope}` });
  })
);

server.listen({ onUnhandledRequest: "error" });

/** The X-MS-CLIENT-PRINCIPAL App Service adds for an app calling with these roles. */
export function principal(roles: string[], appId = "masseutsendelse-api"): string {
  const claims = [{ typ: "oid", val: "11111111-2222-3333-4444-555555555555" }, { typ: "appid", val: appId }, ...roles.map((val) => ({ typ: "roles", val }))];
  return Buffer.from(JSON.stringify({ auth_typ: "aad", claims })).toString("base64");
}

export const READ = ["matrikkel.read"];
export const FREG = ["matrikkel.read", "matrikkel.read.freg"];

export function request(path: string, body: unknown, roles: string[] | null = READ): HttpRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (roles) headers["x-ms-client-principal"] = principal(roles);
  return new HttpRequest({ method: "POST", url: `https://matrikkel-contract.api.test/api/${path}`, headers, body: { string: JSON.stringify(body) } });
}

export const context = { functionName: "contract", log() {}, error() {}, warn() {}, info() {} } as never;

export function reset(): void {
  calls.length = 0;
  failures.freg.clear();
}
