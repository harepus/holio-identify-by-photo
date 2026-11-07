export type Context = "receiving" | "returns" | "counting" | "lookup";
export type Locale = "en" | "nb";
export type Candidate = { sku: string; name: string; brand?: string; size?: string; image: string };
export type IdentifyRequest = { photos: string[]; candidates: Candidate[]; scannedCode?: string; context: Context; locale: Locale };
export type Likelihood = "most_likely" | "possible";
export type Ranked = { sku: string; likelihood: Likelihood };
export type IdentifyResponse = { status: "match" | "choose" | "none"; candidates: Ranked[]; evidence: string; readText: string[]; ms: number };
export type Identify = (req: IdentifyRequest, signal: AbortSignal) => Promise<IdentifyResponse>;

export type PhotoCheck = "ok" | "dark" | "blurred";

/** What onConfirm and onDeviation receive. sku, source and evidence are the design's shape; the rest feeds Holio on PC. */
export type PhotoResult = {
  sku: string;
  source: "photo";
  evidence: string;
  /** The answer the worker acted on: confirmed a match, picked from the list, or sent the best guess to deviation. */
  status: IdentifyResponse["status"];
  photos: number;
  /** The worker took the top candidate of the first answer. */
  firstSuggestion: boolean;
  /** From the first photo to this result. */
  ms: number;
};

export type LinkBarcodeResult = { sku: string; code: string };

export type LineProgress = { received: number; expected: number };

export type IdentifyByPhotoProps = {
  candidates: Candidate[];
  scannedCode?: string;
  context: Context;
  locale: Locale;
  identify: Identify;
  onConfirm: (result: PhotoResult) => void;
  onLinkBarcode: (result: LinkBarcodeResult) => void;
  onSearchManually: () => void;
  onDeviation: (result: PhotoResult) => void;
  onSearchRegister?: (readText: string[]) => Promise<Candidate[]>;
  onClose: () => void;
  /** The order or location the candidates come from, in the host's locale, such as "PO #500004701". */
  contextLabel?: string;
  /** Received and expected per SKU, for the "0/24 becomes 1/24" line in receiving. */
  progress?: Record<string, LineProgress>;
  /** Replaces the on-device dark and blur check, for a native camera that reports exposure itself. */
  checkPhoto?: (photo: string) => Promise<PhotoCheck>;
};
