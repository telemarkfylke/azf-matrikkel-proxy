import { bool, list, type Node, num, text, xsiType } from "./xml.ts";

// The typed shapes the v2 endpoints answer with, and how Matrikkel's objects map to them.
// Field names are English and stable; numbers are numbers, lists are always lists.

export type Position = { x: number; y: number };

export type Matrikkelnummer = { kommunenummer: string; gardsnummer: number; bruksnummer: number; festenummer: number; seksjonsnummer: number };

/** `ownerId` is missing when Matrikkel's answer has no eierId: skip such an ownership instead of guessing an owner. */
export type Ownership = { id: number; type: string; ownerId?: number; share?: { numerator: number; denominator: number } };

export type Unit = {
  id: number;
  /** Grunneiendom, Festegrunn, Seksjon, Jordsameie, Anleggseiendom … */
  type: string;
  matrikkelnummer?: Matrikkelnummer;
  bruksnavn?: string;
  /** No longer in use (utgått) */
  expired: boolean;
  ownerships: Ownership[];
  plots: Array<{ id: number; main: boolean }>;
  /** The main plot's representative point, in the requested coordinate system. Set when positions are asked for. */
  position?: Position;
};

export type Plot = { id: number; area?: number; position?: Position };

export type PostalAddress = { lines: string[]; postnummeromradeId?: string; postnummer?: string; poststed?: string; country?: string };

export type FregInfo =
  | {
      found: true;
      /** bosatt, utflyttet, doed, forsvunnet, inaktiv … */
      status: string;
      canBeContacted: boolean | null;
      dead: boolean;
      /** The address is fortrolig, strengt fortrolig or a klientadresse. The address itself is never sent. */
      protectedAddress: boolean;
      addressGrading?: string;
      name?: string;
      postalAddress?: PostalAddress;
    }
  | { found: false }
  | { error: string };

export type BrregInfo =
  | {
      found: true;
      name?: string;
      organisationForm?: string;
      deleted: boolean;
      deletedDate?: string;
      bankrupt: boolean;
      beingDissolved: boolean;
      postalAddress?: PostalAddress;
      businessAddress?: PostalAddress;
    }
  | { found: false }
  | { error: string };

export type Owner = {
  id: number;
  kind: "person" | "organisation" | "other";
  /** FysiskPerson, JuridiskPerson, AnnenPerson … */
  type: string;
  /** Fødselsnummer / D-nummer or organisasjonsnummer */
  number?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  postalAddress?: PostalAddress;
  organisationForm?: string;
  /** Matrikkel's own deletion date for organisations */
  deletedDate?: string;
  freg?: FregInfo;
  brreg?: BrregInfo;
};

const NUM = (value: unknown, fallback = 0) => num(value) ?? fallback;

export function toUnit(node: Node): Unit {
  const m = node.matrikkelnummer as Node | undefined;
  const unit: Unit = {
    id: NUM(node.id),
    type: xsiType(node) ?? "Matrikkelenhet",
    expired: bool(node.utgatt) ?? false,
    ownerships: list((node.eierforhold as Node | undefined)?.item).map((o) => {
      const ownership: Ownership = { id: NUM(o.id), type: xsiType(o) ?? "Eierforhold" };
      // No 0 fallback: callers look owners up by this id and send them letters, so it must be real
      const ownerId = num(o.eierId);
      if (ownerId !== undefined) ownership.ownerId = ownerId;
      const share = o.andel as Node | undefined;
      const numerator = num(share?.teller);
      const denominator = num(share?.nevner);
      if (numerator !== undefined && denominator) ownership.share = { numerator, denominator };
      return ownership;
    }),
    plots: list((node.teigerForMatrikkelenhet as Node | undefined)?.item).map((p) => ({ id: NUM(p.teigId), main: bool(p.hovedteig) ?? false }))
  };
  if (m) {
    unit.matrikkelnummer = {
      kommunenummer: text(m.kommuneId) ?? "",
      gardsnummer: NUM(m.gardsnummer),
      bruksnummer: NUM(m.bruksnummer),
      festenummer: NUM(m.festenummer),
      seksjonsnummer: NUM(m.seksjonsnummer)
    };
  }
  const bruksnavn = text(node.bruksnavn);
  if (bruksnavn) unit.bruksnavn = bruksnavn;
  return unit;
}

/** The plot a unit's position comes from: the main plot, or the first. */
export function mainPlotId(unit: Unit): number | undefined {
  return (unit.plots.find((p) => p.main) ?? unit.plots[0])?.id;
}

export function toPlot(node: Node): Plot {
  const plot: Plot = { id: NUM(node.id) };
  const area = num(node.lagretBeregnetAreal);
  if (area !== undefined) plot.area = area;
  const position = (node.representasjonspunkt as Node | undefined)?.position as Node | undefined;
  const x = num(position?.x);
  const y = num(position?.y);
  if (x !== undefined && y !== undefined) plot.position = { x, y };
  return plot;
}

function matrikkelAddress(node: unknown): PostalAddress | undefined {
  const a = node as Node | undefined;
  if (!a || typeof a !== "object") return undefined;
  const lines = [a.adresselinje1, a.adresselinje2, a.adresselinje3].map(text).filter((l): l is string => Boolean(l));
  const postnummeromradeId = text(a.postnummeromradeId);
  if (lines.length === 0 && !postnummeromradeId) return undefined;
  const address: PostalAddress = { lines };
  if (postnummeromradeId) address.postnummeromradeId = postnummeromradeId;
  return address;
}

export function toOwner(node: Node): Owner {
  const type = xsiType(node) ?? "Person";
  const kind = type === "FysiskPerson" ? "person" : type === "JuridiskPerson" ? "organisation" : "other";
  const owner: Owner = { id: NUM(node.id), kind, type };
  const set = <K extends keyof Owner>(key: K, value: Owner[K] | undefined) => {
    if (value !== undefined && value !== "") owner[key] = value;
  };
  set("number", text(node.nummer));
  set("name", text(node.navn));
  set("firstName", text(node.fornavn));
  set("lastName", text(node.etternavn));
  set("postalAddress", matrikkelAddress(node.postadresse) ?? matrikkelAddress(node.forretningsadresse));
  set("organisationForm", text(node.organisasjonsformKode));
  set("deletedDate", text(node.slettetDato));
  return owner;
}

/** The items in a StoreService answer, whatever xml2js made of them. */
export function storeItems(responseBody: Node | undefined): Node[] {
  const response = responseBody?.getObjectsResponse as Node | undefined;
  return list((response?.return as Node | undefined)?.item ?? response?.return);
}

/** The unit ids in a findMatrikkelenheter answer. */
export function foundUnitIds(responseBody: Node | undefined): number[] {
  const response = responseBody?.findMatrikkelenheterResponse as Node | undefined;
  return list((response?.return as Node | undefined)?.item)
    .map((item) => num(item))
    .filter((id): id is number => id !== undefined);
}
