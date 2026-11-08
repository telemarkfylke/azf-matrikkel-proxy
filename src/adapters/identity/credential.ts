import { AzureCliCredential, ClientSecretCredential, ManagedIdentityCredential, type TokenCredential } from "@azure/identity";
import type { Settings } from "../../config/settings.ts";
import type { TokenProvider } from "../../ports.ts";

// The identity for calling azf-freg: the client secret while AZF_FREG_CLIENT_SECRET is set (today),
// managed identity in Azure once it has the role, Azure CLI locally. Tokens are cached and renewed
// by @azure/identity before they expire.

export function createCredential(identity: Settings["identity"]): TokenCredential {
  if (identity.clientSecret && identity.clientId && identity.tenantId) return new ClientSecretCredential(identity.tenantId, identity.clientId, identity.clientSecret);
  if (identity.runningInAzure) return identity.managedIdentityClientId ? new ManagedIdentityCredential({ clientId: identity.managedIdentityClientId }) : new ManagedIdentityCredential();
  return new AzureCliCredential(identity.tenantId ? { tenantId: identity.tenantId } : {});
}

/** `api://x` and `api://x/.default` give the same scope. */
export function toScope(resourceOrScope: string): string {
  const trimmed = resourceOrScope.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/.default") ? trimmed : `${trimmed}/.default`;
}

export function createTokenProvider(credential: TokenCredential): TokenProvider {
  return {
    async getToken(resourceOrScope) {
      const scope = toScope(resourceOrScope);
      const token = await credential.getToken(scope);
      if (!token) throw new Error(`Could not get an access token for ${scope}`);
      return token.token;
    }
  };
}
