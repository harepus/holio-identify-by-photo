import { useEffect, useLayoutEffect, useReducer, useRef, type ChangeEvent } from "react";
import { initialState, reduce } from "./machine";
import { checkPhotoOnDevice, preparePhoto } from "./photo";
import { Screen, type Actions } from "./screens";
import { strings } from "./strings";
import type { Candidate, IdentifyByPhotoProps, IdentifyResponse, PhotoResult } from "./types";
import "./identify.css";

export const TIMEOUT_MS = 25_000;
const TICK_MS = 250;

/** Codes the link-barcode sheet was shown for in this page session. */
const offeredCodes = new Set<string>();

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
}

/** Runs one request pass per key with the 25 s budget. onFail runs on an error or timeout, unless the component already left the pass. */
function usePass(key: number | null, run: (signal: AbortSignal) => Promise<void>, onFail: () => void) {
  const latest = useRef({ run, onFail });
  useLayoutEffect(() => {
    latest.current = { run, onFail };
  });
  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    let live = true;
    const timer = setTimeout(() => controller.abort(new Error("timeout")), TIMEOUT_MS);
    Promise.race([latest.current.run(controller.signal), rejectOnAbort(controller.signal)])
      .catch(() => {
        if (live) latest.current.onFail();
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort(new Error("left"));
    };
  }, [key]);
}

export function IdentifyByPhoto(props: IdentifyByPhotoProps) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const firstPhotoAt = useRef<number | null>(null);
  const firstTopSku = useRef<string | null | undefined>(undefined);
  const t = props.reviewBeforeReceive ? { ...strings[props.locale], confirm: "Review receipt" } : strings[props.locale];

  usePass(
    state.kind === "identifying" ? state.startedAt : null,
    async (signal) => {
      if (state.kind !== "identifying") return;
      const p = latest.current;
      const response = await p.identify(
        { photos: state.photos, candidates: p.candidates, scannedCode: p.scannedCode, context: p.context, locale: p.locale },
        signal,
      );
      if (signal.aborted) return;
      if (firstTopSku.current === undefined) firstTopSku.current = response.candidates[0]?.sku ?? null;
      dispatch({ type: "answered", response, candidates: p.candidates, canSearchRegister: Boolean(p.onSearchRegister), now: Date.now() });
    },
    () => dispatch({ type: "failed" }),
  );

  usePass(
    state.kind === "register-search" ? state.startedAt : null,
    async (signal) => {
      if (state.kind !== "register-search") return;
      const p = latest.current;
      const rows = (await p.onSearchRegister?.(state.readText)) ?? [];
      let response: IdentifyResponse | null = null;
      if (rows.length > 0 && !signal.aborted) {
        response = await p.identify({ photos: state.photos, candidates: rows, scannedCode: p.scannedCode, context: "lookup", locale: p.locale }, signal);
      }
      if (!signal.aborted) dispatch({ type: "register-answered", response, rows });
    },
    () => dispatch({ type: "failed" }),
  );

  const identifyingSince = state.kind === "identifying" ? state.startedAt : null;
  useEffect(() => {
    if (identifyingSince === null) return;
    const id = setInterval(() => dispatch({ type: "tick", now: Date.now() }), TICK_MS);
    return () => clearInterval(id);
  }, [identifyingSince]);

  useEffect(() => {
    if (state.kind === "done") latest.current.onClose();
  }, [state.kind]);

  const openCamera = () => fileInput.current?.click();

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const photo = await preparePhoto(file);
    const check = await (latest.current.checkPhoto ?? checkPhotoOnDevice)(photo);
    firstPhotoAt.current ??= Date.now();
    dispatch({ type: "photo-taken", photo, check });
  }

  const result = (candidate: Candidate): PhotoResult => {
    const answer = state.kind === "confirm" ? state.choose : state;
    return {
      sku: candidate.sku,
      source: "photo",
      evidence: "evidence" in answer ? answer.evidence : "",
      status: answer.kind === "result.match" ? "match" : answer.kind === "result.none" ? "none" : "choose",
      photos: "photos" in answer ? answer.photos.length : 0,
      firstSuggestion: firstTopSku.current === candidate.sku,
      ms: Date.now() - (firstPhotoAt.current ?? Date.now()),
    };
  };

  const actions: Actions = {
    close: () => dispatch({ type: "close" }),
    openCamera,
    removePhoto: () => dispatch({ type: "photo-removed" }),
    identify: () => dispatch({ type: "identify", now: Date.now() }),
    cancel: () => dispatch({ type: "cancel" }),
    retry: () => dispatch({ type: "retry", now: Date.now() }),
    retake: () => {
      dispatch({ type: "retake" });
      openCamera();
    },
    notThis: () => dispatch({ type: "not-this" }),
    addSizePhoto: () => {
      dispatch({ type: "add-size-photo" });
      openCamera();
    },
    pick: (sku) => dispatch({ type: "pick", sku }),
    pickCancel: () => dispatch({ type: "pick-cancel" }),
    confirm: (candidate) => {
      const code = latest.current.scannedCode;
      const linkCode = !latest.current.reviewBeforeReceive && code && !offeredCodes.has(code) ? code : null;
      if (linkCode) offeredCodes.add(linkCode);
      latest.current.onConfirm(result(candidate));
      dispatch({ type: "confirmed", candidate, linkCode });
    },
    deviation: (candidate) => {
      latest.current.onDeviation(result(candidate));
      dispatch({ type: "close" });
    },
    searchManually: () => {
      latest.current.onSearchManually();
      dispatch({ type: "close" });
    },
    link: (candidate, code) => {
      latest.current.onLinkBarcode({ sku: candidate.sku, code });
      dispatch({ type: "close" });
    },
  };

  return (
    <div className={`hid${state.kind === "link-barcode" ? " hid-overlay" : ""}`} lang={props.locale}>
      <input ref={fileInput} className="hid-file" type="file" accept="image/*" capture="environment" onChange={onFile} tabIndex={-1} aria-hidden="true" />
      <Screen
        state={state}
        t={t}
        actions={actions}
        context={props.context}
        contextLabel={props.contextLabel}
        progress={props.progress}
      />
    </div>
  );
}
