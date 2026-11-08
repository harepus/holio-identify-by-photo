import type { ReactNode } from "react";
import { ArrowLeft, Camera, Check, Flashlight, Link, RefreshCcw, RotateCcw, Search, TriangleAlert, WifiOff, X } from "lucide-react";
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
  candidateCount: number;
  context: Context;
  contextLabel?: string;
  progress?: Record<string, LineProgress>;
  canSearchRegister: boolean;
};

/** Name and size, with the size kept on one line. */
export const fullName = (c: Candidate) => [c.name, c.size?.replace(/ /g, "\u00a0")].filter(Boolean).join(" ");
const meta = (c: Candidate) => [c.sku, c.size, c.brand].filter(Boolean).join(" · ");

function Page({ title, onBack, backLabel, right, children }: { title: string; onBack: () => void; backLabel: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="hid-page">
      <h1 className="hid-title">
        <button type="button" className="hid-back" aria-label={backLabel} onClick={onBack}>
          <ArrowLeft size={28} strokeWidth={1.8} />
        </button>
        <span className="hid-title-text">{title}</span>
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

function Sheet({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return (
    <>
      <div className="hid-dim" />
      <div className="hid-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="hid-handle" />
        <h2 className="hid-sheet-title">{title}</h2>
        {text && <p className="hid-muted hid-sheet-text">{text}</p>}
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

function Capture({ photos, secondForSize, t, actions }: { photos: string[]; secondForSize: boolean; t: Strings; actions: Actions }) {
  const n = photos.length;
  const last = photos[n - 1];
  const takeSecond = secondForSize ? t.addSizePhoto : t.photographBack;
  return (
    <>
      <p className="hid-guide">{secondForSize ? t.guideSize : t.guide}</p>
      {last ? (
        <div className="hid-photo hid-photo-worker hid-preview">
          <img src={last} alt="" />
          <span className="hid-lab">{t.side(n, secondForSize)}</span>
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
              {t.side(1, secondForSize)}
            </button>
            <span className="hid-thumb hid-thumb-empty hid-faded">{t.side(2, secondForSize)}</span>
          </>
        )}
        {n === 1 && (
          <button type="button" className="hid-thumb hid-thumb-empty" onClick={actions.openCamera} aria-label={takeSecond}>
            <Camera size={22} />
            {t.side(2, secondForSize)}
          </button>
        )}
        <span className="hid-muted hid-small">{t.captureStatus(n, secondForSize)}</span>
      </Thumbs>
      <div className="hid-btnrow">
        {n === 0 && (
          <Btn kind="p" disabled>
            {t.identify}
          </Btn>
        )}
        {n === 1 && (
          <>
            <Btn kind="s" onClick={actions.identify}>
              {t.identifyNow}
            </Btn>
            <Btn kind="p" icon={<Camera size={22} />} onClick={actions.openCamera}>
              {takeSecond}
            </Btn>
          </>
        )}
        {n === MAX_PHOTOS && (
          <Btn kind="p" onClick={actions.identify}>
            {t.identify}
          </Btn>
        )}
      </div>
    </>
  );
}

function Steps({ step, t }: { step: 1 | 2 | 3; t: Strings }) {
  return (
    <ul className="hid-steps">
      {t.steps.map((label, i) => {
        const n = i + 1;
        const status = n < step ? "done" : n === step ? "run" : "wait";
        return (
          <li key={label} className={status === "wait" ? "hid-step-wait" : undefined}>
            <span className={`hid-st hid-st-${status}`}>
              {status === "done" && <Check size={16} strokeWidth={2.5} />}
              {status === "run" && <RotateCcw size={14} strokeWidth={2.5} />}
            </span>
            {label}
          </li>
        );
      })}
    </ul>
  );
}

function ChooseList({ state, t, actions }: { state: Extract<State, { kind: "result.choose" }>; t: Strings; actions: Actions }) {
  return (
    <Page title={t.chooseTitle} onBack={actions.close} backLabel={t.back}>
      <div className="hid-choose-head">
        <Thumbs photos={state.photos} t={t} />
        {state.evidence && <div className="hid-ev hid-ev-inline">{state.evidence}</div>}
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
      {state.ranked.length > 0 && <div className="hid-muted hid-small hid-center hid-mt10">{t.tapToConfirm}</div>}
    </Page>
  );
}

export function Screen({ state, t, actions, candidateCount, context, contextLabel, progress, canSearchRegister }: ScreenProps) {
  switch (state.kind) {
    case "capture":
      return (
        <Page title={t.captureTitle} onBack={actions.close} backLabel={t.back}>
          <Capture photos={state.photos} secondForSize={state.secondForSize} t={t} actions={actions} />
        </Page>
      );

    case "identifying":
      return (
        <Page title={t.identifyingTitle} onBack={actions.close} backLabel={t.back}>
          <div className="hid-sub">{t.comparing(candidateCount, contextLabel)}</div>
          <Thumbs photos={state.photos} t={t} />
          <Steps step={state.step} t={t} />
          <div className="hid-counter" aria-live="polite">
            {t.seconds(state.seconds)}
            <small>{t.usually}</small>
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
            <Thumbs photos={state.photos} t={t} className="hid-thumbs-sm">
              <span className="hid-muted hid-small">{t.twoPhotos(state.secondForSize)}</span>
            </Thumbs>
          )}
          <Product candidate={top} />
          {state.evidence && <div className="hid-ev">{state.evidence}</div>}
          <div className="hid-btncol">
            <Btn kind="p" icon={<Check size={22} />} onClick={() => actions.confirm(top)}>
              {t.confirm}
            </Btn>
            <Btn kind="s" onClick={actions.notThis}>
              {t.notThis}
            </Btn>
          </div>
          {line && <div className="hid-muted hid-small hid-center hid-mt10">{t.confirmHint(line.received, line.expected)}</div>}
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
          <div className="hid-warn hid-warn-top">
            <TriangleAlert size={22} />
            <span>{t.noneOnOrder(candidateCount)}</span>
          </div>
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
              {state.evidence && <div className="hid-ev">{state.evidence}</div>}
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
            <h2>{t.noMatch}</h2>
            <p>{t.nothingLooksLike(contextLabel, canSearchRegister)}</p>
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
        <Page title={t.captureTitle} onBack={actions.close} backLabel={t.back}>
          <p className="hid-guide">{state.secondForSize ? t.guideSize : t.guide}</p>
          <div className="hid-cam hid-rejected">
            <img src={state.rejected} alt="" />
            <span className="hid-lab">{t.side(state.photos.length + 1, state.secondForSize)}</span>
          </div>
          <div className="hid-err" role="alert">
            <TriangleAlert size={22} />
            <span>{state.reason === "dark" ? t.tooDark : t.tooBlurred}</span>
          </div>
          <div className="hid-btnrow">
            {state.reason === "dark" && (
              <Btn kind="s" icon={<Flashlight size={22} />} onClick={actions.retake}>
                {t.flashlightOn}
              </Btn>
            )}
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
        <Page title={t.identifyingTitle} onBack={actions.close} backLabel={t.back}>
          <div className="hid-sub">{t.comparing(candidateCount, contextLabel)}</div>
          <Thumbs photos={state.photos} t={t} />
          <div className="hid-empty">
            <div className="hid-empty-ico">
              <WifiOff size={28} strokeWidth={1.8} />
            </div>
            <h2>{t.couldNot}</h2>
            <p>{t.checkConnection}</p>
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
        <Sheet title={t.linkQuestion(state.code, fullName(state.candidate))} text={t.linkNext}>
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
