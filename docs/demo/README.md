# Demo recording

[Play receiving.mp4](receiving.mp4)

Recorded on 8 November 2026 at 10:37 Oslo, using application commit `63b54d5`. The recording is about 64 seconds, with no cuts or playback speed changes. It was re-encoded at 30 fps for consistent playback.

| Time | What happens |
|---|---|
| 00:00 | Open the scanner on the demo purchase order |
| 00:05 | Open the labeled Demo tools |
| 00:11 | Simulate the unknown barcode 7031234567890 |
| 00:20 | Choose photo identification and upload two real fixture photos |
| 00:27 | Start the real identification request |
| 00:32 | Receive Match for Potetskruer Salt, SKU-7025 |
| 00:46 | Open receipt review with quantity 1 and location A-01-02 |
| 00:52 | Receive the first unit and link the extra barcode |
| 01:03 | Simulate the same barcode again; quantity becomes 2 without a model call |

The final state is also available as a [screenshot](../../evidence/delivery-20261108/next-scan.png). The model call took 5.106 seconds on the server. Barcode input is simulated; recognition is real. Camera access is off in this browser recording. It does not establish physical phone behavior or recognition accuracy beyond this known fixture.

See the [raw response and verification details](../../evidence/delivery-20261108/README.md).
