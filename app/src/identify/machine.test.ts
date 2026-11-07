import { describe, expect, it } from "vitest";
import { initialState, reduce, type Event, type State } from "./machine";
import type { Candidate, IdentifyResponse } from "./types";

const c = (sku: string, name = sku): Candidate => ({ sku, name, image: `/img/${sku}.jpg` });
const order = [c("SKU-1203", "Sour Cream"), c("SKU-6764", "Paprika"), c("SKU-4252", "Crispo 155"), c("SKU-5105", "Crispo 65")];
const register = [c("SKU-1254", "Melkesjokolade"), c("SKU-9999", "Other")];

const response = (status: IdentifyResponse["status"], skus: string[], extra: Partial<IdentifyResponse> = {}): IdentifyResponse => ({
  status,
  candidates: skus.map((sku, i) => ({ sku, likelihood: i === 0 ? "most_likely" : "possible" })),
  evidence: `evidence for ${status}`,
  readText: ["Freia", "Melkesjokolade"],
  ms: 100,
  ...extra,
});

const run = (events: Event[], from: State = initialState): State => events.reduce(reduce, from);

const capture1 = run([{ type: "photo-taken", photo: "p1", check: "ok" }]);
const capture2 = run([{ type: "photo-taken", photo: "p2", check: "ok" }], capture1);
const identifying = run([{ type: "identify", now: 10_000 }], capture1);
const answered = (r: IdentifyResponse, canSearchRegister = true): Event => ({ type: "answered", response: r, candidates: order, canSearchRegister, now: 20_000 });
const match = run([answered(response("match", ["SKU-1203", "SKU-6764"]))], identifying);
const choose = run([answered(response("choose", ["SKU-4252", "SKU-5105"]))], identifying);
const registerSearch = run([answered(response("none", ["SKU-6764"]))], identifying);

describe("capture", () => {
  it("starts with no photos", () => {
    expect(initialState).toMatchObject({ kind: "capture", photos: [] });
  });

  it("keeps photos in shot order and caps them at two", () => {
    const three = run([{ type: "photo-taken", photo: "p3", check: "ok" }], capture2);
    expect(three).toMatchObject({ kind: "capture", photos: ["p1", "p2"] });
  });

  it("sends a dark or blurred photo to the photo error without keeping it", () => {
    expect(run([{ type: "photo-taken", photo: "dark", check: "dark" }], capture1)).toMatchObject({
      kind: "error.photo",
      photos: ["p1"],
      rejected: "dark",
      reason: "dark",
    });
    expect(run([{ type: "photo-taken", photo: "blur", check: "blurred" }])).toMatchObject({ kind: "error.photo", reason: "blurred" });
  });

  it("removes the last photo", () => {
    expect(run([{ type: "photo-removed" }], capture2)).toMatchObject({ kind: "capture", photos: ["p1"] });
  });

  it("identifies only with a photo", () => {
    expect(run([{ type: "identify", now: 1 }])).toBe(initialState);
    expect(identifying).toMatchObject({ kind: "identifying", photos: ["p1"], startedAt: 10_000, seconds: 0, step: 1 });
  });
});

describe("identifying", () => {
  it("ticks step 1 off at 1 s and step 2 at 3 s, and counts whole seconds", () => {
    const at = (ms: number) => run([{ type: "tick", now: 10_000 + ms }], identifying);
    expect(at(900)).toMatchObject({ step: 1, seconds: 0 });
    expect(at(1000)).toMatchObject({ step: 2, seconds: 1 });
    expect(at(2999)).toMatchObject({ step: 2, seconds: 2 });
    expect(at(3000)).toMatchObject({ step: 3, seconds: 3 });
    expect(at(24_500)).toMatchObject({ step: 3, seconds: 24 });
  });

  it("returns to capture with the photos kept on cancel", () => {
    expect(run([{ type: "cancel" }], identifying)).toMatchObject({ kind: "capture", photos: ["p1"] });
  });

  it("goes to the network error on failure, and Try again identifies again", () => {
    const failed = run([{ type: "failed" }], identifying);
    expect(failed).toMatchObject({ kind: "error.network", photos: ["p1"] });
    expect(run([{ type: "retry", now: 50_000 }], failed)).toMatchObject({ kind: "identifying", photos: ["p1"], startedAt: 50_000 });
  });

  it("shows a match with the candidates resolved to products, best first", () => {
    expect(match).toMatchObject({
      kind: "result.match",
      evidence: "evidence for match",
      ranked: [
        { candidate: order[0], likelihood: "most_likely" },
        { candidate: order[1], likelihood: "possible" },
      ],
    });
  });

  it("shows choose with up to three ranked products", () => {
    expect(choose).toMatchObject({ kind: "result.choose", ranked: [{ candidate: order[2] }, { candidate: order[3] }] });
  });

  it("drops candidates the request did not send", () => {
    const s = run([answered(response("choose", ["SKU-0000", "SKU-5105"]))], identifying);
    expect(s).toMatchObject({ kind: "result.choose", ranked: [{ candidate: order[3] }] });
  });

  it("searches the register on none when the host can, with the text read", () => {
    expect(registerSearch).toMatchObject({ kind: "register-search", readText: ["Freia", "Melkesjokolade"], photos: ["p1"] });
  });

  it("goes straight to no matching product on none when the host cannot search the register", () => {
    expect(run([answered(response("none", []), false)], identifying)).toMatchObject({ kind: "result.nothing" });
  });

  it("treats a match with no known candidate as none", () => {
    expect(run([answered(response("match", ["SKU-0000"]), false)], identifying)).toMatchObject({ kind: "result.nothing" });
  });
});

describe("register search", () => {
  it("shows the best guess from the register", () => {
    const s = run([{ type: "register-answered", response: response("choose", ["SKU-1254", "SKU-9999"]), rows: register }], registerSearch);
    expect(s).toMatchObject({ kind: "result.none", guess: register[0], evidence: "evidence for choose" });
  });

  it("shows no matching product when the second pass also says none", () => {
    const s = run([{ type: "register-answered", response: response("none", ["SKU-1254"]), rows: register }], registerSearch);
    expect(s).toMatchObject({ kind: "result.nothing" });
  });

  it("shows no matching product when the host search returned no rows", () => {
    expect(run([{ type: "register-answered", response: null, rows: [] }], registerSearch)).toMatchObject({ kind: "result.nothing" });
  });

  it("retries the register pass, not the order pass, after a failure", () => {
    const failed = run([{ type: "failed" }], registerSearch);
    expect(failed).toMatchObject({ kind: "error.network" });
    expect(run([{ type: "retry", now: 60_000 }], failed)).toMatchObject({ kind: "register-search", readText: ["Freia", "Melkesjokolade"], startedAt: 60_000 });
  });
});

describe("result", () => {
  it("Not this product offers the remaining candidates", () => {
    const s = run([{ type: "not-this" }], match);
    expect(s).toMatchObject({ kind: "result.choose", ranked: [{ candidate: order[1] }], evidence: "" });
  });

  it("Confirm on a match finishes without a scanned code", () => {
    expect(run([{ type: "confirmed", candidate: order[0]!, linkCode: null }], match)).toEqual({ kind: "done" });
  });

  it("Confirm on a match offers to link the scanned code", () => {
    expect(run([{ type: "confirmed", candidate: order[0]!, linkCode: "7031234567890" }], match)).toEqual({
      kind: "link-barcode",
      candidate: order[0],
      code: "7031234567890",
    });
  });

  it("a row tap asks first, and Cancel goes back to the same list", () => {
    const asking = run([{ type: "pick", sku: "SKU-5105" }], choose);
    expect(asking).toMatchObject({ kind: "confirm", candidate: order[3] });
    expect(run([{ type: "pick-cancel" }], asking)).toBe(choose);
    expect(run([{ type: "confirmed", candidate: order[3]!, linkCode: null }], asking)).toEqual({ kind: "done" });
  });

  it("ignores a tap on a product that is not in the list", () => {
    expect(run([{ type: "pick", sku: "SKU-1203" }], choose)).toBe(choose);
  });

  it("Add a photo of the size keeps photo 1 and marks photo 2 as the size photo", () => {
    const fromTwo = run([{ type: "identify", now: 1 }, answered(response("choose", ["SKU-4252"]))], capture2);
    const s = run([{ type: "add-size-photo" }], fromTwo);
    expect(s).toEqual({ kind: "capture", photos: ["p1"], secondForSize: true });
    const rematch = run([{ type: "photo-taken", photo: "label", check: "ok" }, { type: "identify", now: 2 }, answered(response("match", ["SKU-4252"]))], s);
    expect(rematch).toMatchObject({ kind: "result.match", photos: ["p1", "label"], secondForSize: true });
  });

  it("Retake from no matching product starts a fresh capture", () => {
    const nothing = run([answered(response("none", []), false)], identifying);
    expect(run([{ type: "retake" }], nothing)).toEqual(initialState);
  });
});

describe("photo error", () => {
  it("Retake discards the rejected photo and keeps the good ones", () => {
    const err = run([{ type: "photo-taken", photo: "dark", check: "dark" }], capture1);
    expect(run([{ type: "retake" }], err)).toEqual({ kind: "capture", photos: ["p1"], secondForSize: false });
  });
});

describe("close", () => {
  it("finishes from every state", () => {
    for (const s of [capture1, identifying, match, choose, registerSearch]) {
      expect(reduce(s, { type: "close" })).toEqual({ kind: "done" });
    }
  });

  it("the link sheet finishes on close and ignores everything else", () => {
    const link = run([{ type: "confirmed", candidate: order[0]!, linkCode: "703" }], match);
    expect(run([{ type: "retake" }, { type: "cancel" }], link)).toBe(link);
    expect(run([{ type: "close" }], link)).toEqual({ kind: "done" });
  });
});
