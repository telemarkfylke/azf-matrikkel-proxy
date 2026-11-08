import type { Settings } from "../../config/settings.ts";
import type { TokenProvider } from "../../ports.ts";

// azf-freg (POST { ssn }), which answers with a repacked person from Folkeregisteret.
// It is called with includeFortrolig: false, so protected addresses (fortrolig, strengt fortrolig,
// klientadresse) are masked by azf-freg and never reach this API; the grading still does.

/** The repacked person from azf-freg, as much of it as this API reads. */
export type FregPerson = {
  foedselsEllerDNummer?: string | null;
  status?: string;
  kanKontaktes?: boolean;
  fulltnavn?: string;
  doedsfall?: unknown;
  bostedsadresse?: { adressegradering?: string; [key: string]: unknown };
  postadresse?: { adresse?: string; postnummer?: string; poststed?: string; land?: string; adressegradering?: string; [key: string]: unknown };
  [key: string]: unknown;
};

export class FregError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FregError";
  }
}

export type Freg = {
  /** The person, or undefined when Folkeregisteret has no such person. */
  person(ssn: string): Promise<FregPerson | undefined>;
};

export function createFreg(settings: NonNullable<Settings["freg"]>, tokens: TokenProvider): Freg {
  return {
    async person(ssn) {
      let response: Response;
      try {
        response = await fetch(settings.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${await tokens.getToken(settings.scope)}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ssn, includeFortrolig: false, includeRawFreg: false }),
          signal: AbortSignal.timeout(settings.timeoutMs)
        });
      } catch (error) {
        // Never the request body or headers in the message: they hold the fødselsnummer and the token
        throw new FregError((error as Error)?.name === "TimeoutError" ? `FREG did not answer within ${settings.timeoutMs} ms` : "Could not reach FREG");
      }
      if (response.status === 404) return undefined;
      if (!response.ok) throw new FregError(`FREG answered ${response.status}`);
      const person = (await response.json()) as FregPerson;
      // azf-freg answers 200 with foedselsEllerDNummer: null when there is no such person
      return person?.foedselsEllerDNummer ? person : undefined;
    }
  };
}

const PROTECTED = new Set(["fortrolig", "strengtfortrolig", "klientadresse"]);

/** Whether a grading means the address must not be used (case doesn't matter; FREG sends KLIENTADRESSE). */
export function isProtectedGrading(grading: unknown): boolean {
  return typeof grading === "string" && PROTECTED.has(grading.toLowerCase());
}
