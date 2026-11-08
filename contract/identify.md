# POST /v1/identify

One stateless call. Holio sends the worker's photos and the candidates it already knows from the flow (the purchase order's lines in receiving, the sales order's lines in returns, the location's products in counting, or rows from its own product search). The service ranks the candidates, and code decides the status.

## Request

```json
{
  "photos": ["<base64 JPEG or PNG, with or without a data: prefix>"],
  "candidates": [
    { "sku": "SKU-1203", "name": "Superchips Sour Cream & Onion", "brand": "Maarud", "size": "140 g", "image": "/demo/img/SKU-1203.jpg" }
  ],
  "scannedCode": "7031234567890",
  "context": "receiving",
  "locale": "en"
}
```

| Field | Rule |
|---|---|
| `photos` | 1 or 2 images, each at most 6 MB decoded. Photo 1 is the front, photo 2 the back or a close-up of the size print |
| `candidates` | 1 to 500 rows, unique `sku`. `sku` at most 64 characters, `name` 200, `brand` 120, `size` 60. `image` is an http(s) URL, a path under the server's static root such as `/demo/...`, or a `data:` URI |
| `scannedCode` | Optional, at most 64 characters. The unknown barcode the scanner read, echoed for logging only |
| `context` | `receiving`, `returns`, `counting` or `lookup` |
| `locale` | `en` or `nb`. The language of `evidence` |

## Response 200

```json
{
  "status": "match",
  "candidates": [
    { "sku": "SKU-1203", "likelihood": "most_likely" },
    { "sku": "SKU-6764", "likelihood": "possible" }
  ],
  "evidence": "The pack says 'Sour Cream & Onion' and '140 g'. Only SKU-1203 matches both.",
  "readText": ["SUPERCHIPS", "SOURCREAM & ONION", "140 g"],
  "ms": 5230
}
```

| Field | Rule |
|---|---|
| `status` | `match`, `choose` or `none`, decided in code. `none` when the model says no candidate is this item. `match` when it picks one row, both self-checks pass (the variant words are on the pack, the size is settled) and its confidence is at least 0.7. `choose` otherwise. This is the rule the arena measured |
| `candidates` | Up to 3, best first. The first is `most_likely`, the rest `possible`. Always present, also for `none`, so the worker can still choose |
| `evidence` | One sentence on what decided it, in `locale` |
| `readText` | Text read from the photos, one entry per line, for the host's own product search |
| `ms` | Server time for the call |

## Errors

| HTTP | Body | When |
|---|---|---|
| 400 | `{ "error": "invalid_request", "detail": "..." }` | The request breaks a rule above |
| 401 | `{ "error": "unauthorized" }` | The server has a service token and the request lacks `Authorization: Bearer <token>` |
| 413 | `{ "error": "invalid_request", "detail": "..." }` | No `Content-Length`, or a body over 32 MB |
| 429 | `{ "error": "busy" }` | All model slots are in use |
| 502 | `{ "error": "image_fetch_failed", "sku": "SKU-1203" }` | A candidate image cannot be fetched or decoded |
| 503 | `{ "error": "model_unavailable" }` | No model backend is configured or reachable |
| 504 | `{ "error": "model_timeout" }` | The model gave no answer in 22 s |

The component shows the "Could not identify right now" screen for every error.
