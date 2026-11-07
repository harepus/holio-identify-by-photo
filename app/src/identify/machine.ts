import type { Candidate, IdentifyResponse, Likelihood, PhotoCheck } from "./types";

export const MAX_PHOTOS = 2;

export type RankedCandidate = { candidate: Candidate; likelihood: Likelihood };

/** Photos in shot order. secondForSize: photo 2 was taken from "Add a photo of the size". */
type Shots = { photos: string[]; secondForSize: boolean };

type Choose = Shots & { kind: "result.choose"; ranked: RankedCandidate[]; evidence: string };

export type State =
  | (Shots & { kind: "capture" })
  | (Shots & { kind: "identifying"; startedAt: number; seconds: number; step: 1 | 2 | 3 })
  | (Shots & { kind: "result.match"; ranked: RankedCandidate[]; evidence: string })
  | Choose
  | (Shots & { kind: "register-search"; readText: string[]; startedAt: number })
  | (Shots & { kind: "result.none"; guess: Candidate; evidence: string })
  | (Shots & { kind: "result.nothing" })
  | { kind: "confirm"; choose: Choose; candidate: Candidate }
  | (Shots & { kind: "error.photo"; rejected: string; reason: Exclude<PhotoCheck, "ok"> })
  | (Shots & { kind: "error.network"; retry: { pass: "order" } | { pass: "register"; readText: string[] } })
  | { kind: "link-barcode"; candidate: Candidate; code: string }
  | { kind: "done" };

export type Event =
  | { type: "photo-taken"; photo: string; check: PhotoCheck }
  | { type: "photo-removed" }
  | { type: "identify"; now: number }
  | { type: "tick"; now: number }
  | { type: "cancel" }
  | { type: "answered"; response: IdentifyResponse; candidates: Candidate[]; canSearchRegister: boolean; now: number }
  | { type: "register-answered"; response: IdentifyResponse | null; rows: Candidate[] }
  | { type: "failed" }
  | { type: "retry"; now: number }
  | { type: "not-this" }
  | { type: "add-size-photo" }
  | { type: "pick"; sku: string }
  | { type: "pick-cancel" }
  | { type: "confirmed"; candidate: Candidate; linkCode: string | null }
  | { type: "retake" }
  | { type: "close" };

export const initialState: State = { kind: "capture", photos: [], secondForSize: false };

const STEP_2_AT_MS = 1000;
const STEP_3_AT_MS = 3000;

function shots(s: Shots): Shots {
  return { photos: s.photos, secondForSize: s.secondForSize };
}

function identifying(s: Shots, now: number): State {
  return { ...shots(s), kind: "identifying", startedAt: now, seconds: 0, step: 1 };
}

export function rank(response: IdentifyResponse, candidates: Candidate[]): RankedCandidate[] {
  const bySku = new Map(candidates.map((c) => [c.sku, c]));
  return response.candidates.flatMap((r) => {
    const candidate = bySku.get(r.sku);
    return candidate ? [{ candidate, likelihood: r.likelihood }] : [];
  });
}

export function reduce(state: State, event: Event): State {
  if (event.type === "close") return { kind: "done" };

  switch (state.kind) {
    case "capture":
      switch (event.type) {
        case "photo-taken":
          if (state.photos.length >= MAX_PHOTOS) return state;
          if (event.check !== "ok") return { ...shots(state), kind: "error.photo", rejected: event.photo, reason: event.check };
          return { ...state, photos: [...state.photos, event.photo] };
        case "photo-removed":
          return { ...state, photos: state.photos.slice(0, -1) };
        case "identify":
          return state.photos.length > 0 ? identifying(state, event.now) : state;
        default:
          return state;
      }

    case "identifying":
      switch (event.type) {
        case "tick": {
          const elapsed = event.now - state.startedAt;
          const step = elapsed >= STEP_3_AT_MS ? 3 : elapsed >= STEP_2_AT_MS ? 2 : 1;
          return { ...state, seconds: Math.floor(elapsed / 1000), step };
        }
        case "cancel":
          return { ...shots(state), kind: "capture" };
        case "failed":
          return { ...shots(state), kind: "error.network", retry: { pass: "order" } };
        case "answered": {
          const ranked = rank(event.response, event.candidates);
          const { status, evidence, readText } = event.response;
          if (status === "match" && ranked.length > 0) return { ...shots(state), kind: "result.match", ranked, evidence };
          if (status === "choose" && ranked.length > 0) return { ...shots(state), kind: "result.choose", ranked, evidence };
          if (event.canSearchRegister) return { ...shots(state), kind: "register-search", readText, startedAt: event.now };
          return { ...shots(state), kind: "result.nothing" };
        }
        default:
          return state;
      }

    case "register-search":
      switch (event.type) {
        case "register-answered": {
          const guess = event.response && event.response.status !== "none" ? rank(event.response, event.rows)[0] : undefined;
          if (!event.response || !guess) return { ...shots(state), kind: "result.nothing" };
          return { ...shots(state), kind: "result.none", guess: guess.candidate, evidence: event.response.evidence };
        }
        case "failed":
          return { ...shots(state), kind: "error.network", retry: { pass: "register", readText: state.readText } };
        default:
          return state;
      }

    case "result.match":
      switch (event.type) {
        case "not-this":
          return { ...shots(state), kind: "result.choose", ranked: state.ranked.slice(1), evidence: "" };
        case "confirmed":
          return afterConfirm(event);
        default:
          return state;
      }

    case "result.choose":
      switch (event.type) {
        case "pick": {
          const picked = state.ranked.find((r) => r.candidate.sku === event.sku);
          return picked ? { kind: "confirm", choose: state, candidate: picked.candidate } : state;
        }
        case "add-size-photo":
          return { kind: "capture", photos: state.photos.slice(0, 1), secondForSize: true };
        default:
          return state;
      }

    case "confirm":
      switch (event.type) {
        case "pick-cancel":
          return state.choose;
        case "confirmed":
          return afterConfirm(event);
        default:
          return state;
      }

    case "result.nothing":
      return event.type === "retake" ? { kind: "capture", photos: [], secondForSize: false } : state;

    case "error.photo":
      return event.type === "retake" ? { ...shots(state), kind: "capture" } : state;

    case "error.network":
      if (event.type !== "retry") return state;
      return state.retry.pass === "order"
        ? identifying(state, event.now)
        : { ...shots(state), kind: "register-search", readText: state.retry.readText, startedAt: event.now };

    case "result.none":
    case "link-barcode":
    case "done":
      return state;
  }
}

function afterConfirm(event: Extract<Event, { type: "confirmed" }>): State {
  return event.linkCode ? { kind: "link-barcode", candidate: event.candidate, code: event.linkCode } : { kind: "done" };
}
