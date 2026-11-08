import { app, type HttpHandler } from "@azure/functions";
import { z } from "zod";
import { type Caller, withAuth } from "../adapters/http/auth.ts";
import { ROLES } from "../domain/roles.ts";
import { owners, plots, unitIdsInPolygon, units } from "../domain/service.ts";
import { getServices } from "../services.ts";
import { contextFrom, contextInput, guarded, idsInput, invalid, ok, polygonInput, problem, readJson } from "./input.ts";

// The typed endpoints. Lists are always lists, ids and numbers are numbers, and FREG/Brreg data is
// only added when asked for (?enrich=freg,brreg). FREG needs the matrikkel.read.freg role.

const audit = (endpoint: string, caller: Caller, count: number, extra = "") =>
  getServices().logger.info("{Endpoint} by {AppId} ({ObjectId}): {Count} {Extra}", endpoint, caller.appId ?? caller.name ?? "-", caller.objectId, count, extra);

const searchInput = contextInput.extend({ polygon: polygonInput });
const unitsInput = contextInput.extend({ ids: idsInput, positions: z.boolean().optional() });
const idsBody = contextInput.extend({ ids: idsInput });

export const searchUnits: HttpHandler = withAuth([ROLES.read], (request, context, caller) =>
  guarded(context, async () => {
    const parsed = searchInput.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error.issues);
    const unitIds = await unitIdsInPolygon(getServices(), parsed.data.polygon as Array<[number, number]>, contextFrom(parsed.data));
    audit("units/search", caller, unitIds.length);
    return ok({ unitIds });
  })
);

export const getUnits: HttpHandler = withAuth([ROLES.read], (request, context, caller) =>
  guarded(context, async () => {
    const parsed = unitsInput.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error.issues);
    const result = await units(getServices(), parsed.data.ids, contextFrom(parsed.data), { positions: parsed.data.positions ?? false });
    audit("units", caller, result.length);
    return ok({ units: result });
  })
);

export const getPlots: HttpHandler = withAuth([ROLES.read], (request, context, caller) =>
  guarded(context, async () => {
    const parsed = idsBody.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error.issues);
    const result = await plots(getServices(), parsed.data.ids, contextFrom(parsed.data));
    audit("plots", caller, result.length);
    return ok({ plots: result });
  })
);

export const getOwners: HttpHandler = withAuth([ROLES.read], (request, context, caller) =>
  guarded(context, async () => {
    const parsed = idsBody.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error.issues);
    const enrich = new Set(
      (request.query.get("enrich") ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    );
    const unknown = [...enrich].filter((e) => e !== "freg" && e !== "brreg");
    if (unknown.length > 0) return problem(400, `Unknown enrichment: ${unknown.join(", ")}. Use freg and/or brreg.`);
    if (enrich.has("freg") && !caller.roles.has(ROLES.readFreg)) return problem(403, "FREG data needs the matrikkel.read.freg role");
    const services = getServices();
    if (enrich.has("freg") && !services.freg) return problem(503, "FREG is not configured for this API");
    const result = await owners(services, parsed.data.ids, contextFrom(parsed.data), { freg: enrich.has("freg"), brreg: enrich.has("brreg") });
    audit("owners", caller, result.length, enrich.size ? `enrich=${[...enrich].join(",")}` : "");
    return ok({ owners: result });
  })
);

app.http("v2SearchUnits", { route: "v2/units/search", methods: ["POST"], authLevel: "anonymous", handler: searchUnits });
app.http("v2Units", { route: "v2/units", methods: ["POST"], authLevel: "anonymous", handler: getUnits });
app.http("v2Plots", { route: "v2/plots", methods: ["POST"], authLevel: "anonymous", handler: getPlots });
app.http("v2Owners", { route: "v2/owners", methods: ["POST"], authLevel: "anonymous", handler: getOwners });
