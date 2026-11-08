import type { Brreg } from "../adapters/enrichment/brreg.ts";
import { type Freg, type FregPerson, isProtectedGrading } from "../adapters/enrichment/freg.ts";
import type { ParsedSoap } from "../adapters/matrikkel/soap.ts";
import type { Logger } from "../ports.ts";

// The JavaScript version's answer shape for POST /matrikkelenheter and POST /store, for the callers
// that still read it (azf-masseutsendelse-api's pass-through for the old Vue app). Remove after the
// switch to the new frontend.
//
// lightlyResolve and flatten are ported line by line from lib/KartverketMatrikkelAPI/matrikkelClient.js
// and lib/helpers/flattenObject.js, and test/unit/legacy.test.ts checks the output against what the
// JavaScript code produced for the same SOAP answers (test/fixtures/legacy). Deliberate differences:
// - an owner with a protected address inside a list no longer crashes the request
// - a failed FREG lookup marks that owner handleManually instead of failing the whole request
// - FREG is asked with includeFortrolig: false, so protected addresses are masked (the grading stays)
// - an empty polygon search gives units: [] instead of units: ""

type AnyRecord = Record<string, unknown>;

export type LegacyEnrichment = { freg?: Freg; brreg: Brreg; logger: Logger };

const HANDLE_MANUALLY_STATUSES = new Set(["inaktiv"]);

/** Adds _type from xsi:type and FREG/Brreg data to owners, as the JavaScript version's lightlyResolveRequest. */
export async function lightlyResolve(parsed: ParsedSoap, deps: LegacyEnrichment): Promise<unknown[]> {
  const copy = [JSON.parse(JSON.stringify(parsed)) as unknown];
  const brregCache: AnyRecord = {};
  const fregCache: Record<string, FregPerson | undefined> = {};

  async function resolve(item: unknown, key: string | undefined, parent: AnyRecord | unknown[] | undefined): Promise<void> {
    if (!item) return;
    if (Array.isArray(item)) {
      for (const child of item) await resolve(child, key, item);
    }
    if (typeof item === "object") {
      for (const childKey of Object.keys(item as AnyRecord)) await resolve((item as AnyRecord)[childKey], childKey, item as AnyRecord);
    }
    const node = item as AnyRecord;
    const attributes = node.$ as AnyRecord | undefined;
    const xsiType = attributes?.["xsi:type"];
    if (typeof xsiType !== "string") return;

    const type = xsiType.includes(":") ? (xsiType.split(":")[1] as string) : xsiType;
    const at = parent && key !== undefined ? ((parent as AnyRecord)[key] as AnyRecord | undefined) : undefined;
    const nummer = typeof node.nummer === "string" ? node.nummer : undefined;

    if (type === "JuridiskPerson" && nummer) {
      if (brregCache[nummer]) {
        if (at) at.brreg = brregCache[nummer];
      } else {
        let company: unknown;
        try {
          company = await deps.brreg.organisation(nummer);
        } catch (error) {
          deps.logger.warn("Brreg lookup failed for an owner: {Message}", (error as Error).message);
          company = undefined;
        }
        if (company) {
          if ((company as AnyRecord).slettedato && at) at.avviklet = true;
          brregCache[nummer] = company;
          node.brreg = company;
        } else if (at) {
          at.avviklet = true;
        }
      }
    } else if (type === "FysiskPerson" && nummer) {
      if (nummer in fregCache) {
        if (at && fregCache[nummer]) at.freg = fregCache[nummer];
      } else if (deps.freg) {
        try {
          fregCache[nummer] = await deps.freg.person(nummer);
        } catch (error) {
          deps.logger.warn("FREG lookup failed for an owner: {Message}", (error as Error).message);
          fregCache[nummer] = undefined;
          node.handleManually = true;
          node.fregError = true;
        }
        const person = fregCache[nummer];
        if (person) {
          node.freg = person;
          if (person.kanKontaktes === false) {
            node.kanIkkeKontaktes = true;
          } else if (person.kanKontaktes === true) {
            if (!HANDLE_MANUALLY_STATUSES.has(String(person.status))) {
              if (isProtectedGrading(person.bostedsadresse?.adressegradering)) {
                node.handleManually = true;
                // The JavaScript version deleted these from parent[key], which crashed inside lists
                delete node.bostedsadresse;
                delete node.postadresse;
              }
            } else {
              node.handleManually = true;
            }
          }
        }
      }
    }

    const typeInfo = { _type: type };
    if (parent && key !== undefined && (parent as AnyRecord)[key]) {
      (parent as AnyRecord)[key] = { ...typeInfo, ...((parent as AnyRecord)[key] as AnyRecord) };
    }
    if (attributes && Object.keys(attributes).length <= 2 && parent && key !== undefined) {
      const replaced = (parent as AnyRecord)[key] as AnyRecord | undefined;
      if (replaced && typeof replaced === "object") delete replaced.$;
    }
  }

  for (const item of copy) await resolve(item, undefined, undefined);
  return copy;
}

/** Makes objects as flat as possible, as the JavaScript version's flattenObject. */
export function flatten<T>(value: T): T {
  function walk(current: unknown, currentKey: string, parent: AnyRecord): void {
    if (!current) return;
    if (currentKey === "$") return;
    if (currentKey === "metadata") {
      delete parent[currentKey];
      return;
    }
    if (typeof current === "object") {
      for (const key of Object.keys(current as AnyRecord)) walk((current as AnyRecord)[key], key, current as AnyRecord);
    }
    if (typeof current === "object") {
      const keys = Object.keys(current as AnyRecord);
      if (keys.length === 1) {
        if (keys[0] !== "$") parent[currentKey] = (current as AnyRecord)[keys[0] as string];
      } else if (keys.length === 2 && (current as AnyRecord).$ !== undefined) {
        const other = keys.find((k) => k !== "$");
        if (other && typeof (current as AnyRecord)[other] !== "object") parent[currentKey] = (current as AnyRecord)[other];
      }
    }
  }
  const copy = JSON.parse(JSON.stringify(value)) as AnyRecord;
  for (const key of Object.keys(copy)) walk(copy[key], key, copy);
  return copy as T;
}

/** The answer of POST /store: { store: [ … ] }. */
export async function legacyStore(parsed: ParsedSoap, deps: LegacyEnrichment): Promise<{ store: unknown[] }> {
  return { store: flatten(await lightlyResolve(parsed, deps)) };
}

/** The answer of POST /matrikkelenheter: { units, koordinatsystemKodeId }, with the ids as strings. */
export async function legacyUnits(parsed: ParsedSoap, deps: LegacyEnrichment, koordinatsystemKodeId: unknown): Promise<AnyRecord> {
  const [resolved] = (await lightlyResolve(parsed, deps)) as AnyRecord[];
  const envelope = resolved?.["soap:Envelope"] as AnyRecord | undefined;
  const result = ((envelope?.["soap:Body"] as AnyRecord | undefined)?.findMatrikkelenheterResponse as AnyRecord | undefined)?.return as AnyRecord | string | undefined;
  const items = result && typeof result === "object" ? result.item : undefined;
  const list = items === undefined || items === null || items === "" ? [] : Array.isArray(items) ? items : [items];
  const units = list.map((unit) => (typeof unit === "object" && unit !== null ? (unit as AnyRecord).value : unit)).filter((v) => v !== undefined && v !== "");
  const answer: AnyRecord = { units };
  if (koordinatsystemKodeId !== undefined) answer.koordinatsystemKodeId = koordinatsystemKodeId;
  return answer;
}
