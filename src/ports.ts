// Interfaces the domain and handlers need from the outside world. Adapters implement them; tests use fakes.

export type Logger = {
  info(template: string, ...params: unknown[]): void;
  warn(template: string, ...params: unknown[]): void;
  error(template: string, ...params: unknown[]): void;
  errorException(error: unknown, template: string, ...params: unknown[]): void;
};

/** Gets an access token for a resource or scope. */
export type TokenProvider = {
  getToken(resourceOrScope: string): Promise<string>;
};
