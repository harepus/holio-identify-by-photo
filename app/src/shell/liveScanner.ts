import { useEffect, useRef, useState } from "react";

export type CameraState = { kind: "starting" } | { kind: "live" } | { kind: "blocked" } | { kind: "insecure" };

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
const SCAN_EVERY_MS = 150;
const SAME_CODE_PAUSE_MS = 2500;

async function makeDetector(): Promise<Detector> {
  const Native = (window as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } })
    .BarcodeDetector;
  if (Native && (await Native.getSupportedFormats()).includes("ean_13")) return new Native({ formats: FORMATS });
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) } });
  return new BarcodeDetector({ formats: FORMATS as never });
}

const canUseCamera = () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

/** Reads barcodes from the back camera while `active`, and stops the camera otherwise. */
export function useLiveScanner(onCode: (code: string) => void, active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [state, setState] = useState<CameraState>(() => (canUseCamera() ? { kind: "starting" } : { kind: "insecure" }));

  useEffect(() => {
    if (!active || !canUseCamera()) return;
    setState((s) => (s.kind === "blocked" ? s : { kind: "starting" }));
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopped = false;
    let last = { code: "", at: 0 };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        if (!stopped) setState({ kind: "blocked" });
        return;
      }
      const video = videoRef.current;
      if (stopped || !video) return stream.getTracks().forEach((t) => t.stop());
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setState({ kind: "live" });
      const detector = await makeDetector();
      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= 2) {
          const code = (await detector.detect(video).catch(() => []))[0]?.rawValue;
          const now = Date.now();
          if (code && !(code === last.code && now - last.at < SAME_CODE_PAUSE_MS)) {
            last = { code, at: now };
            navigator.vibrate?.(60);
            onCodeRef.current(code);
          } else if (code) {
            last.at = now;
          }
        }
        timer = window.setTimeout(tick, SCAN_EVERY_MS);
      };
      tick();
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  return { videoRef, state };
}
