import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { cleanUpXml, escapeXml, findUnitsRequest, type MatrikkelError, matrikkelContextXml, postSoap, storeRequest } from "../../src/adapters/matrikkel/soap.ts";
import { golden, soapText } from "../helpers.ts";

const ctx = { koordinatsystemKodeId: 24, klientIdentifikasjon: "test" };
const compact = (xml: string) => xml.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();

describe("requests", () => {
  test("every value is escaped, so input can't change the XML", () => {
    assert.equal(escapeXml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
    const xml = matrikkelContextXml({ koordinatsystemKodeId: 24, klientIdentifikasjon: "</dom:klientIdentifikasjon><evil/>{{x}}" });
    assert.ok(!xml.includes("<evil/>"));
    assert.ok(xml.includes("&lt;evil/&gt;{{x}}"), "no template evaluation either");
  });

  test("the store request groups namespaces and has one item per id", () => {
    const xml = storeRequest(
      [
        { type: "MatrikkelenhetId", namespace: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/matrikkelenhet", value: 101 },
        { type: "PersonId", namespace: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/person", value: "501" },
        { type: "MatrikkelenhetId", namespace: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/matrikkelenhet", value: 102 }
      ],
      ctx
    );
    assert.match(xml, /xmlns:ns1="http:\/\/matrikkel\.statkart\.no\/matrikkelapi\/wsapi\/v1\/domain\/matrikkelenhet" xmlns:ns2="[^"]*\/person"/);
    assert.equal(xml.match(/<dom:item /g)?.length, 3);
    assert.ok(xml.includes('<dom:item xsi:type="ns2:PersonId"><dom:value>501</dom:value></dom:item>'));
  });

  test("the polygon request has the same elements as the JavaScript version's", () => {
    const polygon: Array<[number, number]> = [
      [9.6, 59.2],
      [9.62, 59.2],
      [9.62, 59.21],
      [9.6, 59.2]
    ];
    const ours = compact(findUnitsRequest(polygon, { koordinatsystemKodeId: 24, klientIdentifikasjon: "golden-test" }));
    const theirs = compact(golden("find-many").soapRequest);
    const elements = (xml: string) => [...xml.matchAll(/<([a-zA-Z0-9]+:[a-zA-Z]+)[ >]/g)].map((m) => m[1]).join(",");
    assert.equal(elements(ours), elements(theirs));
    for (const value of ["9.62", "59.21", "golden-test", "no_NB", "trunk"]) assert.ok(ours.includes(value), value);
  });
});

describe("postSoap", () => {
  const realFetch = globalThis.fetch;
  let reply: () => Response | Promise<Response>;
  let sent: { url: string; init?: RequestInit } | undefined;
  beforeEach(() => {
    globalThis.fetch = async (url, init) => {
      sent = { url: String(url), init };
      return reply();
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const settings = { baseUrl: "https://matrikkel.test", username: "u", password: "p", timeoutMs: 50 };

  test("sends basic auth to the service and parses the answer without prefixes", async () => {
    reply = () => new Response(soapText("find-one.xml"));
    const parsed = await postSoap(settings, "MatrikkelenhetServiceWS", "<x/>");
    assert.equal(sent?.url, "https://matrikkel.test/matrikkelapi/wsapi/v1/MatrikkelenhetServiceWS");
    assert.equal(new Headers(sent?.init?.headers).get("authorization"), `Basic ${Buffer.from("u:p").toString("base64")}`);
    assert.ok(JSON.stringify(parsed).includes("findMatrikkelenheterResponse"));
  });

  test("a SOAP fault is an error with a status, not a 200", async () => {
    reply = () => new Response(soapText("fault.xml"), { status: 500 });
    await assert.rejects(postSoap(settings, "StoreServiceWS", "<x/>"), (e: MatrikkelError) => e.status === 400 && /Ugyldig koordinatsystem/.test(e.message));
  });

  test("an HTML login page means the credentials were refused", async () => {
    reply = () => new Response("<!DOCTYPE HTML><html>401 Unauthorized</html>");
    await assert.rejects(postSoap(settings, "StoreServiceWS", "<x/>"), (e: MatrikkelError) => e.status === 502 && /credentials/.test(e.message));
  });

  test("the HTML login page is recognised whatever its casing", async () => {
    reply = () => new Response("<!doctype html><html><title>Login</title></html>");
    await assert.rejects(postSoap(settings, "StoreServiceWS", "<x/>"), (e: MatrikkelError) => e.status === 502 && /credentials/.test(e.message));
  });

  test("an answer without a SOAP body is a 502, not an empty list", async () => {
    reply = () => new Response("<other:Envelope xmlns:other='x'><other:Nobody/></other:Envelope>");
    await assert.rejects(postSoap(settings, "StoreServiceWS", "<x/>"), (e: MatrikkelError) => e.status === 502 && e.message === "Matrikkel answered with an unexpected format");
    reply = () => new Response("<html/>");
    await assert.rejects(postSoap(settings, "StoreServiceWS", "<x/>"), (e: MatrikkelError) => e.status === 502 && /unexpected format/.test(e.message));
  });

  test("an envelope with another prefix is read like soap:", async () => {
    reply = () => new Response(soapText("find-one.xml").replaceAll("soap:", "SOAP-ENV:").replace("xmlns:soap=", "xmlns:SOAP-ENV="));
    const parsed = await postSoap(settings, "MatrikkelenhetServiceWS", "<x/>");
    assert.ok((parsed["soap:Envelope"] as Record<string, unknown>)["soap:Body"]);
  });

  test("a network error is 502 without the error's details", async () => {
    reply = () => {
      throw new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.12:443");
    };
    await assert.rejects(
      postSoap(settings, "StoreServiceWS", "<x/>"),
      (e: MatrikkelError) => e.status === 502 && e.message === "Could not reach Matrikkel" && /ECONNREFUSED/.test(String((e.cause as Error).message))
    );
  });

  test("a slow Matrikkel times out with 504", async () => {
    reply = () =>
      new Promise((resolve, reject) => {
        const signal = sent?.init?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason));
        setTimeout(() => resolve(new Response("<x/>")), 1000);
      });
    await assert.rejects(postSoap(settings, "StoreServiceWS", "<x/>"), (e: MatrikkelError) => e.status === 504);
  });
});

test("cleanUpXml removes prefixes like the JavaScript version, keeping soap:", () => {
  assert.equal(cleanUpXml("<soap:Body><ns2:item><S:x/></ns2:item></soap:Body>"), "<soap:Body><item><x/></item></soap:Body>");
});

test("cleanUpXml gives the envelope's elements soap: whatever their prefix", () => {
  assert.equal(
    cleanUpXml("<SOAP-ENV:Envelope><env:Header/><env:Body><SOAP-ENV:Fault><faultcode>SOAP-ENV:Client</faultcode></SOAP-ENV:Fault></env:Body></SOAP-ENV:Envelope>"),
    "<soap:Envelope><soap:Header/><soap:Body><soap:Fault><faultcode>SOAP-ENV:Client</faultcode></soap:Fault></soap:Body></soap:Envelope>"
  );
  assert.equal(cleanUpXml("<S:Envelope><S:Body><ns2:BodyPart/></S:Body></S:Envelope>"), "<soap:Envelope><soap:Body><BodyPart/></soap:Body></soap:Envelope>", "only those elements");
});
