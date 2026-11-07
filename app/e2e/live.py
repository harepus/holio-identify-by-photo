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
    expect(page.get_by_text("Comparing with")).to_have_count(0, timeout=30000)
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
    secs = identify(page)
    expect(page.locator(".hid-badge-lg")).to_have_text("Match")
    expect(page.get_by_text("Potetskruer Salt").first).to_be_visible()
    print(f"[ok] h009 Maarud Potetskruer Salt: match in {secs:.1f} s")
    shot(page, "02-match-h009")

    page.get_by_role("button", name="Confirm").click()
    expect(page.get_by_role("dialog", name=f"Link barcode {UNKNOWN} to Potetskruer Salt 90 g?")).to_be_visible()
    shot(page, "03-link-barcode")
    page.get_by_role("button", name="Link barcode").click()
    expect(page.locator(".cam")).to_be_visible()
    shot(page, "04-scanner-return")

    page.get_by_role("button", name=f"Unknown code {UNKNOWN}").click()
    expect(page.locator(".scan-banner")).to_contain_text("2/24")
    print("[ok] the linked barcode now scans straight to Potetskruer Salt")
    shot(page, "05-linked-scan")

    page.get_by_role("button", name="Melkesjokolade 200g 7040110569908").click()
    page.get_by_role("dialog").get_by_role("button", name="Identify by photo").click()
    take(page, "h016")
    secs = identify(page)
    expect(page.get_by_text("Not on PO #500004701").first).to_be_visible()
    expect(page.get_by_text("Melkesjokolade").first).to_be_visible(timeout=30000)
    print(f"[ok] h016 Freia Melkesjokolade: not on the order in {secs:.1f} s, best guess from the register")
    shot(page, "06-not-on-order")
    page.get_by_role("button", name="Register deviation").click()
    expect(page.get_by_role("dialog", name="Receive extra item")).to_be_visible()
    shot(page, "08-extra-link")
    page.get_by_role("button", name="Link barcode").click()
    expect(page.locator(".scan-banner")).to_contain_text("1 extra received")
    page.locator(".sim-grid").get_by_role("button", name="Melkesjokolade 200g 7040110569908").first.click()
    expect(page.locator(".scan-banner")).to_contain_text("2 extra received")
    shot(page, "09-extra-rescan")

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
