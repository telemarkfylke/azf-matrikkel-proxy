import { parseStringPromise } from "xml2js";

// SOAP requests to Kartverket's Matrikkel API, for the two operations the API uses:
// MatrikkelenhetService.findMatrikkelenheter (units inside a polygon) and StoreService.getObjects
// (objects by id). https://matrikkel.no/matrikkelapi/wsapi/v1/dokumentasjon/index.html
//
// Every value is escaped and validated before it goes into the XML (the JavaScript version put them
// in as they were). Answers are parsed the way the JavaScript version did (namespace prefixes
// removed, xml2js without explicit arrays), so the compatible endpoints keep their shape.

const NS = {
  soapenv: "http://schemas.xmlsoap.org/soap/envelope/",
  dom: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain",
  geom: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/geometri",
  matService: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/service/matrikkelenhet",
  matDomain: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/matrikkelenhet",
  store: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/service/store",
  xsi: "http://www.w3.org/2001/XMLSchema-instance"
} as const;

/** The domain namespaces object ids can be in, e.g. …/domain/matrikkelenhet, …/domain/person. */
export const DOMAIN_NAMESPACE = /^http:\/\/matrikkel\.statkart\.no\/matrikkelapi\/wsapi\/v1\/domain(\/[a-z]+)?$/;

export function escapeXml(value: string | number | boolean): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string);
}

export type MatrikkelContext = {
  koordinatsystemKodeId: number;
  klientIdentifikasjon?: string;
  locale?: string;
  brukOriginaleKoordinater?: boolean;
  systemVersion?: string;
};

export function matrikkelContextXml(ctx: MatrikkelContext): string {
  return [
    `<dom:locale>${escapeXml(ctx.locale ?? "no_NB")}</dom:locale>`,
    `<dom:brukOriginaleKoordinater>${ctx.brukOriginaleKoordinater ? "true" : "false"}</dom:brukOriginaleKoordinater>`,
    `<dom:koordinatsystemKodeId><dom:value>${escapeXml(ctx.koordinatsystemKodeId)}</dom:value></dom:koordinatsystemKodeId>`,
    `<dom:systemVersion>${escapeXml(ctx.systemVersion ?? "trunk")}</dom:systemVersion>`,
    `<dom:klientIdentifikasjon>${escapeXml(ctx.klientIdentifikasjon ?? "")}</dom:klientIdentifikasjon>`
  ].join("");
}

export function findUnitsRequest(polygon: ReadonlyArray<readonly [number, number]>, ctx: MatrikkelContext): string {
  const positions = polygon.map(([x, y]) => `<geom:item><geom:x>${escapeXml(x)}</geom:x><geom:y>${escapeXml(y)}</geom:y><geom:z>0</geom:z></geom:item>`).join("");
  const ks = `<dom:value>${escapeXml(ctx.koordinatsystemKodeId)}</dom:value>`;
  return (
    `<soapenv:Envelope xmlns:soapenv="${NS.soapenv}" xmlns:mat="${NS.matService}" xmlns:mat1="${NS.matDomain}" xmlns:geom="${NS.geom}" xmlns:dom="${NS.dom}">` +
    "<soapenv:Header/><soapenv:Body><mat:findMatrikkelenheter><mat:matrikkelenhetsokModel><mat1:selectionPolygon>" +
    `<geom:polygon><geom:koordinatsystemKodeId>${ks}</geom:koordinatsystemKodeId><geom:ytreAvgrensning><geom:positions>${positions}</geom:positions></geom:ytreAvgrensning></geom:polygon>` +
    `<geom:koordinatsystemKodeId>${ks}</geom:koordinatsystemKodeId>` +
    `</mat1:selectionPolygon></mat:matrikkelenhetsokModel><mat:matrikkelContext>${matrikkelContextXml(ctx)}</mat:matrikkelContext></mat:findMatrikkelenheter></soapenv:Body></soapenv:Envelope>`
  );
}

export type ObjectId = { type: string; namespace: string; value: string | number };

export function storeRequest(items: readonly ObjectId[], ctx: MatrikkelContext): string {
  const namespaces: string[] = [];
  const itemsXml = items
    .map((item) => {
      let index = namespaces.indexOf(item.namespace);
      if (index === -1) index = namespaces.push(item.namespace) - 1;
      return `<dom:item xsi:type="ns${index + 1}:${escapeXml(item.type)}"><dom:value>${escapeXml(item.value)}</dom:value></dom:item>`;
    })
    .join("");
  const declarations = namespaces.map((ns, i) => `xmlns:ns${i + 1}="${escapeXml(ns)}"`).join(" ");
  return (
    `<soapenv:Envelope xmlns:soapenv="${NS.soapenv}" xmlns:stor="${NS.store}" xmlns:dom="${NS.dom}">` +
    `<soapenv:Header/><soapenv:Body><stor:getObjects><stor:ids ${declarations}${declarations ? " " : ""}xmlns:xsi="${NS.xsi}">${itemsXml}</stor:ids>` +
    `<stor:matrikkelContext>${matrikkelContextXml(ctx)}</stor:matrikkelContext></stor:getObjects></soapenv:Body></soapenv:Envelope>`
  );
}

/** Matrikkel couldn't answer the request. `status` is what the API answers its caller. */
export class MatrikkelError extends Error {
  readonly status: 400 | 502 | 504;
  constructor(status: 400 | 502 | 504, message: string) {
    super(message);
    this.name = "MatrikkelError";
    this.status = status;
  }
}

/** Removes namespace prefixes from tags, as the JavaScript version did (`soap:` stays). */
export function cleanUpXml(xml: string): string {
  return xml
    .replace(/<([a-zA-Z]):/g, "<")
    .replace(/<\/([a-zA-Z]):/g, "</")
    .replace(/<[a-zA-Z]+[0-9]+:/g, "<")
    .replace(/<\/[a-zA-Z]+[0-9]+:/g, "</");
}

/** A parsed answer: the root element, e.g. { "soap:Envelope": { "soap:Body": { … } } }. */
export type ParsedSoap = Record<string, unknown>;

/** The element inside soap:Body (the response or a fault). */
export function soapBody(parsed: ParsedSoap): Record<string, unknown> | undefined {
  const envelope = (parsed["soap:Envelope"] ?? parsed.Envelope) as Record<string, unknown> | undefined;
  return (envelope?.["soap:Body"] ?? envelope?.Body) as Record<string, unknown> | undefined;
}

export type SoapSettings = { baseUrl: string; username: string; password: string; timeoutMs: number };

/** Posts a SOAP request to a Matrikkel service and parses the answer. Throws MatrikkelError for faults. */
export async function postSoap(settings: SoapSettings, service: "MatrikkelenhetServiceWS" | "StoreServiceWS", xml: string): Promise<ParsedSoap> {
  let response: Response;
  try {
    response = await fetch(`${settings.baseUrl}/matrikkelapi/wsapi/v1/${service}`, {
      method: "POST",
      headers: { "Content-Type": "text/xml;charset=UTF-8", Authorization: `Basic ${Buffer.from(`${settings.username}:${settings.password}`).toString("base64")}` },
      body: xml,
      signal: AbortSignal.timeout(settings.timeoutMs)
    });
  } catch (error) {
    const timedOut = (error as Error)?.name === "TimeoutError";
    throw new MatrikkelError(timedOut ? 504 : 502, timedOut ? `Matrikkel did not answer within ${settings.timeoutMs} ms` : `Could not reach Matrikkel: ${(error as Error)?.message}`);
  }
  const text = await response.text();
  // Matrikkel answers 200 with an HTML page when the credentials are wrong
  if (text.includes("<!DOCTYPE HTML") || text.includes("401 Unauthorized") || response.status === 401) throw new MatrikkelError(502, "Matrikkel refused the credentials");

  let parsed: ParsedSoap;
  try {
    parsed = (await parseStringPromise(cleanUpXml(text), { explicitArray: false })) as ParsedSoap;
  } catch {
    throw new MatrikkelError(502, `Matrikkel answered ${response.status} with something that isn't XML`);
  }
  const fault = soapBody(parsed)?.["soap:Fault"] ?? soapBody(parsed)?.Fault;
  if (fault) {
    const reason = String((fault as Record<string, unknown>).faultstring ?? "unknown fault");
    // Faults from the client's input (e.g. an invalid coordinate system) are the caller's to fix
    const clientFault =
      String((fault as Record<string, unknown>).faultcode ?? "")
        .toLowerCase()
        .includes("client") || JSON.stringify(fault).includes("VALIDATION");
    throw new MatrikkelError(clientFault ? 400 : 502, `Matrikkel: ${reason}`);
  }
  if (!response.ok) throw new MatrikkelError(502, `Matrikkel answered ${response.status}`);
  return parsed;
}
