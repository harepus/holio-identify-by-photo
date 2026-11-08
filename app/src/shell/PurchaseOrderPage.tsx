import { useEffect, useRef } from "react";
import { Camera, MapPin } from "lucide-react";
import type { Locale } from "../identify";
import { lineCandidate, type PurchaseOrder } from "./data";
import { receiptStatus } from "./receiving";
import type { ShellStrings } from "./strings";

type Props = {
  onReview: (sku: string) => void;
  po: PurchaseOrder;
  t: ShellStrings;
  locale: Locale;
  highlight: string | null;
  photoSkus: Set<string>;
};

export function totals(po: PurchaseOrder) {
  return po.lines.reduce((s, l) => ({ received: s.received + (l.expected > 0 ? l.received : 0), expected: s.expected + l.expected }), { received: 0, expected: 0 });
}

export function PurchaseOrderPage({ po, t, locale, highlight, photoSkus, onReview }: Props) {
  const highlighted = useRef<HTMLDivElement>(null);
  useEffect(() => {
    highlighted.current?.scrollIntoView({ block: "nearest" });
  }, [highlight, po]);
  const { received, expected } = totals(po);
  const status = po.lines.some((line) => line.received > line.expected) ? "Over received" : receiptStatus(received, expected);
  const date = new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(po.date));
  return (
    <>
      <div className="card po-head">
        <div className="row-between">
          <span className={`badge ${status === "Over received" ? "badge-r" : status === "Received" ? "badge-g" : "badge-b"}`}>{status}</span>
          <span className="muted fs14">{date}</span>
        </div>
        <div className="po-supplier">{t.poTitle(po.id)}</div>
        <div className="po-totals"><span><MapPin size={14} aria-hidden="true" />{po.warehouse}</span><strong aria-label={`${received}/${expected} ${t.received}`}>{received}/{expected}</strong></div>
      </div>
      {po.lines.map((line) => (
        <div role="button" tabIndex={0} onClick={() => onReview(line.sku)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onReview(line.sku); } }} className={`line${highlight === line.sku ? " line-hl" : ""}`} key={line.lineId} ref={highlight === line.sku ? highlighted : undefined}>
          <div className="line-th">
            <img src={lineCandidate(line).image} alt="" />
          </div>
          <div className="line-tx">
            <div className="line-sku">
              {line.sku} · {line.size}
            </div>
            <div className="line-nm">{line.name}</div><span className="line-location" aria-label={`Location ${line.location ?? "not set"}`}><MapPin size={13} aria-hidden="true" />{line.location ?? "Not set"}</span><span className={`badge ${line.received > line.expected ? "badge-r" : line.received === line.expected ? "badge-g" : "badge-b"}`}>{receiptStatus(line.received, line.expected)}</span>
            {photoSkus.has(line.sku) && (
              <span className="tag" role="img" aria-label={t.identifiedTag}><Camera size={12} aria-hidden="true" /></span>
            )}
          </div>
          <div className="line-ct" aria-label={`${line.received}/${line.expected} ${t.received}`}>
            <b>
              {line.expected === 0 ? t.extraCount(line.received) : `${line.received}/${line.expected}`}
            </b>
          </div>
        </div>
      ))}
      <a className="link pc-link" href="#/pc">
        {t.pcLink}
      </a>
    </>
  );
}
