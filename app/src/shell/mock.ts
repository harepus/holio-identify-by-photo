import type { Identify, IdentifyRequest, IdentifyResponse } from "../identify";

export const MOCK_MODES = ["match", "choose", "none", "dark", "timeout", "error"] as const;
export type MockMode = (typeof MOCK_MODES)[number];

export function mockModeFrom(search: string): MockMode | null {
  const mode = new URLSearchParams(search).get("mock");
  return MOCK_MODES.find((m) => m === mode) ?? null;
}

const MOCK_DELAY_MS = 2000;

const ranked = (skus: string[]) => skus.map((sku, i) => ({ sku, likelihood: i === 0 ? ("most_likely" as const) : ("possible" as const) }));

function answer(mode: MockMode, req: IdentifyRequest): IdentifyResponse {
  const candidates = req.candidates.slice(0, 3);
  const base = { ms: MOCK_DELAY_MS, readText: [] as string[] };
  if (mode === "none" && req.context !== "lookup") return { ...base, status: "none", candidates: [], evidence: "Mock: no order match. Searching the register." };
  const selected = candidates[1] ?? candidates[0];
  return {
    ...base,
    status: mode === "choose" && req.photos.length < 2 ? "choose" : selected ? "match" : "none",
    candidates: ranked(selected ? [selected.sku, ...candidates.filter((c) => c.sku !== selected.sku).map((c) => c.sku)] : []),
    evidence: `Mock answer for ${selected?.name ?? "no product"}. This does not analyze the uploaded photo.`,
  };
}

/** Canned answers after about 2 s, on the demo order's SKUs. timeout never answers, so the component's own 25 s limit fires. */
export function mockIdentify(mode: MockMode): Identify {
  return (req, signal) =>
    new Promise((resolve, reject) => {
      const timer = mode === "timeout" ? undefined : setTimeout(() => (mode === "error" ? reject(new Error("mock error")) : resolve(answer(mode, req))), MOCK_DELAY_MS);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      }, { once: true });
    });
}
