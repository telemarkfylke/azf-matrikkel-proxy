// Reading xml2js output (explicitArray: false), where one element is an object, several are a list,
// an empty element is "", and every value is a string.

export type Node = Record<string, unknown>;

/** The element as a list: [] for missing or empty, [x] for one, the list for several. */
export function list(value: unknown): Node[] {
  if (value === undefined || value === null || value === "") return [];
  return (Array.isArray(value) ? value : [value]) as Node[];
}

/** The text of an element: a plain string, xml2js's { _: text }, or a wrapped { value } (ids). */
export function text(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const node = value as Node;
    if ("value" in node) return text(node.value);
    if ("_" in node) return text(node._);
    if (node.$ && (node.$ as Node)["xsi:nil"] === "true") return undefined;
  }
  return undefined;
}

export function num(value: unknown): number | undefined {
  const t = text(value);
  if (t === undefined) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function bool(value: unknown): boolean | undefined {
  const t = text(value)?.toLowerCase();
  return t === "true" ? true : t === "false" ? false : undefined;
}

/** The local name of an element's xsi:type ("ns5:Grunneiendom" → "Grunneiendom"). */
export function xsiType(node: unknown): string | undefined {
  const type = ((node as Node | undefined)?.$ as Node | undefined)?.["xsi:type"];
  if (typeof type !== "string") return undefined;
  return type.includes(":") ? type.split(":")[1] : type;
}
