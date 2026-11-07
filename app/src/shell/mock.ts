import type { Identify, IdentifyRequest, IdentifyResponse, Locale } from "../identify";

export const MOCK_MODES = ["match", "choose", "none", "dark", "timeout", "error"] as const;
export type MockMode = (typeof MOCK_MODES)[number];

export function mockModeFrom(search: string): MockMode | null {
  const mode = new URLSearchParams(search).get("mock");
  return MOCK_MODES.find((m) => m === mode) ?? null;
}

const MOCK_DELAY_MS = 2000;

const evidence: Record<string, Record<Locale, string>> = {
  match: {
    en: "The pack says 'Sour Cream & Onion' and '140 g'. Only SKU-1203 matches both.",
    nb: "Pakken sier 'Sour Cream & Onion' og '140 g'. Bare SKU-1203 passer begge.",
  },
  choose: {
    en: "The front looks the same for 65 g and 155 g. The size is not visible.",
    nb: "Forsiden ser lik ut for 65 g og 155 g. Størrelsen er ikke synlig.",
  },
  settled: {
    en: "Photo 2 says '155 g'. Of the Crispo products on this order, only SKU-4252 is 155 g.",
    nb: "Bilde 2 sier '155 g'. Av Crispo-produktene på denne ordren er bare SKU-4252 155 g.",
  },
  none: {
    en: "The pack says 'Freia' and 'Melkesjokolade'. No line on this order has that name.",
    nb: "Pakken sier 'Freia' og 'Melkesjokolade'. Ingen linje på denne ordren har det navnet.",
  },
};

const ranked = (skus: string[]) => skus.map((sku, i) => ({ sku, likelihood: i === 0 ? ("most_likely" as const) : ("possible" as const) }));

function answer(mode: MockMode, req: IdentifyRequest): IdentifyResponse {
  const base = { ms: MOCK_DELAY_MS, readText: [] as string[] };
  if (mode === "choose") {
    return req.photos.length >= 2
      ? { ...base, status: "match", candidates: ranked(["SKU-4252", "SKU-5105"]), evidence: evidence.settled![req.locale], readText: ["Crispo", "155 g"] }
      : { ...base, status: "choose", candidates: ranked(["SKU-4252", "SKU-5105", "SKU-7298"]), evidence: evidence.choose![req.locale], readText: ["Nidar", "Crispo"] };
  }
  if (mode === "none") {
    const readText = ["Freia", "Melkesjokolade", "200 g"];
    return req.context === "lookup" && req.candidates.some((c) => c.sku === "SKU-1254")
      ? { ...base, status: "match", candidates: ranked(["SKU-1254"]), evidence: evidence.none![req.locale], readText }
      : { ...base, status: "none", candidates: [], evidence: evidence.none![req.locale], readText };
  }
  return { ...base, status: "match", candidates: ranked(["SKU-1203", "SKU-6764"]), evidence: evidence.match![req.locale], readText: ["SUPERCHIPS", "SOUR CREAM & ONION", "140 g"] };
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
