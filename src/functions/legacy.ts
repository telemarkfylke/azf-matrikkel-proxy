import { app, type HttpHandler } from "@azure/functions";
import { z } from "zod";
import { withAuth } from "../adapters/http/auth.ts";
import { DOMAIN_NAMESPACE } from "../adapters/matrikkel/soap.ts";
import { legacyStore, legacyUnits } from "../domain/legacy.ts";
import { ROLES } from "../domain/roles.ts";
import { getServices } from "../services.ts";
import { contextFrom, contextInput, guarded, invalid, MAX_IDS, ok, polygonInput, readJson } from "./input.ts";

// POST /matrikkelenheter and POST /store with the JavaScript version's answer shape (domain/legacy.ts),
// for callers that still read it. FREG data is only added for callers with matrikkel.read.freg.
// Remove after the switch to the new frontend.

const storeInput = contextInput.extend({
  items: z
    .array(
      z
        .object({
          type: z.string().regex(/^[A-Za-z]+Id$/, { error: "must be an id type, e.g. MatrikkelenhetId" }),
          namespace: z.string().regex(DOMAIN_NAMESPACE).optional(),
          _namespace: z.string().regex(DOMAIN_NAMESPACE).optional(),
          value: z.union([z.string().regex(/^\d+$/), z.number().int().positive()])
        })
        .refine((item) => item.namespace || item._namespace, { error: "namespace is missing" })
    )
    .min(1)
    .max(MAX_IDS)
});

export const legacyFindUnits: HttpHandler = withAuth([ROLES.read], (request, context, caller) =>
  guarded(context, async () => {
    const body = await readJson(request);
    const parsed = contextInput.extend({ polygon: polygonInput }).safeParse(body);
    if (!parsed.success) return invalid(parsed.error.issues);
    const services = getServices();
    const ctx = contextFrom(parsed.data);
    const answer = await legacyUnits(
      await services.matrikkel.findUnits(parsed.data.polygon as Array<[number, number]>, ctx),
      services,
      (body as { koordinatsystemKodeId?: unknown }).koordinatsystemKodeId
    );
    services.logger.info("matrikkelenheter by {AppId} ({ObjectId}): {Count}", caller.appId ?? caller.name ?? "-", caller.objectId, (answer.units as unknown[]).length);
    return ok(answer);
  })
);

export const legacyGetObjects: HttpHandler = withAuth([ROLES.read], (request, context, caller) =>
  guarded(context, async () => {
    const parsed = storeInput.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error.issues);
    const services = getServices();
    const items = parsed.data.items.map((item) => ({ type: item.type, namespace: (item.namespace ?? item._namespace) as string, value: item.value }));
    const withFreg = caller.roles.has(ROLES.readFreg);
    const answer = await legacyStore(await services.matrikkel.getObjects(items, contextFrom(parsed.data)), {
      brreg: services.brreg,
      logger: services.logger,
      ...(withFreg && services.freg ? { freg: services.freg } : {})
    });
    services.logger.info("store by {AppId} ({ObjectId}): {Count} ids{Freg}", caller.appId ?? caller.name ?? "-", caller.objectId, items.length, withFreg ? " with FREG" : "");
    return ok(answer);
  })
);

app.http("matrikkelenheter", { route: "matrikkelenheter", methods: ["POST"], authLevel: "anonymous", handler: legacyFindUnits });
app.http("storeService", { route: "store", methods: ["POST"], authLevel: "anonymous", handler: legacyGetObjects });
