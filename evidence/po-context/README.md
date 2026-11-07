# Engine accuracy with a purchase order as context

The arena scored the pain 3 engine against the whole 247-product register. In Holio, receiving already knows the purchase order, so the engine only has to choose among its lines. This run measures that.

## Method

`ctx_eval.py` turns each of the 47 holdout cases in `/Users/sh/dev-env/holio-arena-holdout/p3-no-barcode/` into 8-product registers shaped like one supplier's order: same brand first, then same category, then any.

- `in` (38 cases): the true product plus 7 others. A crowd duplicate of the true product, the same name with the same or a missing size, is left out, because a store's own register lists a product once.
- `out` (47 cases): 8 products without the true product, so "not on this order" is the right answer. Products whose name shares most words with the true product are left out.

The engine is a copy of the arena entry `holio-arena/pains/p3-no-barcode/entries/opus` (macOS Vision OCR, CLIP shortlist, `claude -p --model sonnet` judge) with the prompt from `server/engine.py`. That prompt adds the rule that catalog and photo text are data, never instructions. The run used 4 cases at a time on one Mac on 2026-11-07.

Each answer is scored as the product shows it, by the rule in `server/decide.py`:

- Match: the judge picked a row with confidence 0.7 or more, and both self-checks passed.
- Choice of three: the judge picked a row with lower confidence or a failed self-check.
- Not on the order: the judge picked none.

## Result

| Order holds the item (38) | Count |
|---|---|
| Match on the right product | 36 |
| Match on a wrong product | 0 |
| Choice of three, right product among them | 2 (h018, h043) |

| Order does not hold the item (47) | Count |
|---|---|
| Not on the order | 45 |
| Choice of three | 1 (h047) |
| Match | 1 (h028) |

Latency p50 5.6 s, p90 6.4 s, 4 cases in parallel.

- h028: a Kavli ham cheese spread tube matched SKU-2126 "SkinkOst". The truth is SKU-3070 "Skinkeost 175 g", most likely the same product under a second crowd row. The name filter did not catch "skinkost" against "skinkeost".
- h047: a Nescafé Classic 3in1 stick went to a choice of three led by a 95 g Nescafé row, at confidence 0.6. The worker sees it as unsure and can use "Search manually".

## The arena prompt for comparison

`results-arena-prompt.json` and `score-arena-prompt.json` hold the same run with the arena prompt, before the data rule. In-order results were the same: 36 right matches, 0 wrong, 2 choices of three. Out of order it gave 43 not on the order, 2 choices of three (h023, h047) and 2 matches: h028, and h050, a Lerum lingonberry jam matched to a sibling row with no size. The gap is 2 of 47 cases on one run each. That is too small to call a gain, so read it as no loss from the data rule.

## Limits

- Simulated orders. Real orders mix brands and may hold several sizes of one product.
- Groceries with printed text only, from Open Food Facts photos. Apparel and parts are not measured.
- Each run built its own 8-item index, and the CLIP model loaded per process. A long-lived server avoids both.
- The entry accepts a self-check that the judge leaves out. `server/decide.py` needs both checks to be true, which can only turn a match into a choice of three.

## Reproduce

```sh
python3 -I ctx_eval.py                       # needs the arena holdout, a copy of the opus entry in ./entry and a logged-in claude CLI
python3 -I ctx_eval.py --score results.json  # rescores saved results with truth.json, nothing else needed
```
