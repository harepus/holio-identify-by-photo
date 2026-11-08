import { useState } from "react";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { lineCandidate, productLabel, type PoLine } from "./data";
import type { ReceiptRequest } from "./receiving";

export function ReceiptReview({ line, code, onReceive, onCancel }: { line: PoLine; code?: string; onReceive: (request: ReceiptRequest) => string | null; onCancel: () => void }) {
  const [quantity, setQuantity] = useState("1");
  const [location, setLocation] = useState(line.location ?? "");
  const [link, setLink] = useState(Boolean(code));
  const [error, setError] = useState<string | null>(null);
  const [confirmOver, setConfirmOver] = useState(false);
  const count = Number(quantity);
  const valid = Number.isSafeInteger(count) && count > 0 && location.trim().length > 0;
  const over = line.received + count > line.expected;
  function submit() {
    if (over && !confirmOver) { setConfirmOver(true); return; }
    setError(onReceive({ sku: line.sku, quantity: count, location, code: link ? code : undefined, allowOver: confirmOver }));
  }
  return <section className="sheet review" role="dialog" aria-modal="true" aria-label="Review receipt">
    <h2>Review receipt</h2>
    <div className="product-row"><img src={lineCandidate(line).image} alt="" /><div><h3>{productLabel(lineCandidate(line))}</h3><small>{line.sku}</small></div></div>
    <div className="receipt-progress" aria-label={`Received ${line.received} of ${line.expected}; after receipt ${valid ? line.received + count : "-"} of ${line.expected}`}><span>{line.received}/{line.expected}</span><ArrowRight size={18} aria-hidden="true" /><strong>{valid ? line.received + count : "-"}/{line.expected}</strong></div>
    <label htmlFor="quantity">Quantity</label>
    <div className="stepper"><button aria-label="Decrease quantity" disabled={count <= 1} onClick={() => { setQuantity(String(Math.max(1, count - 1))); setConfirmOver(false); }}><Minus /></button><input id="quantity" inputMode="numeric" type="number" min="1" step="1" value={quantity} onChange={(e) => { setQuantity(e.target.value); setConfirmOver(false); }} /><button aria-label="Increase quantity" onClick={() => { setQuantity(String(count + 1)); setConfirmOver(false); }}><Plus /></button></div>
    <label htmlFor="location">Location</label>
    <input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
    {code ? <label className="check-field"><input type="checkbox" checked={link} onChange={(e) => { setLink(e.target.checked); setError(null); }} /><span>Link barcode {code}</span></label> : null}
    {!valid && <p role="status">{!Number.isSafeInteger(count) || count < 1 ? "Positive whole number required" : "Location required"}</p>}
    {over && valid && <div className="err" role="alert">Over received +{line.received + count - line.expected}</div>}
    {error && <p className="err" role="alert">{error}</p>}
    <div className="review-actions"><button className="btn btn-p" disabled={!valid} onClick={submit}>{confirmOver ? "Receive anyway" : `Receive ${valid ? count : "units"}`}</button><button className="btn btn-s" onClick={onCancel}>Cancel</button></div>
  </section>;
}
