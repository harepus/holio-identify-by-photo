import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { lineBarcode, UNKNOWN_CODE, type PurchaseOrder } from "./data";
import { useLiveScanner } from "./liveScanner";
import { totals } from "./PurchaseOrderPage";
import type { ShellStrings } from "./strings";

type Props = {
  onUndo?: () => void;
  receipt: { id: number; text: string; image: string } | null;
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

export function ScannerPage({ receipt, po, t, linkedCount, paused, onScan, onIdentify, onSearchManually, onForgetLinks, onUndo }: Props) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!receipt) { setFlash(false); return; }
    setFlash(true);

    const flashTimer = setTimeout(() => setFlash(false), 600);

    return () => { clearTimeout(flashTimer); };
  }, [receipt]);
  const { received, expected } = totals(po);
  const { videoRef, state: cam } = useLiveScanner(onScan, !paused);
  const message = { starting: t.camStarting, blocked: t.camBlocked, insecure: t.camNeedsHttps, live: null }[cam.kind];
  return (
    <>
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

        {cam.kind === "live" && <span className="cam-hint">{t.pointAt}</span>}
      </div>
      {receipt && <div className="scan-banner" role="status"><img src={receipt.image} alt="" /><Check size={20} /><span>{receipt.text}</span></div>}
      <div className="scanner-actions">
        {onUndo && <button className="btn btn-s" onClick={onUndo}>Undo last receipt</button>}
        <button className="btn btn-s" onClick={onIdentify}>No barcode?</button>
        <button className="btn btn-s" onClick={onSearchManually}>Search manually</button>
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
