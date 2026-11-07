# Identify by photo, the app

`IdentifyByPhoto` is a React component Holio drops into the Holio Ops scanner. When a pack has no barcode, a torn label or a code the register does not know, the worker photographs it and gets the product, counted like a scan. This folder also holds a demo shell that looks like Holio Ops, so the component can be shown in its real context.

| Path | Holds |
|---|---|
| `src/identify/` | The drop-in. Depends only on React and `lucide-react` |
| `src/shell/` | The demo host. Not part of the drop-in |
| `e2e/` | Playwright scripts for screenshots and the photo check |

The design it follows is `design/holio-photo-id.html`. The endpoint it calls is `contract/identify.md`.

## Run the shell

```sh
pnpm install
pnpm dev          # http://localhost:5173, also on the LAN for a phone
```

The dev server proxies `/v1` and `/demo` to the identify server on `http://localhost:8770`. Set `HOLIO_SERVER` to point elsewhere. `pnpm build` writes `dist/`, which the server serves.

The camera is a plain `<input type="file" accept="image/*" capture="environment">`. On a phone it opens the camera, also over plain HTTP on the LAN. On a laptop it opens a file picker, which is how you upload test photos.

| URL | Shows |
|---|---|
| `/` | Purchase order, scanner, unknown-code sheet. Over HTTPS or on localhost the scanner reads real barcodes with the back camera. Buttons below it simulate a scan of each line's barcode and of the unknown code `7031234567890` |
| `/#/pc` | Holio on PC panel, counted from this browser session's events |
| `?lang=nb` | Norwegian, in the component and the shell |
| `?mock=match` | Canned answers instead of the server. Also `choose`, `none`, `dark`, `timeout` and `error` |

Mock mode answers after about 2 s on the demo order's SKUs. The header then shows a "Mock" chip, and every PC panel row from a mocked run carries one too, so a mocked run never passes for a live one. `timeout` never answers, so the component's own 25 s limit fires.

A barcode linked with "Link barcode" is kept in `localStorage`. Scanning it again receives the product directly. "Forget linked barcodes" under the scan buttons clears them.

## Mount the component

Mount it inside a `position: relative` element that covers the page area between Holio's header and tab bar. Keep the page you came from rendered underneath: after Confirm, the link-barcode sheet opens over it.

```tsx
import { IdentifyByPhoto, httpIdentify } from "./identify";

const identify = httpIdentify("/api/identify"); // or a function through Holio's own API client

<IdentifyByPhoto
  candidates={po.lines.map(toCandidate)}
  scannedCode={code}
  context="receiving"
  locale="nb"
  identify={identify}
  contextLabel={`innkjøpsordre #${po.id}`}
  progress={Object.fromEntries(po.lines.map((l) => [l.sku, { received: l.received, expected: l.expected }]))}
  onConfirm={(r) => receiveLine(po.id, r)}
  onLinkBarcode={(r) => linkCode(r)}
  onSearchManually={() => openSearch()}
  onDeviation={(r) => openDeviation(po.id, r)}
  onSearchRegister={(words) => searchProducts(words, 8)}
  onClose={() => setIdentifying(false)}
/>
```

## Props

| Prop | Type | Use |
|---|---|---|
| `candidates` | `Candidate[]` | What the flow already knows: the PO lines in receiving, the sales order lines in returns, the location's products in counting |
| `scannedCode` | `string?` | The unknown code from the scanner. When set, Confirm offers "Link barcode", at most once per code per session |
| `context` | `"receiving" \| "returns" \| "counting" \| "lookup"` | Sent to the endpoint |
| `locale` | `"en" \| "nb"` | Language of the screens and of the evidence |
| `identify` | `(req, signal) => Promise<IdentifyResponse>` | The call to `POST /v1/identify`. `httpIdentify(url)` makes one for a plain URL. Pass your own to route it through an authenticated client. It must honour `signal` |
| `onConfirm` | `(r: PhotoResult) => void` | The worker confirmed a product. Feed it to the scan handler |
| `onLinkBarcode` | `({ sku, code }) => void` | Write the code to the product |
| `onSearchManually` | `() => void` | Open today's manual search |
| `onDeviation` | `(r: PhotoResult) => void` | The pack is not on the order. Open a receiving deviation with `r.sku` |
| `onSearchRegister` | `(readText) => Promise<Candidate[]>` optional | Rows from your product search for the words read off the pack. Turns "none" into a best guess from the full register. Without it, "none" goes to "No matching product" |
| `onClose` | `() => void` | The component is done. Unmount it |
| `contextLabel` | `string?` | "PO #500004701", in the locale. Used in titles such as "Not on PO #500004701" |
| `progress` | `Record<sku, { received, expected }>?` | Shows "0/24 becomes 1/24" under Confirm in receiving |
| `checkPhoto` | `(photo) => Promise<"ok" \| "dark" \| "blurred">` optional | Replaces the on-device dark and blur check |

`PhotoResult` is `{ sku, source: "photo", evidence, status, photos, firstSuggestion, ms }`. `status` is the answer the worker acted on, `firstSuggestion` says the worker took the top candidate of the first answer, and `ms` runs from the first photo to the result. Store them with the receipt line, and Holio on PC can count from them.

The component resizes each photo to 1600 px on the long side, JPEG quality 0.85, and checks it on the device before upload. It waits 25 s for an answer, with no automatic retry. Every error screen has "Search manually".

Styles are plain CSS scoped under `.hid`, with every class prefixed `hid-`, so nothing leaks in or out.

## Checks

```sh
pnpm tsc --noEmit
pnpm vitest run
pnpm build
uv run --with playwright python e2e/screens.py       # dev server on :5174, screenshots to .e2e-shots/
uv run --with playwright python e2e/photo_check.py   # dark and blur thresholds on the fixture photos
```

The e2e scripts default to `http://localhost:5174` and take a base URL as their first argument. Start the dev server with `pnpm dev --port 5174`. `screens.py` runs in mock mode and needs `/demo` served, by the identify server or by any static server over the repo root (`HOLIO_SERVER=http://localhost:8771 pnpm dev --port 5174` with `python3 -m http.server 8771` at the root).
