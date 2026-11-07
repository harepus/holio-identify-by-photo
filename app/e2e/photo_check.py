"""Runs the component's on-device photo check in Chromium over the server's fixture photos.

Every fixture must pass, a 25% brightness copy must read dark, and a 6 px blur must read blurred.
Run with the dev server up:  uv run --with playwright python e2e/photo_check.py [base_url]
"""
import base64
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

PHOTOS = Path(__file__).resolve().parent.parent.parent / "server/tests/fixtures/photos"
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5174"
JS = """
async (b64) => {
  const m = await import('/src/identify/photo.ts');
  const url = await m.preparePhoto(await (await fetch('data:image/jpeg;base64,' + b64)).blob());
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  const variant = (filter) => {
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d'); x.filter = filter; x.drawImage(bmp, 0, 0); return c.toDataURL('image/jpeg', 0.85);
  };
  return {
    longEdge: Math.max(bmp.width, bmp.height),
    original: await m.checkPhotoOnDevice(url),
    dark: await m.checkPhotoOnDevice(variant('brightness(0.25)')),
    blurred: await m.checkPhotoOnDevice(variant('blur(6px)')),
  };
}
"""

failures = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(BASE)
    for f in sorted(PHOTOS.glob("*/*.jpg")):
        r = page.evaluate(JS, base64.b64encode(f.read_bytes()).decode())
        ok = r["original"] == "ok" and r["dark"] == "dark" and r["blurred"] == "blurred" and r["longEdge"] <= 1600
        print(f"[{'ok' if ok else 'err'}] {f.parent.name}/{f.name} {r}")
        if not ok:
            failures.append(f.name)
    big = page.evaluate("""async () => {
      const m = await import('/src/identify/photo.ts');
      const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
      c.getContext('2d').fillRect(0, 0, 10, 10);
      const url = await m.preparePhoto(await new Promise((r) => c.toBlob(r, 'image/png')));
      const b = await createImageBitmap(await (await fetch(url)).blob());
      return [b.width, b.height, url.slice(0, 23)];
    }""")
    print(f"[{'ok' if big == [1600, 1200, 'data:image/jpeg;base64,'] else 'err'}] 4000 x 3000 PNG becomes {big}")
    if big != [1600, 1200, "data:image/jpeg;base64,"]:
        failures.append("resize")
    browser.close()
if failures:
    raise SystemExit(f"[err] {len(failures)} photos failed")
