import { afterEach, describe, expect, it, vi } from "vitest";
import { httpIdentify, IdentifyHttpError } from "./http";
import type { IdentifyRequest } from "./types";

const req: IdentifyRequest = { photos: ["data:image/jpeg;base64,AAA"], candidates: [{ sku: "SKU-1", name: "One", image: "/demo/img/SKU-1.jpg" }], context: "receiving", locale: "en" };
const body = { status: "match", candidates: [{ sku: "SKU-1", likelihood: "most_likely" }], evidence: "e", readText: ["ONE"], ms: 5 };

function respond(status: number, json: unknown) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(json), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("httpIdentify", () => {
  it("posts the request as JSON and returns the answer", async () => {
    const fetch = respond(200, body);
    const signal = new AbortController().signal;
    await expect(httpIdentify("/v1/identify")(req, signal)).resolves.toEqual(body);
    expect(fetch).toHaveBeenCalledWith("/v1/identify", expect.objectContaining({ method: "POST", signal, body: JSON.stringify(req) }));
  });

  it("rejects with the HTTP status on an error answer", async () => {
    respond(503, { error: "model_unavailable" });
    await expect(httpIdentify("/v1/identify")(req, new AbortController().signal)).rejects.toMatchObject({ status: 503 });
    await expect(httpIdentify("/v1/identify")(req, new AbortController().signal)).rejects.toBeInstanceOf(IdentifyHttpError);
  });

  it("rejects an answer that breaks the contract", async () => {
    respond(200, { ...body, candidates: [{ sku: "SKU-1", likelihood: 0.9 }] });
    await expect(httpIdentify("/v1/identify")(req, new AbortController().signal)).rejects.toThrow("contract");
  });
});
