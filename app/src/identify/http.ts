import type { Identify, IdentifyResponse, Likelihood } from "./types";

export class IdentifyHttpError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`POST /v1/identify answered ${status}`);
  }
}

const STATUSES = new Set(["match", "choose", "none"]);
const LIKELIHOODS = new Set<string>(["most_likely", "possible"]);

function parseResponse(json: unknown): IdentifyResponse {
  const r = json as Partial<IdentifyResponse> | null;
  const ok =
    r !== null &&
    typeof r === "object" &&
    STATUSES.has(r.status as string) &&
    Array.isArray(r.candidates) &&
    r.candidates.every((c) => typeof c?.sku === "string" && LIKELIHOODS.has(c.likelihood as Likelihood)) &&
    typeof r.evidence === "string" &&
    Array.isArray(r.readText) &&
    r.readText.every((t) => typeof t === "string");
  if (!ok) throw new Error("The identify response does not match the contract");
  return { status: r.status!, candidates: r.candidates!, evidence: r.evidence!, readText: r.readText!, ms: typeof r.ms === "number" ? r.ms : 0 };
}

/** An Identify that posts the request as JSON to a plain URL. */
export function httpIdentify(url: string): Identify {
  return async (req, signal) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
    if (!res.ok) throw new IdentifyHttpError(res.status, await res.text());
    return parseResponse(await res.json());
  };
}
