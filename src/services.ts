import { createBrreg } from "./adapters/enrichment/brreg.ts";
import { createFreg } from "./adapters/enrichment/freg.ts";
import { createCredential, createTokenProvider } from "./adapters/identity/credential.ts";
import { loglady } from "./adapters/logging/loglady.ts";
import { createMatrikkelClient } from "./adapters/matrikkel/client.ts";
import { readSettings, type Settings } from "./config/settings.ts";
import type { Dependencies } from "./domain/service.ts";

export type Services = Dependencies & { settings: Settings };

let services: Services | undefined;

/** The adapters, created once per instance. */
export function getServices(): Services {
  if (!services) {
    const settings = readSettings();
    const freg = settings.freg ? createFreg(settings.freg, createTokenProvider(createCredential(settings.identity))) : undefined;
    services = { settings, logger: loglady, matrikkel: createMatrikkelClient(settings.matrikkel), brreg: createBrreg(settings.brreg), concurrency: settings.concurrency, ...(freg ? { freg } : {}) };
  }
  return services;
}

/** For tests: forget the services, so the next call reads the settings again. */
export function resetServices(): void {
  services = undefined;
}
