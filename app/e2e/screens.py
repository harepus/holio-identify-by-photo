"""Screenshots of every demo screen in mock mode at 390 x 844.

Run with the dev server up:  uv run --with playwright python e2e/screens.py [base_url]
Writes app/.e2e-shots/*.png and fails on the first missing screen.
"""
import sys
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

APP = Path(__file__).resolve().parent.parent
PHOTOS = APP.parent / "server/tests/fixtures/photos"
FRONT = str(PHOTOS / "h005/photo1.jpg")
LABEL = str(PHOTOS / "h005/photo2.jpg")
OUT = APP / ".e2e-shots"
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5174"


def shot(page: Page, name: str) -> None:
    page.wait_for_timeout(350)
    page.screenshot(path=str(OUT / f"{name}.png"))
    print(f"[ok] {name}")


def open_po(page: Page, query: str) -> None:
    page.goto(f"{BASE}/?{query}")
    expect(page.locator(".line").first).to_be_visible()


def start_photo_flow(page: Page) -> None:
    page.locator(".fab").click()
    page.get_by_role("button", name="No barcode? Identify by photo").click()
    expect(page.locator(".hid-viewfinder")).to_be_visible()


def take(page: Page, path: str) -> None:
    page.locator(".hid-file").set_input_files(path)


def run(page: Page) -> None:
    open_po(page, "mock=match")
    page.evaluate("localStorage.clear(); sessionStorage.clear()")
    open_po(page, "mock=match")
    expect(page.locator(".chip-mock")).to_have_text("Mock: match")
    shot(page, "01-po")

    page.locator(".fab").click()
    expect(page.locator(".cam")).to_be_visible()
    shot(page, "02-scanner")

    page.get_by_role("button", name="Unknown code 7031234567890").click()
    expect(page.get_by_role("dialog", name="Unknown barcode")).to_be_visible()
    shot(page, "03-unknown-code")

    page.get_by_role("dialog").get_by_role("button", name="Identify by photo").click()
    expect(page.locator(".hid-viewfinder")).to_be_visible()
    shot(page, "04-capture-empty")

    take(page, FRONT)
    expect(page.locator(".hid-preview .hid-lab")).to_have_text("Photo 1")
    shot(page, "05-capture-one")

    take(page, LABEL)
    expect(page.get_by_text("2 photos, the most for one item")).to_be_visible()
    shot(page, "06-capture-two")

    page.get_by_role("button", name="Identify", exact=True).click()
    expect(page.get_by_text("Comparing with 8 products on PO #500004701")).to_be_visible()
    page.wait_for_timeout(1200)
    shot(page, "07-identifying")

    expect(page.locator(".hid-badge-lg")).to_have_text("Match", timeout=5000)
    expect(page.get_by_text("Confirm receives 1 on this line, like a scan. 0/24 becomes 1/24.")).to_be_visible()
    shot(page, "08-match")

    page.get_by_role("button", name="Confirm").click()
    expect(page.get_by_role("dialog", name="Link barcode 7031234567890 to Superchips sourcream & onion 140 g?")).to_be_visible()
    shot(page, "09-link-barcode")

    page.get_by_role("button", name="Link barcode").click()
    expect(page.locator(".toast")).to_have_text("Barcode linked. 23 more on this order will scan normally.")
    expect(page.locator(".line-hl .tag")).to_have_text("Identified by photo")
    shot(page, "10-po-barcode-linked")

    page.locator(".fab").click()
    page.get_by_role("button", name="Unknown code 7031234567890").click()
    expect(page.locator(".toast")).to_have_text("Received 1 Superchips sourcream & onion 140 g.")
    expect(page.locator(".line-hl .line-ct b")).to_have_text("2/24")

    open_po(page, "mock=match")
    start_photo_flow(page)
    take(page, FRONT)
    page.get_by_role("button", name="Identify", exact=True).click()
    page.get_by_role("button", name="Confirm").click()
    expect(page.locator(".toast")).to_have_text("Received 1 Superchips sourcream & onion 140 g. Identified by photo.")
    expect(page.locator(".line-hl .line-ct b")).to_have_text("1/24")
    shot(page, "11-po-received")

    open_po(page, "mock=choose")
    start_photo_flow(page)
    take(page, FRONT)
    page.get_by_role("button", name="Identify", exact=True).click()
    expect(page.get_by_role("heading", name="Pick the right product")).to_be_visible(timeout=5000)
    shot(page, "12-choose")

    page.locator(".hid-cand").nth(1).click()
    expect(page.get_by_role("dialog", name="Confirm Crispo 65 g?")).to_be_visible()
    shot(page, "13-confirm-sheet")

    page.get_by_role("button", name="Cancel").click()
    page.get_by_role("button", name="Add a photo of the size").click()
    take(page, LABEL)
    page.get_by_role("button", name="Identify", exact=True).click()
    expect(page.get_by_text("2 photos. The second settled the size.")).to_be_visible(timeout=5000)
    shot(page, "14-match-size-photo")

    open_po(page, "mock=none")
    start_photo_flow(page)
    take(page, FRONT)
    page.get_by_role("button", name="Identify", exact=True).click()
    expect(page.get_by_text("Searching all products")).to_be_visible(timeout=5000)
    shot(page, "15-register-search")

    expect(page.get_by_role("button", name="Register deviation")).to_be_visible(timeout=5000)
    expect(page.get_by_role("heading", name="Not on PO #500004701")).to_be_visible()
    shot(page, "16-not-on-order")
    page.get_by_role("button", name="Register deviation").click()
    expect(page.locator(".toast")).to_contain_text("Melkesjokolade 200 g")

    open_po(page, "mock=dark")
    start_photo_flow(page)
    take(page, FRONT)
    expect(page.get_by_text("Too dark to read the pack. Turn on the flashlight and retake.")).to_be_visible()
    shot(page, "17-too-dark")

    open_po(page, "mock=error")
    start_photo_flow(page)
    take(page, FRONT)
    page.get_by_role("button", name="Identify", exact=True).click()
    expect(page.get_by_text("Could not identify right now.")).to_be_visible(timeout=5000)
    shot(page, "18-no-connection")

    open_po(page, "mock=match&lang=nb")
    page.locator(".fab").click()
    page.get_by_role("button", name="Ingen strekkode? Identifiser med bilde").click()
    take(page, FRONT)
    page.get_by_role("button", name="Identifiser", exact=True).click()
    expect(page.locator(".hid-badge-lg")).to_have_text("Treff", timeout=5000)
    expect(page.get_by_text("Bekreft mottar 1 på denne linjen, som en skanning. 0/24 blir 1/24.")).to_be_visible()
    shot(page, "19-match-nb")

    page.goto(f"{BASE}/?mock=match#/pc")
    expect(page.get_by_role("heading", name="Identified by photo")).to_be_visible()
    expect(page.locator(".tile-v").first).to_have_text("3")
    shot(page, "20-pc-panel")
    page.set_viewport_size({"width": 1280, "height": 800})
    shot(page, "21-pc-panel-desktop")


def live_request(page: Page) -> None:
    """Without ?mock, the component posts the contract's request to /v1/identify."""
    seen = []

    def answer(route):
        seen.append(route.request.post_data_json)
        route.fulfill(json={"status": "match", "candidates": [{"sku": "SKU-1203", "likelihood": "most_likely"}], "evidence": "live route", "readText": [], "ms": 1})

    page.route("**/v1/identify", answer)
    open_po(page, "")
    expect(page.locator(".chip-mock")).to_have_count(0)
    page.locator(".fab").click()
    page.get_by_role("button", name="Unknown code 7031234567890").click()
    page.get_by_role("dialog").get_by_role("button", name="Identify by photo").click()
    take(page, FRONT)
    page.get_by_role("button", name="Identify", exact=True).click()
    expect(page.get_by_text("live route")).to_be_visible()
    body = seen[0]
    assert body["photos"][0].startswith("data:image/jpeg;base64,"), "photo sent as a JPEG data URL"
    assert len(body["candidates"]) == 8 and body["candidates"][1]["image"] == "/demo/img/SKU-1203.jpg", "the 8 PO lines are the candidates"
    assert (body["context"], body["locale"], body["scannedCode"]) == ("receiving", "en", "7031234567890"), "context, locale and code sent"
    page.unroute("**/v1/identify")
    print("[ok] live request matches the contract")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        live_request(page)
        run(page)
        browser.close()
        if errors:
            raise SystemExit(f"[err] page errors: {errors}")


main()
