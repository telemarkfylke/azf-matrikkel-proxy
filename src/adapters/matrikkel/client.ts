import type { Settings } from "../../config/settings.ts";
import { findUnitsRequest, type MatrikkelContext, type ObjectId, type ParsedSoap, postSoap, soapBody, storeRequest } from "./soap.ts";

export type MatrikkelClient = {
  /** The parsed answer to findMatrikkelenheter for a polygon. */
  findUnits(polygon: ReadonlyArray<readonly [number, number]>, ctx: MatrikkelContext): Promise<ParsedSoap>;
  /** The parsed answer to StoreService.getObjects. */
  getObjects(ids: readonly ObjectId[], ctx: MatrikkelContext): Promise<ParsedSoap>;
};

export function createMatrikkelClient(settings: Settings["matrikkel"]): MatrikkelClient {
  return {
    findUnits: (polygon, ctx) => postSoap(settings, "MatrikkelenhetServiceWS", findUnitsRequest(polygon, ctx)),
    getObjects: (ids, ctx) => postSoap(settings, "StoreServiceWS", storeRequest(ids, ctx))
  };
}

export { soapBody };
