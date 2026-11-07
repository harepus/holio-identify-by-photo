import { ArrowLeft, Flashlight } from "lucide-react";
import { ean13, UNKNOWN_CODE, type PurchaseOrder } from "./data";
import { totals } from "./PurchaseOrderPage";
import type { ShellStrings } from "./strings";

type Props = {
  po: PurchaseOrder;
  t: ShellStrings;
  linkedCount: number;
  onBack: () => void;
  onScan: (code: string) => void;
  onIdentify: () => void;
  onSearchManually: () => void;
  onForgetLinks: () => void;
};

export function ScannerPage({ po, t, linkedCount, onBack, onScan, onIdentify, onSearchManually, onForgetLinks }: Props) {
  const { received, expected } = totals(po);
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
      <div className="cam">
        <span className="corner c1" />
        <span className="corner c2" />
        <span className="corner c3" />
        <span className="corner c4" />
        <span className="scanline" />
        <span className="cam-tool" aria-label={t.flashlight}>
          <Flashlight size={22} />
        </span>
        <span className="cam-hint">{t.pointAt}</span>
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
      <section className="sim" aria-label={t.simulate}>
        <div className="sim-head">{t.simulate}</div>
        <div className="sim-grid">
          <button type="button" className="sim-btn sim-unknown" onClick={() => onScan(UNKNOWN_CODE)}>
            <span className="sim-nm">{t.unknownCode}</span>
            <span className="mono">{UNKNOWN_CODE}</span>
          </button>
          {po.lines.map((line) => (
            <button type="button" className="sim-btn" key={line.lineId} onClick={() => onScan(ean13(line.sku))}>
              <span className="sim-nm">
                {line.name} {line.size}
              </span>
              <span className="mono">{ean13(line.sku)}</span>
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
      </section>
    </>
  );
}
