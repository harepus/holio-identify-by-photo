import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { lineBarcode, UNKNOWN_CODE, type PurchaseOrder } from "./data";
import { useLiveScanner } from "./liveScanner";
import { totals } from "./PurchaseOrderPage";
import type { ShellStrings } from "./strings";

type Props = {
  receipt: { id: number; text: string } | null;
  po: PurchaseOrder;
  t: ShellStrings;
  linkedCount: number;
  paused: boolean;
  onBack: () => void;
  onScan: (code: string) => void;
  onIdentify: () => void;
  onSearchManually: () => void;
  onForgetLinks: () => void;
};

export function ScannerPage({ receipt, po, t, linkedCount, paused, onBack, onScan, onIdentify, onSearchManually, onForgetLinks }: Props) {
  const [flash, setFlash] = useState(false);
  const [banner, setBanner] = useState(false);
  useEffect(() => {
    if (!receipt) return;
    setFlash(true);
    setBanner(true);
    const flashTimer = setTimeout(() => setFlash(false), 600);
    const bannerTimer = setTimeout(() => setBanner(false), 2500);
    return () => { clearTimeout(flashTimer); clearTimeout(bannerTimer); };
  }, [receipt]);
  const { received, expected } = totals(po);
  const { videoRef, state: cam } = useLiveScanner(onScan, !paused);
  const message = { starting: t.camStarting, blocked: t.camBlocked, insecure: t.camNeedsHttps, live: null }[cam.kind];
  return (
    <>
      <h1 className="title">
        <button type="button" className="icon-btn" aria-label={t.back} onClick={onBack}>
          <ArrowLeft size={28} strokeWidth={1.8} />
        </button>
        {t.scanner}
      </h1>
      <div className="sub">
        {t.poTitle(po.id)} · {received}/{expected} {t.received}
      </div>
      <div className={`cam${flash ? " cam-received" : ""}`} data-camera={cam.kind}>
        {cam.kind !== "insecure" && <video ref={videoRef} className="cam-video" playsInline muted aria-hidden="true" />}
        {message && <span className="cam-msg">{message}</span>}
        <span className="corner c1" />
        <span className="corner c2" />
        <span className="corner c3" />
        <span className="corner c4" />
        {cam.kind === "live" && <span className="scanline" />}
        {banner && receipt && !paused && <div className="scan-banner" role="status"><Check size={20} /><span>{receipt.text}</span></div>}
        {cam.kind === "live" && <span className="cam-hint">{t.pointAt}</span>}
      </div>
      <div className="center mt14">
        <button type="button" className="link" onClick={onIdentify}>
          {t.noBarcode}
        </button>
      </div>
      <div className="center mt10">
        <button type="button" className="link muted" onClick={onSearchManually}>
          {t.searchManually}
        </button>
      </div>
      <details className="sim">
        <summary>{t.demoTools}</summary>
        <div className="sim-head">{t.simulate}</div>
        <div className="sim-grid">
          <button type="button" className="sim-btn sim-unknown" onClick={() => onScan(UNKNOWN_CODE)}>
            <span className="sim-nm">{t.unknownCode}</span>
            <span className="mono">{UNKNOWN_CODE}</span>
          </button>
          {po.notOnOrder.map((product) => (
            <button type="button" className="sim-btn sim-unknown" key={product.sku} onClick={() => onScan(lineBarcode(product))}>
              <span className="sim-nm">{product.name} {product.size}</span>
              <span className="mono">{lineBarcode(product)}</span>
            </button>
          ))}
          {po.lines.filter((line) => line.expected > 0).map((line) => (
            <button type="button" className="sim-btn" key={line.lineId} onClick={() => onScan(lineBarcode(line))}>
              <span className="sim-nm">
                {line.name} {line.size}
              </span>
              <span className="mono">{lineBarcode(line)}</span>
            </button>
          ))}
        </div>
        {linkedCount > 0 && (
          <div className="center mt10">
            <button type="button" className="link muted fs13" onClick={onForgetLinks}>
              {t.forgetLinks(linkedCount)}
            </button>
          </div>
        )}
      </details>
    </>
  );
}
