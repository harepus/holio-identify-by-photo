import { useEffect, useState } from "react";
import { Box, Camera, Check, House, Info, Link, RotateCw } from "lucide-react";
import { IdentifyByPhoto, httpIdentify, type Candidate, type LinkBarcodeResult, type Locale, type PhotoCheck, type PhotoResult } from "../identify";
import { lineBarcode, lineCandidate, loadPurchaseOrder, productLabel, readLinks, searchRegister, writeLinks, type PoLine, type PurchaseOrder } from "./data";
import { mockIdentify, mockModeFrom } from "./mock";
import { PcPanel } from "./PcPanel";
import { PurchaseOrderPage } from "./PurchaseOrderPage";
import { ScannerPage } from "./ScannerPage";
import { readSession, writeSession, type SessionEvent } from "./session";
import { shellStrings } from "./strings";
import "./shell.css";

const params = new URLSearchParams(location.search);
const locale: Locale = params.get("lang") === "nb" ? "nb" : "en";
const mock = mockModeFrom(location.search);
const identify = mock ? mockIdentify(mock) : httpIdentify("/v1/identify");
const checkPhoto = mock === "dark" ? async (): Promise<PhotoCheck> => "dark" : undefined;
const t = shellStrings[locale];
const TOAST_MS = 4000;

type Load = { status: "loading" } | { status: "failed" } | { status: "ready"; po: PurchaseOrder };
type Overlay = { kind: "extra-link"; code: string; product: Candidate } | { kind: "none" } | { kind: "unknown-code"; code: string } | { kind: "identify"; scannedCode?: string };
type Toast = { id: number; icon: "check" | "link" | "info"; text: string };

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [view, setView] = useState<"po" | "scanner">("po");
  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const [toast, setToast] = useState<Toast | null>(null);
  const [receipt, setReceipt] = useState<{ id: number; text: string } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [photoSkus, setPhotoSkus] = useState<Set<string>>(new Set());
  const [links, setLinks] = useState(readLinks);
  const [events, setEvents] = useState<SessionEvent[]>(readSession);

  useEffect(() => {
    loadPurchaseOrder().then(
      (po) => setLoad({ status: "ready", po }),
      () => setLoad({ status: "failed" }),
    );
  }, []);

  useEffect(() => writeSession(events), [events]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, []);

  const po = load.status === "ready" ? load.po : null;

  if (hash === "#/pc") {
    return <PcPanel events={events} company={po?.company ?? ""} warehouse={po?.warehouse ?? ""} t={t} locale={locale} />;
  }

  const show = (icon: Toast["icon"], text: string) => setToast({ id: Date.now(), icon, text });
  const logEvent = (e: SessionEvent) => setEvents((list) => [...list, e]);

  function receive(sku: string, byPhoto: boolean) {
    if (!po) return;
    const extra = po.notOnOrder.find((l) => l.sku === sku);
    const line: PoLine | undefined = po.lines.find((l) => l.sku === sku) ?? (extra ? {
      ...extra, lineId: `extra-${sku}`, brand: extra.brand ?? "", size: extra.size ?? "", expected: 0, received: 0,
    } : undefined);
    if (!line) return;
    setLoad({ status: "ready", po: { ...po, lines: (po.lines.some((l) => l.sku === sku) ? po.lines : [...po.lines, line]).map((l) => (l.sku === sku ? { ...l, received: l.received + 1 } : l)) } });
    if (byPhoto) setPhotoSkus((s) => new Set(s).add(sku));
    setHighlight(sku);
    setToast(null);
    setReceipt({ id: Date.now(), text: line.expected === 0 ? t.extraReceived(`${line.name} ${line.size}`, line.received + 1) : `${line.name} ${line.size}, ${line.received + 1}/${line.expected}` });
  }

  function scan(code: string) {
    if (!po) return;
    const sku = po.lines.find((l) => lineBarcode(l) === code || links[code] === l.sku)?.sku
      ?? po.notOnOrder.find((l) => links[code] === l.sku)?.sku;
    if (sku) receive(sku, false);
    else setOverlay({ kind: "unknown-code", code });
  }

  function onConfirm(result: PhotoResult) {
    const line = po?.lines.find((l) => l.sku === result.sku);
    logEvent({ kind: "photo", at: Date.now(), order: t.poTitle(po?.id ?? ""), mock: Boolean(mock), result, product: line ? lineCandidate(line) : null, linked: false });
    receive(result.sku, true);
  }

  function onLinkBarcode({ sku, code }: LinkBarcodeResult) {
    const next = { ...links, [code]: sku };
    setLinks(next);
    writeLinks(next);
    setEvents((list) => {
      const i = list.findLastIndex((e) => e.kind === "photo" && e.result.sku === sku);
      return i < 0 ? list : list.map((e, j) => (j === i && e.kind === "photo" ? { ...e, linked: true } : e));
    });
    const line = po?.lines.find((l) => l.sku === sku);
    show("link", t.linkedToast(line ? Math.max(0, line.expected - line.received) : 0));
  }

  function onDeviation(result: PhotoResult) {
    const order = t.poTitle(po?.id ?? "");
    const code = overlay.kind === "identify" ? overlay.scannedCode : undefined;
    searchRegister()
      .catch((): Candidate[] => [])
      .then((rows) => {
        const product = rows.find((r) => r.sku === result.sku) ?? null;
        logEvent({ kind: "photo", at: Date.now(), order, mock: Boolean(mock), result, product, linked: false });
        if (code && product && po?.notOnOrder.some((l) => l.sku === product.sku)) {
          setOverlay({ kind: "extra-link", code, product });
        } else show("info", t.deviationToast(product ? productLabel(product) : result.sku));
      });
  }

  function onSearchManually() {
    logEvent({ kind: "manual", at: Date.now(), order: t.poTitle(po?.id ?? ""), mock: Boolean(mock) });
    show("info", t.manualToast);
  }

  function forgetLinks() {
    setLinks({});
    writeLinks({});
  }

  return (
    <div className="app">
      <header className="apphead">
        <span className="dot" />
        <span className="name">Holio Ops 3</span>
        <span className="chip-demo">{t.demo}</span>
        {mock && <span className="chip-mock">{`${t.mock}: ${mock}`}</span>}
        <span className="sp" />
        <button type="button" className="icon-btn" aria-label={t.refresh} onClick={() => location.reload()}>
          <RotateCw size={22} />
        </button>
      </header>

      <main className="stage">
        <div className="page" key={view}>
          {load.status === "loading" && <div className="muted center mt14">{t.loading}</div>}
          {load.status === "failed" && <div className="err">{t.loadFailed}</div>}
          {po && view === "po" && <PurchaseOrderPage po={po} t={t} locale={locale} highlight={highlight} photoSkus={photoSkus} />}
          {po && view === "scanner" && (
            <ScannerPage
              receipt={receipt}
              po={po}
              t={t}
              linkedCount={Object.keys(links).length}
              paused={overlay.kind !== "none"}
              onBack={() => setView("po")}
              onScan={scan}
              onIdentify={() => setOverlay({ kind: "identify" })}
              onSearchManually={onSearchManually}
              onForgetLinks={forgetLinks}
            />
          )}
        </div>

        {po && view === "po" && (
          <button type="button" className="fab" aria-label={t.openScanner} onClick={() => setView("scanner")}>
            <Camera size={28} strokeWidth={1.8} />
          </button>
        )}

        {toast && (
          <div className="toast" role="status" key={toast.id}>
            {toast.icon === "check" && <Check size={22} />}
            {toast.icon === "link" && <Link size={22} />}
            {toast.icon === "info" && <Info size={22} />}
            <span>{toast.text}</span>
          </div>
        )}

        {overlay.kind === "extra-link" && (
          <>
            <div className="dim" />
            <div className="sheet" role="dialog" aria-modal="true" aria-label={t.linkExtra}>
              <h2 className="sheet-title">{t.linkExtra}</h2>
              <p>{productLabel(overlay.product)}</p>
              <p className="sheet-text">{t.extraExplanation}</p>
              <div className="mono">{overlay.code}</div>
              <div className="btncol">
                <button className="btn btn-p" onClick={() => {
                  onLinkBarcode({ sku: overlay.product.sku, code: overlay.code });
                  receive(overlay.product.sku, true);
                  setOverlay({ kind: "none" });
                }}>{t.linkBarcode}</button>
                <button className="btn btn-s" onClick={() => setOverlay({ kind: "none" })}>{t.back}</button>
              </div>
            </div>
          </>
        )}

        {overlay.kind === "unknown-code" && (
          <>
            <div className="dim" onClick={() => setOverlay({ kind: "none" })} />
            <div className="sheet" role="dialog" aria-modal="true" aria-label={t.unknownBarcode}>
              <div className="handle" />
              <h2 className="sheet-title">{t.unknownBarcode}</h2>
              <div className="mono sheet-code">{overlay.code}</div>
              <p className="sheet-text">{t.notLinked}</p>
              <div className="btncol">
                <button type="button" className="btn btn-p" onClick={() => setOverlay({ kind: "identify", scannedCode: overlay.code })}>
                  <Camera size={22} />
                  {t.identifyByPhoto}
                </button>
                <button
                  type="button"
                  className="btn btn-s"
                  onClick={() => {
                    setOverlay({ kind: "none" });
                    onSearchManually();
                  }}
                >
                  {t.searchManually}
                </button>
              </div>
            </div>
          </>
        )}

        {po && overlay.kind === "identify" && (
          <IdentifyByPhoto
            candidates={po.lines.map(lineCandidate)}
            scannedCode={overlay.scannedCode}
            context="receiving"
            locale={locale}
            identify={identify}
            onConfirm={onConfirm}
            onLinkBarcode={onLinkBarcode}
            onSearchManually={onSearchManually}
            onDeviation={onDeviation}
            onSearchRegister={() => searchRegister()}
            onClose={() => setOverlay({ kind: "none" })}
            contextLabel={t.contextLabel(po.id)}
            progress={Object.fromEntries(po.lines.map((l) => [l.sku, { received: l.received, expected: l.expected }]))}
            checkPhoto={checkPhoto}
          />
        )}
      </main>

      <nav className="tabbar">
        <button type="button" className="tab tab-on" onClick={() => setView("po")}>
          <House size={22} />
          {t.home}
        </button>
        <span className="tab">
          <Box size={22} />
          {t.picking}
        </span>
      </nav>
    </div>
  );
}
