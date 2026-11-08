import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, ImagePlus, Link, Plus, RefreshCcw, RotateCcw, Search, TriangleAlert, WifiOff, X } from "lucide-react";
import type { RankedCandidate, State } from "./machine";
import { MAX_PHOTOS } from "./machine";
import type { Strings } from "./strings";
import type { Candidate, Context, LineProgress } from "./types";

export type Actions = {
  close: () => void;
  openCamera: () => void;
  removePhoto: () => void;
  identify: () => void;
  cancel: () => void;
  retry: () => void;
  retake: () => void;
  notThis: () => void;
  addSizePhoto: () => void;
  pick: (sku: string) => void;
  pickCancel: () => void;
  confirm: (candidate: Candidate) => void;
  deviation: (candidate: Candidate) => void;
  searchManually: () => void;
  link: (candidate: Candidate, code: string) => void;
};

export type ScreenProps = {
  state: State;
  t: Strings;
  actions: Actions;
  context: Context;
  contextLabel?: string;
  progress?: Record<string, LineProgress>;
};

/** Name and size, with the size kept on one line. */
export const fullName = (c: Candidate) => [c.name, c.size?.replace(/ /g, "\u00a0")].filter(Boolean).join(" ");
const meta = (c: Candidate) => [c.sku, c.size, c.brand].filter(Boolean).join(" · ");

function Page({ title, onBack, backLabel, right, children, announceTitle }: { title: string; onBack: () => void; backLabel: string; right?: ReactNode; children: ReactNode; announceTitle?: boolean }) {
  return (
    <div className="hid-page">
      <h1 className="hid-title">
        <button type="button" className="hid-back" aria-label={backLabel} onClick={onBack}>
          <ArrowLeft size={28} strokeWidth={1.8} />
        </button>
        <span className="hid-title-text" role={announceTitle ? "alert" : undefined}>{title}</span>
        {right}
      </h1>
      {children}
    </div>
  );
}

function Btn({ kind, icon, children, onClick, disabled }: { kind: "p" | "s"; icon?: ReactNode; children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`hid-btn hid-btn-${kind}`} onClick={onClick} disabled={disabled}>
      {icon}
      {children}
    </button>
  );
}

function Corners() {
  return (
    <>
      <span className="hid-corner hid-c1" />
      <span className="hid-corner hid-c2" />
      <span className="hid-corner hid-c3" />
      <span className="hid-corner hid-c4" />
    </>
  );
}

function Thumbs({ photos, t, onRemoveLast, className, children }: { photos: string[]; t: Strings; onRemoveLast?: () => void; className?: string; children?: ReactNode }) {
  return (
    <div className={className ? `hid-thumbs ${className}` : "hid-thumbs"}>
      {photos.map((photo, i) => (
        <div className="hid-thumb" key={i}>
          <img src={photo} alt={t.photoN(i + 1)} />
          <span className="hid-n">{i + 1}</span>
          {onRemoveLast && i === photos.length - 1 && (
            <button type="button" className="hid-x" aria-label={t.removePhoto} onClick={onRemoveLast}>
              <X size={12} strokeWidth={2.5} />
            </button>
          )}
        </div>
      ))}
      {children}
    </div>
  );
}

function Compare({ photo, image, t, square }: { photo: string; image: string; t: Strings; square?: boolean }) {
  return (
    <div className="hid-cmp">
      <div className={`hid-photo hid-photo-worker${square ? " hid-square" : ""}`}>
        <img src={photo} alt="" />
        <span className="hid-lab">{t.yourPhoto}</span>
      </div>
      <div className={`hid-photo hid-photo-reg${square ? " hid-square" : ""}`}>
        <img src={image} alt="" />
        <span className="hid-lab">{t.inRegister}</span>
      </div>
    </div>
  );
}

function Product({ candidate }: { candidate: Candidate }) {
  return (
    <div className="hid-product">
      <div className="hid-product-name">{candidate.name}</div>
      <div className="hid-muted">{meta(candidate)}</div>
    </div>
  );
}

function Sheet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="hid-dim" />
      <div className="hid-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="hid-handle" />
        <h2 className="hid-sheet-title">{title}</h2>
        <div className="hid-btncol">{children}</div>
      </div>
    </>
  );
}

function CandidateRow({ ranked, t, onPick }: { ranked: RankedCandidate; t: Strings; onPick: () => void }) {
  const { candidate, likelihood } = ranked;
  const best = likelihood === "most_likely";
  return (
    <button type="button" className={`hid-cand${best ? " hid-best" : ""}`} onClick={onPick}>
      <span className="hid-cand-th">
        <img src={candidate.image} alt="" />
      </span>
      <span className="hid-cand-tx">
        <span className="hid-cand-nm">{candidate.name}</span>
        <span className="hid-cand-sku">{meta(candidate)}</span>
      </span>
      <span className={`hid-badge${best ? " hid-badge-g" : ""}`}>{t.likelihood[likelihood]}</span>
    </button>
  );
}

function Capture({ photos, t, actions }: { photos: string[]; t: Strings; actions: Actions }) {
  const n = photos.length;
  const last = photos[n - 1];
  return (
    <>
      {last ? (
        <div className="hid-photo hid-photo-worker hid-preview">
          <img src={last} alt="" />
          <span className="hid-lab">{t.photoN(n)}</span>
        </div>
      ) : (
        <>
          <button type="button" className="hid-cam hid-viewfinder" onClick={actions.openCamera} aria-label={t.takePhoto}>
            <Corners />
            <Camera size={40} strokeWidth={1.6} />
          </button>
          <div className="hid-shutter-row">
            <button type="button" className="hid-shutter" onClick={actions.openCamera} aria-label={t.takePhoto}>
              <i />
            </button>
          </div>
        </>
      )}
      <Thumbs photos={photos} t={t} onRemoveLast={actions.removePhoto} className={last ? "hid-mt14" : undefined}>
        {n === 0 && (
          <>
            <button type="button" className="hid-thumb hid-thumb-empty" onClick={actions.openCamera} aria-label={t.takePhoto}>
              <Camera size={22} />
            </button>
            <span className="hid-thumb hid-thumb-empty hid-faded">
              <Plus size={22} />
            </span>
          </>
        )}
        {n === 1 && (
          <button type="button" className="hid-thumb hid-thumb-empty" onClick={actions.openCamera} aria-label={t.addPhoto}>
            <Plus size={22} />
          </button>
        )}
      </Thumbs>
      <div className="hid-btnrow">
        {n === 1 && (
          <Btn kind="s" icon={<ImagePlus size={22} />} onClick={actions.openCamera}>
            {t.addPhoto}
          </Btn>
        )}
        {n === 0 ? (
          <Btn kind="p" disabled>
            {t.identify}
          </Btn>
        ) : (
          <Btn kind="p" onClick={actions.identify}>
            {t.identify}
          </Btn>
        )}
      </div>
    </>
  );
}

function ChooseList({ state, t, actions }: { state: Extract<State, { kind: "result.choose" }>; t: Strings; actions: Actions }) {
  return (
    <Page title={t.chooseTitle} onBack={actions.close} backLabel={t.back}>
      <div className="hid-choose-head">
        <Thumbs photos={state.photos} t={t} />
      </div>
      {state.ranked.map((r) => (
        <CandidateRow key={r.candidate.sku} ranked={r} t={t} onPick={() => actions.pick(r.candidate.sku)} />
      ))}
      <div className="hid-btncol">
        <Btn kind="s" icon={<Camera size={22} />} onClick={actions.addSizePhoto}>
          {t.addSizePhoto}
        </Btn>
      </div>
      <div className="hid-center hid-mt14">
        <button type="button" className="hid-link" onClick={actions.searchManually}>
          {t.noneOfThese}
        </button>
      </div>
    </Page>
  );
}

export function Screen({ state, t, actions, context, contextLabel, progress }: ScreenProps) {
  switch (state.kind) {
    case "capture":
      return (
        <Page title={t.captureTitle} onBack={actions.close} backLabel={t.back}>
          <Capture photos={state.photos} t={t} actions={actions} />
        </Page>
      );

    case "identifying":
      return (
        <Page title={t.identifyingTitle} onBack={actions.close} backLabel={t.back}>
          <Thumbs photos={state.photos} t={t} />
          <div className="hid-progress" role="status" aria-label={t.identifyingTitle}><span className="hid-st hid-st-run" aria-hidden="true"><RotateCcw size={16} /></span></div>
          <div className="hid-counter" aria-live="polite">
            {t.seconds(state.seconds)}
          </div>
          <div className="hid-center hid-mt18">
            <button type="button" className="hid-link" onClick={actions.cancel}>
              {t.cancel}
            </button>
          </div>
        </Page>
      );

    case "result.match": {
      const top = state.ranked[0]!.candidate;
      const line = context === "receiving" ? progress?.[top.sku] : undefined;
      return (
        <Page
          title={t.resultTitle}
          onBack={actions.close}
          backLabel={t.back}
          right={
            <span className="hid-badge hid-badge-g hid-badge-lg">
              <Check size={16} strokeWidth={2.5} />
              {t.match}
            </span>
          }
        >
          <Compare photo={state.photos[0]!} image={top.image} t={t} />
          {state.photos.length === MAX_PHOTOS && (
            <Thumbs photos={state.photos} t={t} className="hid-thumbs-sm" />
          )}
          <Product candidate={top} />
          <div className="hid-btncol">
            <Btn kind="p" icon={<Check size={22} />} onClick={() => actions.confirm(top)}>
              {t.confirm}
            </Btn>
            <Btn kind="s" onClick={actions.notThis}>
              {t.notThis}
            </Btn>
          </div>
          {line && <div className="hid-quantity" aria-label={t.receiptProgress(line.received, line.expected)}><span>{line.received}/{line.expected}</span><ArrowRight size={18} aria-hidden="true" /><span>{line.received + 1}/{line.expected}</span></div>}
        </Page>
      );
    }

    case "result.choose":
      return <ChooseList state={state} t={t} actions={actions} />;

    case "confirm": {
      const { choose, candidate } = state;
      return (
        <>
          <ChooseList state={choose} t={t} actions={actions} />
          <Sheet title={t.confirmQuestion(fullName(candidate))}>
            <Btn kind="p" icon={<Check size={22} />} onClick={() => actions.confirm(candidate)}>
              {t.confirm}
            </Btn>
            <Btn kind="s" onClick={actions.pickCancel}>
              {t.cancel}
            </Btn>
          </Sheet>
        </>
      );
    }

    case "register-search":
    case "result.none":
      return (
        <Page title={t.notOnTitle(contextLabel)} onBack={actions.close} backLabel={t.back}>
          {state.kind === "register-search" ? (
            <div className="hid-cand hid-loading" role="status">
              <span className="hid-st hid-st-run">
                <RotateCcw size={14} strokeWidth={2.5} />
              </span>
              <span className="hid-cand-nm">{t.searchingRegister}</span>
            </div>
          ) : (
            <>
              <div className="hid-mt10">
                <Compare photo={state.photos[0]!} image={state.guess.image} t={t} square />
              </div>
              <Product candidate={state.guess} />
              <div className="hid-btncol">
                <Btn kind="p" icon={<TriangleAlert size={22} />} onClick={() => actions.deviation(state.guess)}>
                  {t.registerDeviation}
                </Btn>
                <Btn kind="s" icon={<Search size={22} />} onClick={actions.searchManually}>
                  {t.searchAll}
                </Btn>
              </div>
            </>
          )}
        </Page>
      );

    case "result.nothing":
      return (
        <Page title={t.noMatch} onBack={actions.close} backLabel={t.back}>
          <Thumbs photos={state.photos} t={t} />
          <div className="hid-empty">
            <div className="hid-empty-ico">
              <Search size={28} strokeWidth={1.8} />
            </div>
          </div>
          <div className="hid-btncol">
            <Btn kind="p" icon={<Search size={22} />} onClick={actions.searchManually}>
              {t.searchManually}
            </Btn>
            <Btn kind="s" icon={<Camera size={22} />} onClick={actions.retake}>
              {t.retakeLabel}
            </Btn>
          </div>
        </Page>
      );

    case "error.photo":
      return (
        <Page announceTitle title={state.reason === "dark" ? t.tooDark : t.tooBlurred} onBack={actions.close} backLabel={t.back} right={<TriangleAlert size={22} aria-hidden="true" />}>
          <div className="hid-cam hid-rejected">
            <img src={state.rejected} alt="" />
            <span className="hid-lab">{t.photoN(state.photos.length + 1)}</span>
          </div>
          <div className="hid-btnrow">
            <Btn kind="p" icon={<Camera size={22} />} onClick={actions.retake}>
              {t.retake}
            </Btn>
          </div>
          <div className="hid-center hid-mt14">
            <button type="button" className="hid-link hid-muted" onClick={actions.searchManually}>
              {t.searchManually}
            </button>
          </div>
        </Page>
      );

    case "error.network":
      return (
        <Page announceTitle title={t.couldNot} onBack={actions.close} backLabel={t.back}>
          <Thumbs photos={state.photos} t={t} />
          <div className="hid-empty">
            <div className="hid-empty-ico">
              <WifiOff size={28} strokeWidth={1.8} />
            </div>
          </div>
          <div className="hid-btncol">
            <Btn kind="p" icon={<RefreshCcw size={22} />} onClick={actions.retry}>
              {t.tryAgain}
            </Btn>
            <Btn kind="s" icon={<Search size={22} />} onClick={actions.searchManually}>
              {t.searchManually}
            </Btn>
          </div>
        </Page>
      );

    case "link-barcode":
      return (
        <Sheet title={t.linkQuestion(state.code, fullName(state.candidate))}>
          <Btn kind="p" icon={<Link size={22} />} onClick={() => actions.link(state.candidate, state.code)}>
            {t.linkBarcode}
          </Btn>
          <Btn kind="s" onClick={actions.close}>
            {t.notNow}
          </Btn>
        </Sheet>
      );

    case "done":
      return null;
  }
}
