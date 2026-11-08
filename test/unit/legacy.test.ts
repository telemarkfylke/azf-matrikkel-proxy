import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { legacyStore, legacyUnits } from "../../src/domain/legacy.ts";
import { BRREG, golden, maskedFreg, silent, soap } from "../helpers.ts";

// The compatible endpoints must answer exactly what the JavaScript version answered for the same
// SOAP answer (the golden files), except where the difference is deliberate (domain/legacy.ts).

const brreg = { organisation: async (orgnr: string) => (BRREG[orgnr] ? structuredClone(BRREG[orgnr]) : undefined) };
const freg = { person: async (ssn: string) => maskedFreg(ssn) };
const deps = { freg, brreg, logger: silent };

describe("legacy /store answers like the JavaScript version", () => {
  for (const name of ["store-units", "store-one-unit", "store-teiger", "store-persons", "store-one-person", "store-empty"]) {
    test(name, async () => {
      const expected = golden(name);
      assert.equal(expected.status, 200);
      assert.deepEqual(await legacyStore(await soap(`${name}.xml`), deps), expected.body);
    });
  }

  test("a person with a protected address inside a list is handled instead of crashing", async () => {
    assert.match(golden("store-persons-protected").threw, /Cannot convert/, "the JavaScript version crashed here");
    const answer = await legacyStore(await soap("store-persons-protected.xml"), deps);
    const people = (answer.store[0] as Record<string, Record<string, unknown>>)["soap:Body"]?.return as Array<Record<string, unknown>>;
    const hidden = people.find((p) => p.nummer === "02029012345") as Record<string, unknown>;
    assert.equal(hidden.handleManually, true);
    assert.equal(hidden.postadresse, undefined, "Matrikkel's address is removed");
    assert.equal(hidden.bostedsadresse, undefined);
    assert.equal((hidden.freg as { bostedsadresse: { adressegradering: string } }).bostedsadresse.adressegradering, "strengtFortrolig");
    assert.ok(!JSON.stringify(answer).includes("Skjult adresse"), "the protected address from FREG is never in the answer");
    const kari = people.find((p) => p.nummer === "01019012345") as Record<string, unknown>;
    assert.equal(kari.handleManually, undefined);
  });

  test("a failed FREG lookup marks the owner instead of failing the request", async () => {
    const failing = { person: async () => Promise.reject(new Error("FREG is down")) };
    const answer = await legacyStore(await soap("store-persons.xml"), { ...deps, freg: failing });
    const people = (answer.store[0] as Record<string, Record<string, unknown>>)["soap:Body"]?.return as Array<Record<string, unknown>>;
    assert.deepEqual([people[0]?.handleManually, people[0]?.fregError, people[0]?.freg], [true, true, undefined]);
  });

  // A caller without matrikkel.read.freg, or an API without FREG, is refused by the handler (403/503)
  // instead of getting persons without FREG data: see the contract tests.
});

describe("legacy /matrikkelenheter", () => {
  test("many and one unit answer like the JavaScript version (ids as strings)", async () => {
    for (const name of ["find-many", "find-one"]) {
      assert.deepEqual(await legacyUnits(await soap(`${name}.xml`), deps, 24), golden(name).body, name);
    }
  });

  test("no units gives an empty list instead of an empty string", async () => {
    assert.equal(golden("find-empty").body.units, "");
    assert.deepEqual(await legacyUnits(await soap("find-empty.xml"), deps, 24), { units: [], koordinatsystemKodeId: 24 });
  });
});
