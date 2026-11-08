import { z } from "zod";

// All settings the code reads, validated once. A missing or invalid setting stops the function with
// a message that names the setting (never its value). The names are the ones the Function App
// already has, so the switch from the JavaScript version needs no setting changes.

const KEY_VAULT_REFERENCE = "@Microsoft.KeyVault(";

/** Unset app settings are empty strings in Azure; an unresolved Key Vault reference counts as unset too. */
function unset(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" || trimmed.startsWith(KEY_VAULT_REFERENCE) ? undefined : value;
}

const optional = z.preprocess(unset, z.string().trim().optional());
const required = z.preprocess(unset, z.string({ error: "is missing (or its Key Vault reference isn't resolved)" }).trim().min(1, { error: "is missing" }));
const positiveInt = (fallback: number) => z.preprocess(unset, z.coerce.number().int().positive().default(fallback));

const envSchema = z.object({
  // Kartverket's Matrikkel API (HTTP Basic)
  MATRIKKELAPI_BASEURL: required,
  MATRIKKELAPI_USERNAME: required,
  MATRIKKELAPI_PASSWORD: required,
  MATRIKKEL_TIMEOUT_MS: positiveInt(30_000),

  // azf-freg. Without AZF_FREG_URL, FREG enrichment is off (the endpoints answer 503 when asked for it).
  AZF_FREG_URL: optional,
  AZF_FREG_SCOPE: optional,
  FREG_TIMEOUT_MS: positiveInt(10_000),

  // Brønnøysundregistrene (public)
  BRREG_MAIN: optional,
  BRREG_SUB: optional,
  BRREG_TIMEOUT_MS: positiveInt(10_000),

  /** How many FREG/Brreg lookups run at the same time */
  ENRICHMENT_CONCURRENCY: positiveInt(5),

  // Outbound identity for FREG: client secret while set (today), otherwise managed identity
  TENANT_ID: optional,
  AZF_FREG_CLIENT_ID: optional,
  AZF_FREG_CLIENT_SECRET: optional,
  MANAGED_IDENTITY_CLIENT_ID: optional,

  // Incoming requests, see adapters/http/auth.ts
  IDENTITY_ENDPOINT: optional,
  WEBSITE_AUTH_ENABLED: optional,
  WEBSITE_INSTANCE_ID: optional,
  /** Local only: comma-separated roles for requests without X-MS-CLIENT-PRINCIPAL */
  AUTH_MOCK_ROLES: optional
});

export type Settings = {
  matrikkel: { baseUrl: string; username: string; password: string; timeoutMs: number };
  freg?: { url: string; scope: string; timeoutMs: number };
  brreg: { mainUrl: string; subUrl: string; timeoutMs: number };
  concurrency: number;
  identity: { tenantId?: string; clientId?: string; clientSecret?: string; managedIdentityClientId?: string; runningInAzure: boolean };
};

export type AuthSettings = {
  runningInAzure: boolean;
  platformAuthEnabled: boolean;
  /** Local only: roles for a request without a principal header */
  mockRoles?: string[];
};

export class SettingsError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid settings: ${problems.join("; ")}`);
    this.name = "SettingsError";
    this.problems = problems;
  }
}

function parse<T extends z.ZodType>(schema: T, env: NodeJS.ProcessEnv): z.infer<T> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new SettingsError(parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`));
  return parsed.data;
}

const AUTH_KEYS = { IDENTITY_ENDPOINT: true, WEBSITE_AUTH_ENABLED: true, WEBSITE_INSTANCE_ID: true, AUTH_MOCK_ROLES: true } as const;

/** Only the settings for incoming requests, so authentication runs before anything else can fail. */
export function readAuthSettings(env: NodeJS.ProcessEnv = process.env): AuthSettings {
  const e = parse(envSchema.pick(AUTH_KEYS), env);
  const runningInAzure = Boolean(e.WEBSITE_INSTANCE_ID || e.IDENTITY_ENDPOINT);
  if (runningInAzure && e.AUTH_MOCK_ROLES) throw new SettingsError(["AUTH_MOCK_ROLES is not allowed in Azure"]);
  const auth: AuthSettings = { runningInAzure, platformAuthEnabled: e.WEBSITE_AUTH_ENABLED?.toLowerCase() === "true" };
  if (e.AUTH_MOCK_ROLES) {
    auth.mockRoles = e.AUTH_MOCK_ROLES.split(",")
      .map((r) => r.trim())
      .filter(Boolean);
  }
  return auth;
}

export function readSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const e = parse(envSchema, env);
  if (e.AZF_FREG_URL && !e.AZF_FREG_SCOPE) throw new SettingsError(["AZF_FREG_SCOPE is missing (AZF_FREG_URL needs it)"]);
  const settings: Settings = {
    // The JavaScript version wanted a trailing slash on the base URL; both forms work here
    matrikkel: { baseUrl: e.MATRIKKELAPI_BASEURL.replace(/\/+$/, ""), username: e.MATRIKKELAPI_USERNAME, password: e.MATRIKKELAPI_PASSWORD, timeoutMs: e.MATRIKKEL_TIMEOUT_MS },
    brreg: {
      mainUrl: (e.BRREG_MAIN ?? "https://data.brreg.no/enhetsregisteret/api/enheter").replace(/\/+$/, ""),
      subUrl: (e.BRREG_SUB ?? "https://data.brreg.no/enhetsregisteret/api/underenheter").replace(/\/+$/, ""),
      timeoutMs: e.BRREG_TIMEOUT_MS
    },
    concurrency: e.ENRICHMENT_CONCURRENCY,
    identity: {
      tenantId: e.TENANT_ID,
      clientId: e.AZF_FREG_CLIENT_ID,
      clientSecret: e.AZF_FREG_CLIENT_SECRET,
      managedIdentityClientId: e.MANAGED_IDENTITY_CLIENT_ID,
      runningInAzure: Boolean(e.WEBSITE_INSTANCE_ID || e.IDENTITY_ENDPOINT)
    }
  };
  if (e.AZF_FREG_URL && e.AZF_FREG_SCOPE) settings.freg = { url: e.AZF_FREG_URL, scope: e.AZF_FREG_SCOPE, timeoutMs: e.FREG_TIMEOUT_MS };
  return settings;
}
