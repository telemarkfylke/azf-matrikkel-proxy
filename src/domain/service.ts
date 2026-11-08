import type { Brreg, BrregUnit } from "../adapters/enrichment/brreg.ts";
import { type Freg, type FregPerson, isProtectedGrading } from "../adapters/enrichment/freg.ts";
import { mapLimit, memoize } from "../adapters/enrichment/limit.ts";
import type { MatrikkelClient } from "../adapters/matrikkel/client.ts";
import { type MatrikkelContext, type ObjectId, soapBody } from "../adapters/matrikkel/soap.ts";
import type { Logger } from "../ports.ts";
import { type BrregInfo, type FregInfo, foundUnitIds, mainPlotId, type Owner, type Plot, type PostalAddress, storeItems, toOwner, toPlot, toUnit, type Unit } from "./model.ts";

// The v2 operations: unit ids in a polygon, units (with positions), plots and owners (with FREG and
// Brreg when asked for). Store calls are split into batches; FREG and Brreg run a few at a time.

export const DOMAIN = "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain";
const BATCH = 100;

export type Dependencies = { matrikkel: MatrikkelClient; freg?: Freg; brreg: Brreg; concurrency: number; logger: Logger };

const chunk = <T>(items: readonly T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

async function fetchObjects(deps: Dependencies, type: string, domain: string, ids: readonly number[], ctx: MatrikkelContext) {
  const batches = chunk([...new Set(ids)], BATCH);
  const answers = await mapLimit(batches, 2, (batch) =>
    deps.matrikkel.getObjects(
      batch.map((value): ObjectId => ({ type, namespace: `${DOMAIN}/${domain}`, value })),
      ctx
    )
  );
  return answers.flatMap((answer) => storeItems(soapBody(answer)));
}

export async function unitIdsInPolygon(deps: Dependencies, polygon: ReadonlyArray<readonly [number, number]>, ctx: MatrikkelContext): Promise<number[]> {
  return foundUnitIds(soapBody(await deps.matrikkel.findUnits(polygon, ctx)));
}

export async function plots(deps: Dependencies, ids: readonly number[], ctx: MatrikkelContext): Promise<Plot[]> {
  return (await fetchObjects(deps, "TeigId", "matrikkelenhet", ids, ctx)).map(toPlot);
}

export async function units(deps: Dependencies, ids: readonly number[], ctx: MatrikkelContext, options: { positions: boolean }): Promise<Unit[]> {
  const found = (await fetchObjects(deps, "MatrikkelenhetId", "matrikkelenhet", ids, ctx)).map(toUnit);
  if (!options.positions) return found;
  const plotIds = found.map(mainPlotId).filter((id): id is number => id !== undefined);
  if (plotIds.length === 0) return found;
  const positions = new Map((await plots(deps, plotIds, ctx)).filter((p) => p.position).map((p) => [p.id, p.position]));
  return found.map((unit) => {
    const position = positions.get(mainPlotId(unit) ?? -1);
    return position ? { ...unit, position } : unit;
  });
}

function fregAddress(person: FregPerson): PostalAddress | undefined {
  const a = person.postadresse;
  if (!a || isProtectedGrading(a.adressegradering)) return undefined;
  const address: PostalAddress = { lines: a.adresse ? [String(a.adresse)] : [] };
  if (a.postnummer) address.postnummer = String(a.postnummer);
  if (a.poststed) address.poststed = String(a.poststed);
  if (a.land) address.country = String(a.land);
  return address;
}

export function toFregInfo(person: FregPerson | undefined): FregInfo {
  if (!person) return { found: false };
  const grading = person.bostedsadresse?.adressegradering;
  const protectedAddress = isProtectedGrading(grading) || isProtectedGrading(person.postadresse?.adressegradering);
  const info: FregInfo = {
    found: true,
    status: String(person.status ?? "ukjent"),
    canBeContacted: typeof person.kanKontaktes === "boolean" ? person.kanKontaktes : null,
    dead: String(person.status ?? "").toLowerCase() === "doed" || Boolean(person.doedsfall),
    protectedAddress
  };
  if (typeof grading === "string") info.addressGrading = grading;
  if (person.fulltnavn) info.name = String(person.fulltnavn);
  const address = protectedAddress ? undefined : fregAddress(person);
  if (address) info.postalAddress = address;
  return info;
}

function brregAddress(a: BrregUnit["postadresse"]): PostalAddress | undefined {
  if (!a) return undefined;
  const address: PostalAddress = { lines: (a.adresse ?? []).map(String) };
  if (a.postnummer) address.postnummer = a.postnummer;
  if (a.poststed) address.poststed = a.poststed;
  if (a.land) address.country = a.land;
  return address;
}

export function toBrregInfo(unit: BrregUnit | undefined): BrregInfo {
  if (!unit) return { found: false };
  const info: BrregInfo = { found: true, deleted: Boolean(unit.slettedato), bankrupt: Boolean(unit.konkurs), beingDissolved: Boolean(unit.underAvvikling) };
  if (unit.navn) info.name = unit.navn;
  if (unit.organisasjonsform?.beskrivelse) info.organisationForm = unit.organisasjonsform.beskrivelse;
  if (unit.slettedato) info.deletedDate = unit.slettedato;
  const postal = brregAddress(unit.postadresse);
  if (postal) info.postalAddress = postal;
  const business = brregAddress(unit.forretningsadresse);
  if (business) info.businessAddress = business;
  return info;
}

export type Enrichment = { freg: boolean; brreg: boolean };

export async function owners(deps: Dependencies, ids: readonly number[], ctx: MatrikkelContext, enrich: Enrichment): Promise<Owner[]> {
  const found = (await fetchObjects(deps, "PersonId", "person", ids, ctx)).map(toOwner);
  const freg = deps.freg;
  const fregLookup = freg ? memoize((ssn) => freg.person(ssn)) : undefined;
  const brregLookup = memoize((orgnr) => deps.brreg.organisation(orgnr));

  return mapLimit(found, deps.concurrency, async (owner) => {
    if (enrich.freg && fregLookup && owner.kind === "person" && owner.number) {
      try {
        owner.freg = toFregInfo(await fregLookup(owner.number));
      } catch (error) {
        deps.logger.warn("FREG lookup for owner {OwnerId} failed: {Message}", owner.id, (error as Error).message);
        owner.freg = { error: "FREG svarte ikke for denne personen." };
      }
    }
    if (enrich.brreg && owner.kind === "organisation" && owner.number) {
      try {
        owner.brreg = toBrregInfo(await brregLookup(owner.number));
      } catch (error) {
        deps.logger.warn("Brreg lookup for owner {OwnerId} failed: {Message}", owner.id, (error as Error).message);
        owner.brreg = { error: "Brønnøysundregistrene svarte ikke for denne virksomheten." };
      }
    }
    return owner;
  });
}
