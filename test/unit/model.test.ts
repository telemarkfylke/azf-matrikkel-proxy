import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mapLimit, memoize } from "../../src/adapters/enrichment/limit.ts";
import { soapBody } from "../../src/adapters/matrikkel/soap.ts";
import { type FregInfo, foundUnitIds, mainPlotId, storeItems, toOwner, toPlot, toUnit } from "../../src/domain/model.ts";
import { toBrregInfo, toFregInfo } from "../../src/domain/service.ts";
import { BRREG, maskedFreg, soap } from "../helpers.ts";

describe("units, plots and owners from Matrikkel's answers", () => {
  test("units: numbers are numbers, lists are lists, whatever xml2js made of them", async () => {
    const units = storeItems(soapBody(await soap("store-units.xml"))).map(toUnit);
    assert.deepEqual(units[0], {
      id: 101,
      type: "Grunneiendom",
      expired: false,
      ownerships: [
        { id: 9001, type: "TinglystEierforhold", ownerId: 501, share: { numerator: 1, denominator: 2 } },
        { id: 9002, type: "TinglystEierforhold", ownerId: 502, share: { numerator: 1, denominator: 2 } }
      ],
      plots: [
        { id: 7009, main: false },
        { id: 7001, main: true }
      ],
      matrikkelnummer: { kommunenummer: "4003", gardsnummer: 10, bruksnummer: 5, festenummer: 0, seksjonsnummer: 0 },
      bruksnavn: "Nordre Ås"
    });
    assert.deepEqual(
      units[1]?.ownerships.map((o) => o.ownerId),
      [503],
      "one ownership is still a list"
    );
    assert.deepEqual([units[2]?.ownerships, units[2]?.plots], [[], []], "none is an empty list");
    assert.equal(mainPlotId(units[0] as never), 7001, "the main plot, not the first");
    assert.equal(mainPlotId(units[1] as never), 7002);
  });

  test("one unit in the answer is still a list of one", async () => {
    assert.deepEqual(
      storeItems(soapBody(await soap("store-one-unit.xml"))).map((n) => toUnit(n).id),
      [102]
    );
    assert.deepEqual(storeItems(soapBody(await soap("store-empty.xml"))), []);
  });

  test("plots have their representative point", async () => {
    const plots = storeItems(soapBody(await soap("store-teiger.xml"))).map(toPlot);
    assert.deepEqual(plots[0], { id: 7001, area: 1532.4, position: { x: 9.6105, y: 59.2052 } });
  });

  test("owners: person or organisation, with Matrikkel's postal address", async () => {
    const owners = storeItems(soapBody(await soap("store-persons.xml"))).map(toOwner);
    assert.deepEqual(owners[0], {
      id: 501,
      kind: "person",
      type: "FysiskPerson",
      number: "01019012345",
      name: "Nordmann Kari",
      firstName: "Kari",
      lastName: "Nordmann",
      postalAddress: { lines: ["Gata 1"], postnummeromradeId: "3700" }
    });
    assert.deepEqual([owners[1]?.kind, owners[1]?.organisationForm, owners[1]?.postalAddress?.lines], ["organisation", "FYLK", ["Fylkesbakken 10"]]);
  });

  test("unit ids from a polygon search: many, one or none", async () => {
    assert.deepEqual(foundUnitIds(soapBody(await soap("find-many.xml"))), [101, 102, 103]);
    assert.deepEqual(foundUnitIds(soapBody(await soap("find-one.xml"))), [101]);
    assert.deepEqual(foundUnitIds(soapBody(await soap("find-empty.xml"))), []);
  });
});

describe("FREG and Brreg", () => {
  test("FREG: the grading, never a protected address", () => {
    assert.deepEqual(toFregInfo(maskedFreg("01019012345")), {
      found: true,
      status: "bosatt",
      canBeContacted: true,
      dead: false,
      protectedAddress: false,
      addressGrading: "ugradert",
      name: "Kari Nordmann",
      postalAddress: { lines: ["Gata 1"], postnummer: "3700", poststed: "SKIEN" }
    });
    type Found = Extract<FregInfo, { found: true }>;
    const hidden = toFregInfo(maskedFreg("02029012345")) as Found;
    assert.equal(hidden.protectedAddress, true);
    assert.equal(hidden.postalAddress, undefined);
    const klient = toFregInfo({ foedselsEllerDNummer: "1", status: "bosatt", bostedsadresse: { adressegradering: "KLIENTADRESSE" } }) as Found;
    assert.equal(klient.protectedAddress, true, "upper case from FREG counts");
    assert.deepEqual(toFregInfo(undefined), { found: false });
    const dead = toFregInfo({ foedselsEllerDNummer: "1", status: "doed" }) as Found;
    assert.equal(dead.dead, true);
  });

  test("Brreg: deleted, bankrupt and addresses", () => {
    const info = toBrregInfo(BRREG["940192226"]);
    assert.deepEqual(info, {
      found: true,
      deleted: true,
      bankrupt: false,
      beingDissolved: false,
      name: "TELEMARK FYLKESKOMMUNE",
      organisationForm: "Fylkeskommune",
      deletedDate: "2020-04-01",
      postalAddress: { lines: ["Postboks 2844"], postnummer: "3706", poststed: "SKIEN", country: "Norge" },
      businessAddress: { lines: ["Fylkesbakken 10"], postnummer: "3715", poststed: "SKIEN", country: "Norge" }
    });
  });
});

describe("limits", () => {
  test("mapLimit keeps the order and never runs more than the limit at once", async () => {
    let running = 0;
    let most = 0;
    const result = await mapLimit([5, 1, 4, 2, 3], 2, async (n) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, n * 3));
      running--;
      return n * 10;
    });
    assert.deepEqual(result, [50, 10, 40, 20, 30]);
    assert.equal(most, 2);
  });

  test("memoize asks once per key", async () => {
    let calls = 0;
    const lookup = memoize(async (key) => {
      calls++;
      return key.toUpperCase();
    });
    assert.deepEqual(await Promise.all([lookup("a"), lookup("a"), lookup("b")]), ["A", "A", "B"]);
    assert.equal(calls, 2);
  });
});
