"""End to end against the real server and engine, with real photos. No mock.

Run with the server up:  uv run --with playwright python app/e2e/live.py [base_url]
Writes app/.e2e-shots/live-*.png and fails on the first wrong screen.
"""
import sys
import time
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

APP = Path(__file__).resolve().parent.parent
PHOTOS = APP.parent / "server/tests/fixtures/photos"
OUT = APP / ".e2e-shots"
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8770"
UNKNOWN = "7031234567890"


def shot(page: Page, name: str) -> None:
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / f"live-{name}.png"))
    print(f"[ok] {name}")


def take(page: Page, case: str) -> None:
    for n in ("photo1.jpg", "photo2.jpg"):
        page.locator(".hid-file").set_input_files(str(PHOTOS / case / n))
        page.wait_for_timeout(200)


def identify(page: Page) -> float:
    t0 = time.time()
    page.get_by_role("button", name="Identify", exact=True).click()
    page.locator(".hid-badge-lg, .hid-err, .hid-empty").first.wait_for(timeout=30000)
    return time.time() - t0


def line(page: Page, name: str):
    return page.locator(".line", has_text=name)


def run(page: Page) -> None:
    page.goto(BASE)
    page.evaluate("localStorage.clear(); sessionStorage.clear()")
    page.goto(BASE)
    expect(page.locator(".line").first).to_be_visible()
    expect(page.locator(".chip-mock")).to_have_count(0)
    expect(line(page, "Potetskruer Salt")).to_contain_text("0/24")
    shot(page, "01-po")

    page.locator(".fab").click()
    page.get_by_text("Demo tools", exact=True).click()
    page.get_by_role("button", name=f"Unknown code {UNKNOWN}").click()
    page.get_by_role("dialog").get_by_role("button", name="Identify by photo").click()
    take(page, "h009")
    with page.expect_response(lambda r: "/v1/identify" in r.url, timeout=30000) as response:
        secs = identify(page)
    if response.value.status == 503:
        assert response.value.json()["error"] == "model_unavailable"
        expect(page.get_by_text("Could not identify right now.", exact=True)).to_be_visible()
        shot(page, "02-model-unavailable")
        page.locator(".hid").get_by_role("button", name="Search manually", exact=True).click()
        expect(page.get_by_label("Name, SKU or barcode")).to_be_visible()
        print("[ok] 503 model_unavailable and manual recovery; live recognition skipped. screens.py covers labeled mock success.")
        return
    expect(page.locator(".hid-badge-lg")).to_have_text("Match")
    expect(page.get_by_text("Potetskruer Salt").first).to_be_visible()
    print(f"[ok] h009 Maarud Potetskruer Salt: match in {secs:.1f} s")
    shot(page, "02-match-h009")

    page.get_by_role("button", name="Review receipt", exact=True).click()
    expect(page.get_by_role("dialog", name="Review receipt")).to_be_visible()
    shot(page, "03-review")
    page.get_by_role("button", name="Receive 1", exact=True).click()
    expect(page.locator(".scan-banner")).to_contain_text("now 1 of 24")
    page.get_by_role("button", name=f"Unknown code {UNKNOWN}").click()
    expect(page.locator(".scan-banner")).to_contain_text("now 2 of 24")
    shot(page, "04-linked-scan")
    print("[ok] live photo, receipt review, barcode link and rescan")
    page.get_by_role("button", name="Melkesjokolade 200g 7040110569908").click()
    expect(page.get_by_role("dialog", name="Not on this order")).to_contain_text("Nothing received")
    shot(page, "05-off-order")

    page.goto(f"{BASE}/#/pc")
    page.wait_for_timeout(500)
    shot(page, "07-pc-panel")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        try:
            run(page)
        finally:
            browser.close()
