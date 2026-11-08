# Integrate photo identification into Holio Ops

The integration point is the scanner's unknown-barcode or no-barcode action. Identification returns a SKU for receipt review. Holio remains responsible for the stock transaction.

## Existing interfaces

| Piece | Input | Output or action |
|---|---|---|
| `IdentifyByPhoto` React component | Order candidates, optional scanned code, context and locale | Confirmed `PhotoResult` through `onConfirm` |
| `POST /v1/identify` | One or two photos and 1 to 500 candidate products | `match`, `choose` or `none`, up to three SKUs, evidence, OCR text and server time |
| Host receipt review | Selected SKU, quantity, location and optional extra barcode | Holio's authenticated receipt transaction |

See the [component props](../app/README.md#props) and [endpoint contract](../contract/identify.md) for the complete types. The demo shell is separate from `app/src/identify/`, which depends on React and lucide-react.

## Wire the receiving flow

1. Map the purchase order's lines into candidates with stable SKU, name, brand, size and reference image. Send the order context rather than the whole register when it is known.
2. Mount `IdentifyByPhoto` with `reviewBeforeReceive` enabled. Route its `identify` function through Holio's authenticated backend. Do not put a service credential in browser code.
3. Use `onConfirm` to open the host's receipt review. Identification alone must not write stock. Keep quantity and location editable, with an explicit **Receive** action.
4. Let the backend validate order membership, quantity, location and permission. Persist the receipt with retry/idempotency handling. Store any approved extra barcode without replacing the primary barcode; detect conflicts across the shared register.
5. Connect `onSearchManually`, `onSearchRegister` and `onDeviation` to Holio's existing search and deviation paths. Keep manual recovery available when the model or network fails.

The local receiving shell demonstrates these decisions, but its page memory and localStorage are not a stock backend.

## Service setup

The current engine runs on macOS because OCR uses Apple Vision. It loads CLIP and indexes reference images at startup, then asks Claude Sonnet for the final suggestion. The recorded version uses the existing Claude CLI subscription. The alternative Anthropic API path is implemented but unverified; validate the approved provider, credentials and deployment environment before a pilot.

Place the service behind Holio's backend or API gateway. `HPI_TOKEN` protects identify requests; `HPI_IMAGE_HOSTS` allows specific catalog image hosts. The demo defaults to two concurrent model calls, a 32 MB body cap and a 22-second model budget. The browser times out after 25 seconds. Cold image downloads can exceed the model budget, so prepare and index the catalog before use. See [server configuration](../server/README.md).

The model receives the submitted photos, candidate catalog text and reference images. Candidate fields and text in photos are treated as data in the prompt. Agree the permitted data and provider arrangements before sending a customer catalog.

## Pilot acceptance checks

- Use new warehouse photos against Holio's actual catalog. Include neighboring flavors, sizes, duplicate catalog rows, unreadable labels and items absent from the order.
- Count correct matches, wrong matches, uncertain choices and rejections separately. Record technical errors and latency over all attempts; do not drop quota failures or timeouts from availability reporting.
- Verify receipt idempotency, barcode conflicts, permissions and offline behavior against the real backend.
- Test the physical iPhone and Zebra devices, including camera permissions, repeated scans, gloves, keyboard layout and warehouse Wi-Fi.

Current evidence supports a working grocery demo and a component/service integration path. It does not establish production accuracy, concurrent capacity or readiness for unattended receiving.
