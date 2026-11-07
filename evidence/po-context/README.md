# Engine accuracy with a purchase order as context

The arena scored the pain 3 engine against the whole 247-product register. In Holio, receiving already knows the purchase order, so the engine only has to choose among its lines. This run measures that.

## Method

`ctx_eval.py` turns each of the 47 holdout cases in `/Users/sh/dev-env/holio-arena-holdout/p3-no-barcode/` into 8-product registers shaped like one supplier's order: same brand first, then same category, then any.

- `in` (38 cases): the true product plus 7 others. A crowd duplicate of the true product, the same name with the same or a missing size, is left out, because a store's own register lists a product once.
- `out` (47 cases): 8 products without the true product, so "not on this order" is the right answer. Products whose name shares most words with the true product are left out.

The engine is a copy of the arena entry `holio-arena/pains/p3-no-barcode/entries/opus` (macOS Vision OCR, CLIP shortlist, `claude -p --model sonnet` judge, abstain below 0.7 or when a self-check fails), run 4 cases at a time on one Mac on 2026-11-07.

## Result

| Order holds the item (38) | Count |
|---|---|
| Right product on the first suggestion | 36 |
| Confidently wrong | 0 |
| Unsure, right product in the top 3 | 2 (h026, h043) |

| Order does not hold the item (47) | Count |
|---|---|
| Correctly said not on this order | 45 |
| Confidently picked a product | 2 |

Latency p50 5.6 s, p90 6.4 s, 4 cases in parallel.

The two confident picks:

- h028: a Kavli ham cheese spread tube matched SKU-2126 "SkinkOst". The truth is SKU-3070 "Skinkeost 175 g", most likely the same product under a second crowd row. The name filter did not catch "skinkost" against "skinkeost".
- h050: a Lerum lingonberry jam the arena withheld matched SKU-9699 "Tyttebærsyltetøy" (Lerum, no size in the register). Counted as a real miss: a sibling the register cannot tell apart by size.

## Limits

- Simulated orders. Real orders mix brands and may hold several sizes of one product.
- Groceries with printed text only, from Open Food Facts photos. Apparel and parts are not measured.
- Each run built its own 8-item index, and the CLIP model loaded per process. A long-lived server avoids both.

## Reproduce

```sh
python3 -I ctx_eval.py        # needs the arena holdout, a copy of the opus entry in ./entry and a logged-in claude CLI
```
