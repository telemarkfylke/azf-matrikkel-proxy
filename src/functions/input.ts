import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { loglady } from "../adapters/logging/loglady.ts";
import type { MatrikkelContext } from "../adapters/matrikkel/soap.ts";
import { MatrikkelError } from "../adapters/matrikkel/soap.ts";

// Request validation and responses shared by the functions.

export const MAX_POLYGON_POINTS = 10_000;
export const MAX_IDS = 1_000;

/** Matrikkel's coordinate systems: 24 = WGS 84 (EPSG:4326), 10 = ETRS89 UTM 32N (EPSG:25832) … */
const koordinatsystemKodeId = z.coerce.number().int().positive().max(1000);

export const contextInput = z
  .object({
    koordinatsystemKodeId: koordinatsystemKodeId.optional(),
    matrikkelContext: z
      .object({
        klientIdentifikasjon: z.string().max(200).optional(),
        koordinatsystemKodeId: koordinatsystemKodeId.optional(),
        locale: z.string().max(20).optional(),
        systemVersion: z.string().max(40).optional(),
        // Not z.coerce.boolean(): it makes the string "false" true
        brukOriginaleKoordinater: z.union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")]).optional()
      })
      .optional()
  })
  .loose();

/** The Matrikkel context from a request body. The coordinate system defaults to 24 (WGS 84). */
export function contextFrom(body: z.infer<typeof contextInput>): MatrikkelContext {
  const c = body.matrikkelContext ?? {};
  const ctx: MatrikkelContext = { koordinatsystemKodeId: body.koordinatsystemKodeId ?? c.koordinatsystemKodeId ?? 24 };
  if (c.klientIdentifikasjon) ctx.klientIdentifikasjon = c.klientIdentifikasjon;
  if (c.locale) ctx.locale = c.locale;
  if (c.systemVersion) ctx.systemVersion = c.systemVersion;
  if (c.brukOriginaleKoordinater !== undefined) ctx.brukOriginaleKoordinater = c.brukOriginaleKoordinater;
  return ctx;
}

export const polygonInput = z
  .array(z.tuple([z.coerce.number().finite(), z.coerce.number().finite()]).rest(z.unknown()))
  .min(3, { error: "A polygon needs at least 3 points" })
  .max(MAX_POLYGON_POINTS);

export const idsInput = z.array(z.coerce.number().int().positive()).min(1).max(MAX_IDS);

export async function readJson(request: HttpRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function ok(body: unknown): HttpResponseInit {
  return { status: 200, jsonBody: body };
}

export function problem(status: number, message: string): HttpResponseInit {
  return { status, jsonBody: { message } };
}

export function invalid(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): HttpResponseInit {
  return problem(400, issues.map((i) => `${i.path.map(String).join(".") || "body"}: ${i.message}`).join("; "));
}

/** Runs a handler; Matrikkel problems get their status, anything else a 500 without details. */
export async function guarded(context: InvocationContext, run: () => Promise<HttpResponseInit>): Promise<HttpResponseInit> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MatrikkelError) {
      // The cause (e.g. the network error) is logged here but never answered: it can name internal hosts
      const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
      loglady.warn("{FunctionName}: {Message}{Cause}", context.functionName, error.message, cause);
      return problem(error.status, error.message);
    }
    loglady.errorException(error, "{FunctionName} failed", context.functionName);
    return problem(500, "Something went wrong. Try again, or contact the service desk if it keeps happening.");
  }
}
