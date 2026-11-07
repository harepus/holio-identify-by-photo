# Identify by photo for Holio Ops

Our entry for the Holio challenge at Oslo Sprint 2026, pain 3: items without a usable barcode. When a pack has no barcode, a torn label or a code the register does not know, the warehouse worker photographs it. The app suggests which product it is among the ones Holio already expects, such as the purchase order's lines. The worker confirms, and the product is counted exactly like a scan. "Link barcode" then ties the unknown code to the product, so the next unit scans normally.

## Why this pain

We picked the pain Holio can drop into Holio Ops with the least work. The full comparison of all nine pains is in `design/holio-photo-id.html`.

- The output is a confirmed product, the same thing a barcode scan gives. No flow downstream has to change.
- It runs only when a scan fails, so normal scans keep their speed and the model runs once per exception.
- Holio already has both inputs: product images in the register and the camera scanner in Holio Ops 0.2.11.
- It never blocks. An unsure answer becomes a choice of three plus "Search manually", which is today's path.

## How Holio plugs it in

1. Run the server as one service with its own model key: `POST /v1/identify`, contract in `contract/identify.md`.
2. Pass the candidates each flow already knows: the purchase order's lines in receiving, the sales order's lines in returns, the location's products in counting, or rows from Holio's own product search.
3. Mount `<IdentifyByPhoto>` on the scanner's unknown-code sheet and behind a "No barcode? Identify by photo" link. `onConfirm` returns the SKU for receipt review. Only Receive commits quantity and location. The props are in `app/README.md`.

## Run the demo

```sh
cd app && pnpm install && pnpm build && cd ..
uv run server/app.py          # http://localhost:8770, also reachable from a phone on the LAN
```

On a shared network, start it with `HPI_HOST=127.0.0.1` so that only this Mac reaches it. The server needs macOS (Vision OCR) and a logged-in `claude` CLI. The demo order and product register are public Open Food Facts products, never customer data. `?mock=match` and the other mock modes answer without the server, and they label themselves "Mock" in the header.

## Evidence

| Test | Result |
|---|---|
| Arena holdout, 47 real photos of unseen Norwegian brands against a 247-product register | Right on the first try in 82 and 84% of in-register cases over two runs. 1 and 0 of 47 confidently wrong. 9 of 9 items outside the register abstained |
| Same photos against a simulated 8-product purchase order (`evidence/po-context/`) | 36 of 38 matched the right product and 0 matched a wrong one. The other 2 went to a choice of three that held the right product. When the item was not on the order, 45 of 47 said so and 1 went to a choice of three. The last one matched "SkinkOst", most likely a second crowd row for the same Kavli spread |
| Live run through the app, `app/e2e/live.py` | Maarud Potetskruer Salt matched in 3.8 s. After barcode linking, the next scan of that code received it directly. Freia Melkesjokolade was flagged as not on the order, with the right product as best guess from the register |

Warm server calls took 3.7 to 4.9 s each on one Mac, one at a time.

## Receiving v2

Scan a known order barcode to receive one unit. The scanner stays open and shows the product, new total and Undo last receipt. Move the pack out of view before scanning the next unit.

Unknown barcode and No barcode offer Identify by photo and Search manually with equal weight. Manual search starts with order lines. Search all products opens the register. An off-order product is shown as a mismatch and is not received.

Photo and manual selections open Review receipt. Change the quantity and location, then tap Receive. A scanned unknown code is checked for addition as an extra barcode. The primary barcode stays unchanged. Over-receipt needs Receive anyway and shows Over received in red. Other line statuses are Pending, Under received and Received.

Tap an order line to review a batch or change its location. Undo reverses the last quantity and location change once. It keeps any added barcode. Counts and locations are page memory; reload resets them to the data file. Added barcodes remain in localStorage. Demo tools can forget them. This is a local demo, not a warehouse stock write.

## Change the demo items

Keep groceries for the measured demo. To substitute a different set later:

1. Edit `demo/purchase-order.json`. Keep the order metadata and give every line a unique `sku` and `lineId`, plus `name`, `brand`, `size`, `expected`, `received`, `image`, `barcode` and `location`. Location is a shelf label. A missing location opens review before receiving.
2. Drop product photos in `demo/img/`. Images in the order use paths such as `img/SKU-1203.jpg`. Absolute image URLs also work in the UI; the identify server must allow their hosts.
3. Mirror products into `demo/register/register.json` under `items`, with images relative to `demo/register/`. Keep `notOnOrder` for barcode examples that must not receive.
4. Restart the isolated server to index the register, reload the page, and forget old linked barcodes in Demo tools. No application code changes are needed. Mock modes select from the supplied candidates and do not measure recognition.

## Limits

- One scanned code means one unit. Cartons and case packs are a next step.
- Locations are editable labels, not validated against a Holio location service. There is no durable receipt storage, cross-device sync, offline save queue or authenticated stock write.
- Off-order receiving is deferred pending Holio permission and deviation policy.
- Tested on groceries with printed text. Apparel and parts with little text are not measured.
- The camera input has not been tried on a Zebra TC27 or an iPhone yet.
- Only the model call enforces the 22 s limit. Fetching remote candidate images that are not indexed yet can run past it, so index the register at startup, as the server does for the demo.
- The judge is Claude Sonnet through the `claude` CLI. The Anthropic API path in `server/engine.py` is written but has not run, because no API key was available.

## AI and security

- Suggestions come from Claude Sonnet. Known barcodes receive one unit. Photo suggestions require a receipt review before anything is counted.
- Catalog fields and text in the photo go to the model as data, never as instructions. Two live tests try an instruction in a product name and a note in the photo, and the right product still wins.
- No key sits in the browser or the repo. The model runs on the server, which can require a service token, caps the body at 32 MB and runs at most 2 calls at once.

## Layout

| Path | Holds |
|---|---|
| `design/holio-photo-id.html` | Every screen and state, the pain comparison and the contract |
| `contract/identify.md` | The endpoint contract |
| `app/` | The `IdentifyByPhoto` component and the Holio Ops demo shell |
| `server/` | The endpoint and the engine, ported from the arena's pain 3 entry |
| `evidence/po-context/` | The purchase-order measurement, script and results |
| `demo/` | The demo order and register, from Open Food Facts (CC BY-SA) |
