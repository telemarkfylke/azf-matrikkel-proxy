// App roles on the "Matrikkel API - {env}" app registration.

export const ROLES = {
  /** Properties and owners from Matrikkel, and Brreg data for organisations. */
  read: "matrikkel.read",
  /** FREG data for persons (personal data: status, whether they can be contacted, address grading). */
  readFreg: "matrikkel.read.freg"
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

const KNOWN = new Map<string, Role>(Object.values(ROLES).map((role) => [role.toLowerCase(), role]));

/** The known roles in a token's role values, compared case-insensitively. FREG implies read. */
export function effectiveRoles(assigned: Iterable<string>): ReadonlySet<Role> {
  const roles = new Set<Role>();
  for (const value of assigned) {
    const role = KNOWN.get(value.trim().toLowerCase());
    if (!role) continue;
    roles.add(role);
    if (role === ROLES.readFreg) roles.add(ROLES.read);
  }
  return roles;
}
