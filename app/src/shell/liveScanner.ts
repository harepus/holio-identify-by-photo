import { useEffect, useRef, useState } from "react";

export type CameraState = { kind: "starting" } | { kind: "live" } | { kind: "blocked" } | { kind: "insecure" };

type Detector = { detect(source: HTMLVideoElement | HTMLCanvasElement): Promise<{ rawValue: string }[]> };

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
const SCAN_EVERY_MS = 150;
const SAME_CODE_PAUSE_MS = 2500;

async function makeDetector(): Promise<{ detector: Detector; crop: boolean }> {
  const Native = (window as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } })
    .BarcodeDetector;
  if (Native && (await Native.getSupportedFormats()).includes("ean_13")) return { detector: new Native({ formats: FORMATS }), crop: false };
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) } });
  return { detector: new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] }), crop: true };
}

const canUseCamera = () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

/** Reads barcodes from the back camera while `active`, and stops the camera otherwise. */
export function useLiveScanner(onCode: (code: string) => void, active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef({ code: "", at: 0 });
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [state, setState] = useState<CameraState>(() => (canUseCamera() ? { kind: "starting" } : { kind: "insecure" }));

  useEffect(() => {
    if (!active || !canUseCamera()) return;
    setState((s) => (s.kind === "blocked" ? s : { kind: "starting" }));
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopped = false;
    const last = lastRef.current;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      } catch {
        if (!stopped) setState({ kind: "blocked" });
        return;
      }
      const video = videoRef.current;
      if (stopped || !video) return stream.getTracks().forEach((t) => t.stop());
      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.();
      if (track && capabilities && "focusMode" in capabilities && Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
        const focus = { advanced: [{ focusMode: "continuous" }] };
        await track.applyConstraints(focus as MediaTrackConstraints).catch(() => undefined);
      }
      if (stopped) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      if (stopped) return;
      const { detector, crop } = await makeDetector();
      if (stopped) return;
      setState({ kind: "live" });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= 2) {
          let source: HTMLVideoElement | HTMLCanvasElement = video;
          if (crop && context && video.videoWidth && video.videoHeight) {
            const width = Math.round(video.videoWidth * 0.8);
            const height = Math.round(video.videoHeight * 0.5);
            canvas.width = Math.min(width, 1280);
            canvas.height = Math.round(height * canvas.width / width);
            context.drawImage(video, (video.videoWidth - width) / 2, (video.videoHeight - height) / 2, width, height, 0, 0, canvas.width, canvas.height);
            source = canvas;
          }
          const code = (await detector.detect(source).catch(() => []))[0]?.rawValue;
          if (stopped) return;
          const now = Date.now();
          if (code && !(code === last.code && now - last.at < SAME_CODE_PAUSE_MS)) {
            last.code = code;
            last.at = now;
            navigator.vibrate?.(60);
            onCodeRef.current(code);
          } else if (code) {
            last.at = now;
          }
        }
        timer = window.setTimeout(tick, SCAN_EVERY_MS);
      };
      tick();
    })().catch(() => {
      stream?.getTracks().forEach((t) => t.stop());
      if (!stopped) setState({ kind: "blocked" });
    });

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  return { videoRef, state };
}
