import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { type AuthSettings, readAuthSettings } from "../../config/settings.ts";
import { effectiveRoles, type Role } from "../../domain/roles.ts";
import type { Logger } from "../../ports.ts";
import { loglady } from "../logging/loglady.ts";

// Authentication and authorisation, the same model as azf-masseutsendelse-api:
// App Service built-in authentication validates the token (require_authentication, Return401 in
// Terraform) and passes the caller in X-MS-CLIENT-PRINCIPAL. This code checks the app role, and fails
// closed: in Azure, with built-in authentication off, every request is refused.
//
// Every call is logged with the caller's app id or object id, for auditing (Matrikkel and FREG data).

export type Caller = { objectId: string; appId?: string; name?: string; roles: ReadonlySet<Role> };

type ClientPrincipal = { role_typ?: string; claims?: Array<{ typ: string; val: string }> };

const CLAIM = {
  objectId: ["oid", "http://schemas.microsoft.com/identity/claims/objectidentifier"],
  role: ["roles", "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"],
  appId: ["appid", "azp"],
  name: ["name", "upn", "preferred_username", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn"]
} as const;

/** The caller from the base64 JSON principal header, or undefined when it is missing or malformed. */
export function callerFromHeader(header: string | null | undefined): Caller | undefined {
  if (!header) return undefined;
  let principal: ClientPrincipal;
  try {
    principal = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as ClientPrincipal;
  } catch {
    return undefined;
  }
  if (!Array.isArray(principal?.claims)) return undefined;
  const claims = principal.claims.filter((c) => typeof c?.typ === "string" && typeof c.val === "string");
  const all = (types: readonly string[]) => claims.filter((c) => types.includes(c.typ)).map((c) => c.val);
  const first = (types: readonly string[]) => all(types)[0]?.trim() || undefined;
  const objectId = first(CLAIM.objectId);
  if (!objectId) return undefined;
  const roleTypes = principal.role_typ ? [...CLAIM.role, principal.role_typ] : CLAIM.role;
  return { objectId, appId: first(CLAIM.appId), name: first(CLAIM.name), roles: effectiveRoles(all(roleTypes)) };
}

export type Denied = { ok: false; status: 401 | 403; reason: string };

export function authenticate(headers: Headers, settings: AuthSettings): { ok: true; caller: Caller } | Denied {
  if (settings.runningInAzure && !settings.platformAuthEnabled) return { ok: false, status: 401, reason: "built-in authentication is off (WEBSITE_AUTH_ENABLED is not True)" };
  const header = headers.get("x-ms-client-principal");
  if (!header) {
    if (settings.mockRoles && !settings.runningInAzure) return { ok: true, caller: { objectId: "local", name: "local", roles: effectiveRoles(settings.mockRoles) } };
    return { ok: false, status: 401, reason: "no client principal" };
  }
  const caller = callerFromHeader(header);
  return caller ? { ok: true, caller } : { ok: false, status: 401, reason: "invalid client principal" };
}

export type AuthorizedHandler = (request: HttpRequest, context: InvocationContext, caller: Caller) => Promise<HttpResponseInit>;

let cachedSettings: AuthSettings | undefined;
export type AuthDependencies = { settings: () => AuthSettings; logger: Logger };
const defaults: AuthDependencies = {
  settings: () => {
    cachedSettings ??= readAuthSettings();
    return cachedSettings;
  },
  logger: loglady
};

/** Runs the handler only for an authenticated caller with one of the roles. */
export function withAuth(roles: readonly Role[], handler: AuthorizedHandler, dependencies: AuthDependencies = defaults): HttpHandler {
  return async (request, context) => {
    const result = authenticate(request.headers, dependencies.settings());
    if (!result.ok) {
      dependencies.logger.warn("{FunctionName}: {Status} {Reason}", context.functionName, result.status, result.reason);
      return { status: result.status, jsonBody: { message: result.status === 401 ? "Unauthorized" : "Forbidden" } };
    }
    if (!roles.some((role) => result.caller.roles.has(role))) {
      dependencies.logger.warn(
        "{FunctionName}: 403 missing role, needs one of {Roles} (caller {AppId} {ObjectId})",
        context.functionName,
        roles.join(", "),
        result.caller.appId ?? "-",
        result.caller.objectId
      );
      return { status: 403, jsonBody: { message: "Forbidden" } };
    }
    return handler(request, context, result.caller);
  };
}
