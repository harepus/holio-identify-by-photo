import { useEffect, useState } from "react";
import type { Candidate } from "../identify";
import { lineCandidate, productLabel, searchRegister, type PoLine, type RegisterProduct } from "./data";

type Register = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; rows: RegisterProduct[] };
export function ManualSearch({ lines, links, onChoose, onClose }: { lines: PoLine[]; links: Record<string, string>; onChoose: (candidate: Candidate) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [register, setRegister] = useState<Register>({ kind: "loading" });
  useEffect(() => {
    if (!all) return;
    let live = true;
    setRegister({ kind: "loading" });
    searchRegister().then((rows) => { if (live) setRegister({ kind: "ready", rows }); }, () => { if (live) setRegister({ kind: "failed" }); });
    return () => { live = false; };
  }, [all, attempt]);
  const rows = all ? register.kind === "ready" ? register.rows : [] : lines.map(lineCandidate);
  const results = rows.filter((row) => `${row.name} ${row.brand ?? ""} ${row.size ?? ""} ${row.sku} ${"barcode" in row ? row.barcode : ""} ${lines.find((l) => l.sku === row.sku)?.barcode ?? ""} ${Object.entries(links).filter(([, sku]) => sku === row.sku).map(([code]) => code).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="search-page" role="dialog" aria-modal="true" aria-label="Search manually">
    <h2>{all ? "Search all products" : "Search order items"}</h2>
    <label htmlFor="search">Name, SKU or barcode</label><input id="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
    <p className="muted">{all ? "All products · not limited to this order" : `On this order · ${lines.length} items`}</p>
    <div className="search-results">
      {all && register.kind === "loading" && <p role="status">Searching all products...</p>}
      {all && register.kind === "failed" && <div role="alert"><p>Could not search all products. Order items are still available.</p><button className="btn btn-s" onClick={() => setAttempt(attempt + 1)}>Try again</button></div>}
      {(!all || register.kind === "ready") && results.length === 0 && <p>No matching {all ? "products" : "order items"}. Try a shorter name.</p>}
      {results.map((row) => <button className="product-row" key={row.sku} onClick={() => onChoose(row)}><img src={row.image} alt="" /><span><small>{row.sku} · {row.size}</small><strong>{productLabel(row)}</strong>{!lines.some((line) => line.sku === row.sku) && <small>Not on this order</small>}</span></button>)}
    </div>
    <div className="review-actions"><button className="btn btn-s" onClick={() => setAll(!all)}>{all ? "Back to order items" : "Search all products"}</button><button className="btn btn-s" onClick={onClose}>Back to scanning</button></div>
  </section>;
}
