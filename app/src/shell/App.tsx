import { useEffect, useState } from "react";
import { ArrowLeft, Camera } from "lucide-react";
import { IdentifyByPhoto, httpIdentify, type Candidate, type PhotoCheck, type PhotoResult } from "../identify";
import { lineBarcode, lineCandidate, loadPurchaseOrder, readLinks, searchRegister, writeLinks, type PurchaseOrder } from "./data";
import { mockIdentify, mockModeFrom } from "./mock";
import { PcPanel } from "./PcPanel";
import { PurchaseOrderPage } from "./PurchaseOrderPage";
import { ScannerPage } from "./ScannerPage";
import { ManualSearch } from "./ManualSearch";
import { ReceiptReview } from "./ReceiptReview";
import { useOverlayFocus } from "./useOverlayFocus";
import { receive, undoReceipt, type Receiving, type ReceiptRequest } from "./receiving";
import { readSession, writeSession, type SessionEvent } from "./session";
import { shellStrings } from "./strings";
import "./shell.css";

const mock = mockModeFrom(location.search);
const identify = mock ? mockIdentify(mock) : httpIdentify("/v1/identify");
const checkPhoto = mock === "dark" ? async (): Promise<PhotoCheck> => "dark" : undefined;
const t = shellStrings.en;
type Load = { status: "loading" } | { status: "failed" } | { status: "ready"; po: PurchaseOrder; receiving: Receiving };
type Overlay = { kind: "none" } | { kind: "unknown"; code?: string } | { kind: "identify"; code?: string } | { kind: "search"; code?: string } | { kind: "review"; sku: string; code?: string; photo?: PhotoResult } | { kind: "off-order"; product: Candidate; code?: string };

export function App() {
  const [hash, setHash] = useState(location.hash);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [view, setView] = useState<"po" | "scanner">("po");
  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const overlayFocus = useOverlayFocus(overlay.kind);
  const [receipt, setReceipt] = useState<{ id: number; text: string; image: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [photoSkus, setPhotoSkus] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<SessionEvent[]>(readSession);
  function reload() {
    setLoad({ status: "loading" });
    loadPurchaseOrder().then((po) => setLoad({ status: "ready", po, receiving: { lines: po.lines, links: readLinks(), last: null } }), () => setLoad({ status: "failed" }));
  }
  useEffect(reload, []);
  useEffect(() => { const onHash = () => setHash(location.hash); window.addEventListener("hashchange", onHash); return () => window.removeEventListener("hashchange", onHash); }, []);
  useEffect(() => writeSession(events), [events]);
  const po = load.status === "ready" ? { ...load.po, lines: load.receiving.lines } : null;
  if (hash === "#/pc") return <PcPanel events={events} company={po?.company ?? ""} warehouse={po?.warehouse ?? ""} t={t} locale="en" />;

  function commit(request: ReceiptRequest): string | null {
    if (load.status !== "ready") return "Order unavailable";
    try {
      const next = receive(load.receiving, request);
      const line = next.lines.find((item) => item.sku === request.sku);
      if (!line) return "Order item unavailable";
      setLoad({ ...load, receiving: next });
      writeLinks(next.links);
      setReceipt({ id: Date.now(), image: lineCandidate(line).image, text: `+${request.quantity} ${line.name} ${line.size} · ${line.received}/${line.expected} · ${request.location}` });
      setNotice("");
      if (overlay.kind === "review" && overlay.photo) {
        const result = overlay.photo;
        setPhotoSkus((current) => new Set(current).add(line.sku));
        setEvents((current) => [...current, { kind: "photo", at: Date.now(), order: t.poTitle(load.po.id), mock: Boolean(mock), result, product: lineCandidate(line), linked: Boolean(request.code) }]);
      }
      setOverlay({ kind: "none" });
      setView("scanner");
      return null;
    } catch (error) { return error instanceof Error ? error.message : "Receipt failed"; }
  }
  function scan(code: string) {
    if (load.status !== "ready" || overlay.kind !== "none") return;
    const line = load.receiving.lines.find((item) => lineBarcode(item) === code || load.receiving.links[code] === item.sku);
    if (line) {
      if (line.received >= line.expected || !line.location) setOverlay({ kind: "review", sku: line.sku });
      else { const error = commit({ sku: line.sku, quantity: 1, location: line.location }); if (error) setNotice(error); }
    } else {
      const extra = load.po.notOnOrder.find((item) => lineBarcode(item) === code);
      if (extra) setOverlay({ kind: "off-order", product: { ...extra, image: `/demo/${extra.image}` }, code });
      else setOverlay({ kind: "unknown", code });
    }
  }
  function search() {
    setOverlay({ kind: "search", code: "code" in overlay ? overlay.code : undefined });
  }
  function photoConfirmed(result: PhotoResult) {
    const code = overlay.kind === "identify" ? overlay.code : undefined;
    setOverlay({ kind: "review", sku: result.sku, code, photo: result });
  }
  const close = () => setOverlay({ kind: "none" });
  const reviewLine = overlay.kind === "review" ? po?.lines.find((line) => line.sku === overlay.sku) : undefined;
  return <div className="app" onKeyDown={(event) => {
    if (overlay.kind !== "none" && event.key === "Escape") { event.preventDefault(); close(); }
    else overlayFocus.onKeyDown(event);
  }}>
    <header className="apphead" inert={overlay.kind !== "none"}>
      {view === "scanner" && <button className="icon-btn" aria-label="Back" onClick={() => { close(); setView("po"); }}><ArrowLeft /></button>}
      <div className="name">{view === "po" ? "Receive order" : "Scan items"}</div>
      <span className="sp" /><span className="chip-demo">Demo</span>{mock && <span className="chip-mock">Mock: {mock}</span>}
    </header>
    <main className="stage" ref={overlayFocus.stage}>
      <div className="page" key={view} inert={overlay.kind !== "none"} aria-hidden={overlay.kind !== "none"}>
        {load.status === "loading" && <h2 role="status">Loading purchase order</h2>}
        {load.status === "failed" && <div className="err"><h2>Order unavailable</h2><button className="btn btn-s" onClick={reload}>Try again</button></div>}
        {po && po.lines.length === 0 && <h2>No items to receive</h2>}
        {po && view === "po" && <PurchaseOrderPage po={po} t={t} locale="en" highlight={null} photoSkus={photoSkus} onReview={(sku) => setOverlay({ kind: "review", sku })} />}
        {po && load.status === "ready" && view === "scanner" && <ScannerPage receipt={receipt} po={po} t={t} linkedCount={Object.keys(load.receiving.links).length} paused={overlay.kind !== "none"} onBack={() => setView("po")} onScan={scan} onIdentify={() => setOverlay({ kind: "unknown" })} onSearchManually={search} onForgetLinks={() => { writeLinks({}); setLoad({ ...load, receiving: { ...load.receiving, links: {} } }); }} onUndo={load.receiving.last ? () => { setLoad({ ...load, receiving: undoReceipt(load.receiving) }); setReceipt(null); setNotice("Receipt undone"); } : undefined} />}
        {notice && <p role="status" className="card">{notice}</p>}
      </div>
      {po && po.lines.length > 0 && view === "po" && overlay.kind === "none" && <button className="fab" aria-label="Open scanner" onClick={() => setView("scanner")}><Camera /> Scan</button>}
      {overlay.kind !== "none" && overlay.kind !== "identify" && <div className="dim" />}
      {overlay.kind === "unknown" && <section className="sheet" role="dialog" aria-modal="true" aria-label={overlay.code ? "Unknown barcode" : "No barcode"}>
        <h2>{overlay.code ? "Unknown barcode" : "No barcode"}</h2>{overlay.code && <div className="sheet-code mono">{overlay.code}</div>}
        <div className="btncol"><button className="btn btn-s" onClick={() => setOverlay({ kind: "identify", code: overlay.code })}>Identify by photo</button><button className="btn btn-s" onClick={search}>Search manually</button><button className="btn btn-s" onClick={close}>Back to scanning</button></div>
      </section>}
      {po && load.status === "ready" && overlay.kind === "search" && <ManualSearch lines={po.lines} links={load.receiving.links} onClose={close} onChoose={(product) => setOverlay(po.lines.some((line) => line.sku === product.sku) ? { kind: "review", sku: product.sku, code: overlay.code } : { kind: "off-order", product, code: overlay.code })} />}
      {reviewLine && overlay.kind === "review" && <ReceiptReview line={reviewLine} code={overlay.code} onReceive={commit} onCancel={close} />}
      {overlay.kind === "off-order" && <section className="sheet" role="dialog" aria-modal="true" aria-label="Not on this order"><h2>Not on {po ? t.poTitle(po.id) : "this order"}</h2><div className="product-row"><img src={overlay.product.image} alt="" /><strong>{overlay.product.name} {overlay.product.size}</strong></div><div className="btncol"><button className="btn btn-s" onClick={close}>Back to scanning</button><button className="btn btn-s" onClick={search}>Search manually</button></div></section>}
      {po && overlay.kind === "identify" && <IdentifyByPhoto candidates={po.lines.map(lineCandidate)} scannedCode={overlay.code} context="receiving" locale="en" identify={identify} reviewBeforeReceive onConfirm={photoConfirmed} onLinkBarcode={() => undefined} onSearchManually={search} onDeviation={(result) => {
        const code = overlay.code;
        searchRegister().then((rows) => { const product = rows.find((row) => row.sku === result.sku); if (product) setOverlay({ kind: "off-order", product, code }); else search(); }, search);
      }} onSearchRegister={() => searchRegister()} onClose={() => setOverlay((current) => current.kind === "identify" ? { kind: "none" } : current)} contextLabel={t.contextLabel(po.id)} checkPhoto={checkPhoto} />}
    </main>
  </div>;
}
