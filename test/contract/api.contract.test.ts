import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { calls, context, FREG, failures, READ, request, reset } from "./setup.ts";

// Imported after setup.ts has set the environment
const { searchUnits, getUnits, getPlots, getOwners } = await import("../../src/functions/v2.ts");
const { legacyFindUnits, legacyGetObjects } = await import("../../src/functions/legacy.ts");
const { resetServices } = await import("../../src/services.ts");

const ctx = { koordinatsystemKodeId: 24, matrikkelContext: { klientIdentifikasjon: "contract" } };
const polygon = [
  [9.6, 59.2],
  [9.62, 59.2],
  [9.62, 59.21],
  [9.6, 59.2]
];
const json = (response: unknown) => (response as { jsonBody?: unknown }).jsonBody as Record<string, unknown>;

beforeEach(reset);

describe("auth", () => {
  test("no principal is 401, a caller without matrikkel.read is 403", async () => {
    assert.equal((await searchUnits(request("v2/units/search", { ...ctx, polygon }, null), context)).status, 401);
    assert.equal((await searchUnits(request("v2/units/search", { ...ctx, polygon }, ["some.other.role"]), context)).status, 403);
    assert.equal(calls.length, 0, "Matrikkel is never asked");
  });

  test("FREG data needs matrikkel.read.freg", async () => {
    const res = await getOwners(Object.assign(request("v2/owners?enrich=freg", { ...ctx, ids: [501] }, READ), {}), context);
    assert.equal(res.status, 403);
  });
});

describe("v2", () => {
  test("units/search: the ids inside a polygon, as numbers", async () => {
    const res = await searchUnits(request("v2/units/search", { ...ctx, polygon }), context);
    assert.equal(res.status, 200);
    assert.deepEqual(json(res), { unitIds: [101, 102, 103] });
    const soap = calls[0]?.body ?? "";
    assert.match(soap, /<geom:x>9\.62<\/geom:x><geom:y>59\.21<\/geom:y>/);
    assert.match(soap, /<dom:klientIdentifikasjon>contract<\/dom:klientIdentifikasjon>/);
    assert.equal(calls[0]?.headers.get("authorization"), `Basic ${Buffer.from("contract-user:contract-password").toString("base64")}`);
  });

  test("units/search refuses bad input before asking Matrikkel", async () => {
    assert.equal((await searchUnits(request("v2/units/search", { ...ctx, polygon: [[1, 2]] }), context)).status, 400);
    assert.equal((await searchUnits(request("v2/units/search", { koordinatsystemKodeId: "<x/>", polygon }), context)).status, 400);
    assert.equal(calls.length, 0);
  });

  test("units with positions: one extra call for the main plots", async () => {
    const res = await getUnits(request("v2/units", { ...ctx, ids: [101, 102, 103], positions: true }), context);
    assert.equal(res.status, 200);
    const units = json(res).units as Array<{ id: number; position?: unknown; ownerships: unknown[] }>;
    assert.deepEqual(
      units.map((u) => [u.id, u.position]),
      [
        [101, { x: 9.6105, y: 59.2052 }],
        [102, { x: 9.6142, y: 59.2031 }],
        [103, undefined]
      ]
    );
    assert.deepEqual(
      calls.map((c) => c.service),
      ["matrikkel:StoreServiceWS", "matrikkel:StoreServiceWS"]
    );
    assert.match(calls[1]?.body ?? "", /TeigId"><dom:value>7001<.*TeigId"><dom:value>7002</s, "the main plot of 101 is 7001, not 7009");
  });

  test("plots", async () => {
    const res = await getPlots(request("v2/plots", { ...ctx, ids: [7001, 7002] }), context);
    assert.deepEqual(
      (json(res).plots as Array<{ id: number }>).map((p) => p.id),
      [7001, 7002]
    );
  });

  test("owners without enrichment ask neither FREG nor Brreg", async () => {
    const res = await getOwners(request("v2/owners", { ...ctx, ids: [501, 503] }), context);
    assert.equal(res.status, 200);
    assert.deepEqual(
      (json(res).owners as Array<{ kind: string }>).map((o) => o.kind),
      ["person", "organisation"]
    );
    assert.deepEqual(
      calls.map((c) => c.service),
      ["matrikkel:StoreServiceWS"]
    );
  });

  test("owners with FREG and Brreg: FREG gets a token and includeFortrolig false; a protected address is never sent", async () => {
    const req = request("v2/owners?enrich=freg,brreg", { ...ctx, ids: [501, 502] }, FREG);
    const res = await getOwners(req, context);
    assert.equal(res.status, 200, JSON.stringify(json(res)));
    const owners = json(res).owners as Array<{ number: string; freg: { protectedAddress: boolean; postalAddress?: unknown } }>;
    assert.equal(owners.find((o) => o.number === "02029012345")?.freg.protectedAddress, true);
    assert.ok(!JSON.stringify(owners).includes("Skjult adresse"));
    const fregCall = calls.find((c) => c.service === "freg");
    assert.equal(fregCall?.headers.get("authorization"), "Bearer contract-token-for:api://freg-contract/.default");
    assert.equal(JSON.parse(fregCall?.body ?? "{}").includeFortrolig, false);

    const orgs = await getOwners(request("v2/owners?enrich=brreg", { ...ctx, ids: [503] }, READ), context);
    assert.equal((json(orgs).owners as Array<{ brreg: { deleted: boolean } }>)[0]?.brreg.deleted, true);
  });

  test("a strengt fortrolig owner gets no address at all, neither Matrikkel's nor FREG's", async () => {
    const res = await getOwners(request("v2/owners?enrich=freg", { ...ctx, ids: [501, 502] }, FREG), context);
    assert.equal(res.status, 200);
    const owners = json(res).owners as Array<{ id: number; postalAddress?: unknown; freg: { protectedAddress: boolean; postalAddress?: unknown } }>;
    const hidden = owners.find((o) => o.id === 502);
    assert.equal(hidden?.freg.protectedAddress, true);
    assert.equal(hidden?.postalAddress, undefined);
    assert.equal(hidden?.freg.postalAddress, undefined);
    const answer = JSON.stringify(json(res));
    for (const address of ["Skjult vei 2", "Skjult adresse", "Postboks 1", "Strengt fortrolig adresse"]) assert.ok(!answer.includes(address), address);
    assert.ok(owners.find((o) => o.id === 501)?.postalAddress, "an unprotected owner keeps Matrikkel's address");
  });

  test('brukOriginaleKoordinater: the string "false" is false', async () => {
    await searchUnits(request("v2/units/search", { ...ctx, matrikkelContext: { brukOriginaleKoordinater: "false" }, polygon }), context);
    assert.match(calls[0]?.body ?? "", /<dom:brukOriginaleKoordinater>false</);
    reset();
    await searchUnits(request("v2/units/search", { ...ctx, matrikkelContext: { brukOriginaleKoordinater: "true" }, polygon }), context);
    assert.match(calls[0]?.body ?? "", /<dom:brukOriginaleKoordinater>true</);
    assert.equal((await searchUnits(request("v2/units/search", { ...ctx, matrikkelContext: { brukOriginaleKoordinater: "yes" }, polygon }), context)).status, 400);
  });

  test("a FREG failure marks that owner and the rest are answered", async () => {
    failures.freg.add("01019012345");
    const res = await getOwners(request("v2/owners?enrich=freg", { ...ctx, ids: [501, 502] }, FREG), context);
    assert.equal(res.status, 200);
    const owners = json(res).owners as Array<{ number: string; freg: Record<string, unknown> }>;
    assert.ok(owners.find((o) => o.number === "01019012345")?.freg.error);
    assert.equal(owners.find((o) => o.number === "02029012345")?.freg.found, true);
  });

  test("a SOAP fault is an error status, not a 200", async () => {
    const res = await getUnits(request("v2/units", { ...ctx, ids: [666] }), context);
    assert.equal(res.status, 400);
    assert.match(String(json(res).message), /Ugyldig koordinatsystem/);
  });

  test("an unknown enrichment is refused", async () => {
    assert.equal((await getOwners(request("v2/owners?enrich=dsf", { ...ctx, ids: [501] }), context)).status, 400);
  });
});

describe("compatible endpoints", () => {
  test("POST /matrikkelenheter answers { units: string[], koordinatsystemKodeId }", async () => {
    const res = await legacyFindUnits(request("matrikkelenheter", { ...ctx, polygon }), context);
    assert.deepEqual(json(res), { units: ["101", "102", "103"], koordinatsystemKodeId: 24 });
  });

  test("POST /store answers the old shape, with FREG for callers that may have it", async () => {
    const items = [501, 503].map((value) => ({ type: "PersonId", namespace: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/person", value }));
    const res = await legacyGetObjects(request("store", { ...ctx, items }, FREG), context);
    assert.equal(res.status, 200);
    const people = ((json(res).store as Array<Record<string, Record<string, unknown>>>)[0]?.["soap:Body"]?.return ?? []) as Array<Record<string, unknown>>;
    assert.deepEqual(
      people.map((p) => (p.id as { value: string }).value),
      ["501", "503"]
    );
    assert.ok(people[0]?.freg);
    assert.ok(people[1]?.brreg);
  });

  test("POST /store without matrikkel.read.freg is 403, not an answer silently without FREG data", async () => {
    const items = [{ type: "PersonId", namespace: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/person", value: 501 }];
    const res = await legacyGetObjects(request("store", { ...ctx, items }, READ), context);
    assert.equal(res.status, 403);
    assert.equal(json(res).message, "FREG data needs the matrikkel.read.freg role");
    assert.equal(calls.length, 0, "neither Matrikkel nor FREG is asked");
  });

  test("POST /store is 503 when FREG isn't configured; /matrikkelenheter doesn't need FREG", async () => {
    const saved = process.env.AZF_FREG_URL;
    delete process.env.AZF_FREG_URL;
    resetServices();
    try {
      const items = [{ type: "PersonId", namespace: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/person", value: 501 }];
      assert.equal((await legacyGetObjects(request("store", { ...ctx, items }, FREG), context)).status, 503);
      assert.equal(calls.length, 0);
      assert.equal((await legacyFindUnits(request("matrikkelenheter", { ...ctx, polygon }, READ), context)).status, 200);
    } finally {
      process.env.AZF_FREG_URL = saved;
      resetServices();
    }
  });

  test("POST /store refuses ids and types that could change the SOAP request", async () => {
    const bad = [{ type: "PersonId><x", namespace: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/person", value: 1 }];
    assert.equal((await legacyGetObjects(request("store", { ...ctx, items: bad }, FREG), context)).status, 400);
    const badNs = [{ type: "PersonId", namespace: "http://evil.test", value: 1 }];
    assert.equal((await legacyGetObjects(request("store", { ...ctx, items: badNs }, FREG), context)).status, 400);
    assert.equal(calls.length, 0);
  });
});
