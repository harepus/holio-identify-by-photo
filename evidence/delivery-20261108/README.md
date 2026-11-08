# Recorded product verification, 8 November 2026

Application commit: `63b54d55c066263d2480afdc1cd293ffe5fb420b`.

The [recording](../../docs/demo/receiving.mp4) was made at 10:37 Oslo in a separate loopback server, using an archive of that commit and the preserved live build. All 407 baseline files matched before recording. The live server was not restarted or used for mutating tests. The isolated server was stopped after the check.

## Observations

| Check | Result |
|---|---|
| Real identification | HTTP 200, `match`, SKU-7025, Potetskruer Salt |
| Inputs | h009 front and back photos; eight purchase-order candidates |
| Configured model | `sonnet` through the existing Claude CLI login; no account/model substitution |
| Server time | 5,106 ms |
| Browser request time | 5,111 ms from Resource Timing |
| Technical model/API failures | 0 of 1 attempts |
| Receipt review | Quantity still 0 before Receive; quantity 1 afterward, at A-01-02 |
| Extra barcode | 7031234567890 linked to SKU-7025 |
| Next scan | Quantity 2; only one identify request across the entire flow |
| Off-order barcode, checked after recording | Melkesjokolade rejected with Nothing received |

[Machine-readable result](result.json) · [Raw response](response.json) · [Next-scan screenshot](next-scan.png)

## What the recording does and does not measure

Recognition is real. Barcode input uses the visible **Demo tools** buttons, and the photos are uploaded fixtures. There is no mock query or canned model result. This is a desktop browser at a phone-sized viewport, not a physical phone test. The recording runs for about 64 seconds without speeding up the model wait. It was re-encoded at 30 fps for consistent playback.

One familiar fixture cannot measure general accuracy. The catalog contains a single Potetskruer Salt candidate, so this run does not prove independent reading of the 90 g size. It confirms the expected SKU and the receiving flow for this case. The configured model alias is recorded; the resolved model version was not captured for this request.

During setup, one navigation occurred before the isolated server was listening and returned `ERR_CONNECTION_REFUSED`. It was resolved before recording and before any model request. This setup error is separate from the zero model/API failures above.

Two generated assets differed from the preserved file manifest in the source checkout. Nothing was overwritten. The recording used the complete preserved build in a separate directory instead.

## Earlier scheduled check

The [04:00 Oslo result](scheduled-0400.json) used the same application commit, configured model and fixture. It completed the existing `app/e2e/live.py` flow with a 7,893 ms server response and about 8.4 seconds observed in the browser. It also checked the off-order response and PC panel, stopped its isolated server and verified the live baseline unchanged.

The two timings are individual observations, not a latency benchmark. The [purchase-order evaluation](../po-context/README.md) is the broader, separate development-data measurement.
