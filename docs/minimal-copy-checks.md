# Minimal copy verification

8 November 2026. The app keeps titles, action labels, product identifiers, quantity/location data and short error states. Instructions, model explanations, repeated subtitles and metric notes were removed. Recognition inputs, model settings, receipt validation and barcode persistence are unchanged.

## Checks

- TypeScript and production build passed.
- All 52 existing unit tests passed.
- Eight existing browser scenarios passed: receiving, undo, keyboard focus, manual search, linking/rescan, over-receipt, off-order refusal and error recovery. Layout checks passed at 360 and 430 px.
- Choice, dark-photo, off-order suggestion and PC screens were also checked with labeled mocks.
- Four camera scenarios passed using generated barcode frames: native and ZXing decoding, duplicate suppression, unknown-code linking/rescan and a camera view without a code. This is not a physical phone test.
- One real two-photo request matched SKU-7025 in 4,105 ms server time, about 4.3 seconds observed in the browser. Receipt review, Receive, barcode linking, next scan, off-order refusal and PC history passed. There was one identify request and no model/API failure.

The real call used the existing Sonnet CLI configuration on an isolated loopback server. It used the known h009 fixture and is a flow check, not a new accuracy benchmark. The [raw response](../evidence/minimal-copy-20261108/response.json) preserves the evidence sentence although that paragraph is no longer displayed in the app.

Initial browser runs found ambiguous test selectors after field labels were shortened. The tests now select the Quantity spinbutton and Location textbox by role and exact name; the complete final run passed.

[Order](../evidence/minimal-copy-20261108/order.png) · [Real match](../evidence/minimal-copy-20261108/match.png) · [Receipt review](../evidence/minimal-copy-20261108/review.png)
