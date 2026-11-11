import type { Settings } from "../../config/settings.ts";

// Enhetsregisteret (Brønnøysundregistrene): a main unit, or a sub-unit when there is no main unit.

export type BrregUnit = Record<string, unknown> & {
  organisasjonsnummer?: string;
  navn?: string;
  slettedato?: string;
  konkurs?: boolean;
  underAvvikling?: boolean;
  organisasjonsform?: { kode?: string; beskrivelse?: string };
  postadresse?: { adresse?: string[]; postnummer?: string; poststed?: string; land?: string };
  forretningsadresse?: { adresse?: string[]; postnummer?: string; poststed?: string; land?: string };
};

export class BrregError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrregError";
  }
}

export type Brreg = {
  /** The organisation, or undefined when Enhetsregisteret has no such main unit or sub-unit. */
  organisation(orgnr: string): Promise<BrregUnit | undefined>;
};

export function createBrreg(settings: Settings["brreg"]): Brreg {
  async function get(base: string, orgnr: string): Promise<BrregUnit | undefined> {
    let response: Response;
    try {
      response = await fetch(`${base}/${encodeURIComponent(orgnr)}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(settings.timeoutMs) });
    } catch (error) {
      throw new BrregError((error as Error)?.name === "TimeoutError" ? `Brreg did not answer within ${settings.timeoutMs} ms` : "Could not reach Brreg");
    }
    // 410 Gone: deleted and removed from the register
    if (response.status === 404 || response.status === 410 || response.status === 400) return undefined;
    if (!response.ok) throw new BrregError(`Brreg answered ${response.status}`);
    return (await response.json()) as BrregUnit;
  }

  return {
    async organisation(orgnr) {
      if (!/^\d{9}$/.test(orgnr)) return undefined;
      return (await get(settings.mainUrl, orgnr)) ?? (await get(settings.subUrl, orgnr));
    }
  };
}
