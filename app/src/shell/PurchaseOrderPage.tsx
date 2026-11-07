import { ArrowLeft, Camera } from "lucide-react";
import type { Locale } from "../identify";
import type { PurchaseOrder } from "./data";
import type { ShellStrings } from "./strings";

type Props = {
  po: PurchaseOrder;
  t: ShellStrings;
  locale: Locale;
  highlight: string | null;
  photoSkus: Set<string>;
};

export function totals(po: PurchaseOrder) {
  return po.lines.reduce((s, l) => ({ received: s.received + l.received, expected: s.expected + l.expected }), { received: 0, expected: 0 });
}

export function PurchaseOrderPage({ po, t, locale, highlight, photoSkus }: Props) {
  const { received, expected } = totals(po);
  const done = received >= expected;
  const date = new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(po.date));
  return (
    <>
      <h1 className="title">
        <ArrowLeft size={28} strokeWidth={1.8} aria-hidden="true" />
        {t.poTitle(po.id)}
      </h1>
      <div className="card po-head">
        <div className="row-between">
          <span className={`badge ${done ? "badge-g" : "badge-o"}`}>{done ? t.receivedStatus : t.underReceived}</span>
          <span className="muted fs14">{date}</span>
        </div>
        <div className="po-supplier">{po.supplier}</div>
        <div className="muted fs14">
          {po.warehouse} · {po.company} · {received}/{expected} {t.received}
        </div>
      </div>
      {po.lines.map((line) => (
        <div className={`line${highlight === line.sku ? " line-hl" : ""}`} key={line.lineId}>
          <div className="line-th">
            <img src={`/demo/${line.image}`} alt="" />
          </div>
          <div className="line-tx">
            <div className="line-sku">
              {line.sku} · {line.size}
            </div>
            <div className="line-nm">{line.name}</div>
            {photoSkus.has(line.sku) && (
              <span className="tag">
                <Camera size={12} />
                {t.identifiedTag}
              </span>
            )}
          </div>
          <div className="line-ct">
            <b>
              {line.received}/{line.expected}
            </b>
            {t.received}
          </div>
        </div>
      ))}
      <a className="link pc-link" href="#/pc">
        {t.pcLink}
      </a>
    </>
  );
}
