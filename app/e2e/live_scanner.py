# /// script
# dependencies = ["playwright"]
# ///
"""The live camera scanner, end to end, with Chromium's fake camera filming a printed barcode.

Run with the server up:  uv run --with playwright --with python-barcode --with pillow python app/e2e/live_scanner.py [base_url]
Needs ffmpeg. Writes app/.e2e-shots/scanner-*.png and fails on the first wrong screen.
"""
import subprocess
import sys
from pathlib import Path

import struct
import zlib
from playwright.sync_api import Page, expect, sync_playwright

APP = Path(__file__).resolve().parent.parent
PHOTOS = APP.parent / "server/tests/fixtures/photos"
OUT = APP / ".e2e-shots"
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8770"
KNOWN = "7050122114607"  # Superchips Paprika 140 g, verified on Open Food Facts
UNKNOWN = "7038010009457"


def camera_video(code: str | None) -> Path:
    """A 640x480 Y4M clip of one EAN-13 barcode, or none, on a grey desk, for --use-file-for-fake-video-capture."""
    png, y4m = OUT / f"code-{code or 'none'}.png", OUT / f"code-{code or 'none'}.y4m"
    # EAN-13 encoding, drawn into a PPM for ffmpeg. No image library needed.
    left = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
    parity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]
    bits = ""
    if code:
        bits = "101"
        for digit, kind in zip(code[1:7], parity[int(code[0])]):
            pattern = left[int(digit)]
            bits += pattern if kind == "L" else ''.join('1' if c == '0' else '0' for c in pattern[::-1])
        bits += "01010"
        for digit in code[7:]:
            bits += ''.join('1' if c == '0' else '0' for c in left[int(digit)])
        bits += "101"
    rows = []
    for y in range(480):
        row = bytearray()
        for x in range(640):
            module = (x - 177) // 3
            black = 150 <= y < 330 and 0 <= module < len(bits) and bits[module] == '1'
            v = 0 if black else 255 if code and 140 <= x < 500 and 130 <= y < 350 else 120
            row.extend((v, v, v))
        rows.append(b'\0' + bytes(row))
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    png.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 640, 480, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b''))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(png), "-t", "2", "-r", "15",
                    "-pix_fmt", "yuv420p", str(y4m)], check=True)
    return y4m


def open_page(p, video: Path, url: str = BASE, native: bool = True) -> Page:
    browser = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
                                      f"--use-file-for-fake-video-capture={video}"])
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, permissions=["camera"])
    if not native:
        ctx.add_init_script("delete window.BarcodeDetector")
    page = ctx.new_page()
    page.goto(url)
    page.evaluate("localStorage.clear(); sessionStorage.clear()")
    page.goto(url)
    expect(page.locator(".line").first).to_be_visible()
    return page


def shot(page: Page, name: str) -> None:
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / f"scanner-{name}.png"))
    print(f"[ok] {name}")


def line(page: Page, name: str):
    return page.locator(".line", has_text=name)


def known_code_receives(p, native: bool) -> None:
    page = open_page(p, camera_video(KNOWN), native=native)
    page.locator(".fab").click()
    expect(page.locator(".scan-banner")).to_contain_text("Received, now 1 of 24", timeout=10000)
    shot(page, f"known-{'native' if native else 'zxing'}")
    page.wait_for_timeout(3500)
    expect(page.locator(".sub")).to_contain_text("1/156")
    expect(page.locator(".cam-received")).to_have_count(0)
    page.get_by_role("button", name="Back", exact=True).click()
    expect(line(page, "Paprika")).to_contain_text("1/24")
    page.context.browser.close()


def unknown_code_links(p) -> None:
    page = open_page(p, camera_video(UNKNOWN))
    page.locator(".fab").click()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_contain_text(UNKNOWN, timeout=10000)
    shot(page, "unknown-sheet")
    dialog.get_by_role("button", name="Search manually").click()
    page.get_by_label("Name, SKU or barcode").fill("Potetskruer")
    page.locator(".search-results .product-row").click()
    page.get_by_role("button", name="Receive 1", exact=True).click()
    page.wait_for_timeout(3000)
    expect(page.locator(".scan-banner")).to_contain_text("now 1 of 24")
    page.get_by_role("button", name="Back", exact=True).click()
    page.get_by_role("button", name="Open scanner").click()
    expect(page.locator(".scan-banner")).to_contain_text("now 2 of 24", timeout=10000)
    shot(page, "linked-rescan")
    page.context.browser.close()


def live_view_without_a_code(p) -> None:
    page = open_page(p, camera_video(None))
    page.locator(".fab").click()
    expect(page.locator('.cam[data-camera="live"] video')).to_be_visible(timeout=10000)
    page.wait_for_timeout(1500)
    expect(page.get_by_role("dialog")).to_have_count(0)
    expect(page.locator(".sim")).not_to_have_attribute("open", "")
    shot(page, "live")
    page.get_by_text("Demo tools", exact=True).click()
    shot(page, "demo-tools")
    page.context.browser.close()


def plain_http_says_https(p, url: str) -> None:
    page = open_page(p, camera_video(KNOWN), url=url)
    page.locator(".fab").click()
    expect(page.locator('.cam[data-camera="insecure"]')).to_contain_text("HTTPS")
    shot(page, "needs-https")
    page.context.browser.close()


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        known_code_receives(p, native=True)
        known_code_receives(p, native=False)
        unknown_code_links(p)
        live_view_without_a_code(p)
        if len(sys.argv) > 2:
            plain_http_says_https(p, sys.argv[2])
