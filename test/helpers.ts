import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseStringPromise } from "xml2js";
import type { BrregUnit } from "../src/adapters/enrichment/brreg.ts";
import type { FregPerson } from "../src/adapters/enrichment/freg.ts";
import { cleanUpXml, type ParsedSoap } from "../src/adapters/matrikkel/soap.ts";
import type { Logger } from "../src/ports.ts";

const require = createRequire(import.meta.url);
const fixtures = new URL("./fixtures/", import.meta.url);

/** A SOAP fixture as text. */
export const soapText = (name: string) => readFileSync(new URL(`soap/${name}`, fixtures), "utf8");

/** A SOAP fixture, parsed the way postSoap parses Matrikkel's answers. */
export async function soap(name: string): Promise<ParsedSoap> {
  return (await parseStringPromise(cleanUpXml(soapText(name)), { explicitArray: false })) as ParsedSoap;
}

/** What the JavaScript version answered for a fixture (scripts/legacy-golden.cjs). */
export const golden = (name: string) => JSON.parse(readFileSync(new URL(`legacy/${name}.json`, fixtures), "utf8"));

export const { FREG, BRREG } = require("./fixtures/enrichment.cjs") as { FREG: Record<string, FregPerson>; BRREG: Record<string, BrregUnit> };

/** azf-freg with includeFortrolig: false masks protected addresses; the fake does the same. */
export function maskedFreg(ssn: string): FregPerson | undefined {
  const person = FREG[ssn];
  if (!person) return undefined;
  const copy = structuredClone(person);
  const grading = String(copy.bostedsadresse?.adressegradering ?? "").toLowerCase();
  if (["fortrolig", "strengtfortrolig", "klientadresse"].includes(grading)) {
    copy.bostedsadresse = { adressegradering: copy.bostedsadresse?.adressegradering, gateadresse: "Strengt fortrolig adresse" };
    copy.postadresse = { adressegradering: copy.bostedsadresse?.adressegradering, gateadresse: "Strengt fortrolig adresse" };
  }
  return copy;
}

export const silent: Logger = { info: () => {}, warn: () => {}, error: () => {}, errorException: () => {} };
