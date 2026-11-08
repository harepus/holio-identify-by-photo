# Try the Holio receiving demo

Start with the [64-second recording](demo/receiving.mp4). It shows a real model response, explicit receipt review, barcode linking and the next scan. The [saved evidence](../evidence/delivery-20261108/README.md) identifies the application commit and test inputs.

## Open the app

The hosted demo is at `https://m4.taildb1007.ts.net:8443`. Use the access link shared privately by the team. An unauthenticated request returns 401. The key is intentionally absent from this repository; after opening the access link once, the browser keeps an access cookie.

The host Mac must remain awake and online, and its Claude subscription must have usage available. If the host is unavailable, use the recording or [run locally](../README.md#run-locally).

## Reproduce the recorded flow

Use a fresh browser session so the example code has not already been linked. Download these two fixture photos: [front](../server/tests/fixtures/photos/h009/photo1.jpg) and [back](../server/tests/fixtures/photos/h009/photo2.jpg).

1. Open the purchase order and select **Scan**.
2. Expand **Demo tools**, then select **Unknown code 7031234567890**. These buttons simulate barcode input; they do not simulate recognition.
3. Select **Identify by photo**. Upload the front photo, then add the back photo. On a phone, the photo action opens the camera instead of a desktop file picker.
4. Select **Identify**. In the recording, the result was **Potetskruer Salt**, **SKU-7025**, catalog size **90 g**. A model result can vary; check the product and variant yourself.
5. Select **Review receipt**. Check quantity **1**, location **A-01-02**, and **Link barcode 7031234567890**. No quantity has been received yet.
6. Select **Receive 1**. The scanner shows **1/24**.
7. Select the same unknown-code button again. It now shows **2/24**, without another photo or model call.

Select **Undo last receipt** to reverse the last quantity change. Undo keeps the barcode link. Reload resets quantities and locations; **Demo tools** can forget linked barcodes.

## Check the boundaries

- Select **Melkesjokolade 200g 7040110569908** in Demo tools. It opens **Not on PO #500004701** with no Receive action.
- Use **Search manually** to choose a product without the model. Search starts with the order and can expand to the full register.
- When recognition fails technically, the app shows **Identification unavailable** and retains manual search. Record the error separately from an incorrect or uncertain product suggestion.
- Mock URLs such as `?mock=choose` demonstrate interface states and display a **Mock** badge. Keep them out of recognition measurements.

## Physical phone check before presenting

This step needs a person with the device. Browser tests have not established physical iPhone or Zebra behavior.

1. Open the HTTPS access link in Safari or Chrome and allow the rear camera.
2. Scan the printed barcode of a matching demo product, such as Superchips Paprika **7050122114607**. Check that it adds one unit, and that holding the pack still does not add repeated units.
3. Remove the pack from view, then scan again. Check the second receipt and **Undo last receipt**.
4. Choose **No barcode?**, photograph a real demo product's front and label, and verify the exact name and variant before receiving. Check that quantity and location fields remain usable with the keyboard open.
5. Note device, browser, product, result, elapsed time and any error. A successful recording is not a substitute for this check.

## Scope of this prototype

The receipt flow is local demo state. It does not update a Holio warehouse, validate shelf labels against a location directory, synchronize devices or queue offline receipts. The [integration guide](integration.md) explains the handoff to those systems.
