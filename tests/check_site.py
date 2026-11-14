"""Browser regression checks. Requires Playwright and an installed Chromium."""
import hashlib
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BASELINE = {
    "README.md": "3f57e4aa887021a6628ccd9aefdadc74d848adc8",
    "index.html": "f358d1124ecd1e9a45cb8419ee7fdedf1b698d22",
    "script.js": "c16823970015a9b6a4b6460ea8e043400e9002ac",
    "styles.css": "1e8ba7ad72bde8b75da52d876821dd79159b8c49",
}
for name, expected in BASELINE.items():
    content = (ROOT / "calculator" / name).read_bytes()
    actual = hashlib.sha1(f"blob {len(content)}\0".encode() + content).hexdigest()
    assert actual == expected, f"Existing calculator file changed: {name}"
print("PASS: all four calculator files match the original GitHub blobs")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"))
    context = browser.new_context()
    errors, missing = [], []
    context.on("weberror", lambda error: errors.append(str(error)))

    # Intercept a reserved local origin to test real browser URL resolution at
    # both deployment roots, without external requests or a running web server.
    def serve(route):
        path = unquote(urlsplit(route.request.url).path)
        if path.startswith("/small-apps/"):
            path = path[len("/small-apps"):]
        file = (ROOT / path.lstrip("/")).resolve()
        if not file.is_relative_to(ROOT):
            route.fulfill(status=403)
            return
        if file.is_dir():
            file /= "index.html"
        if not file.is_file():
            missing.append(path)
            route.fulfill(status=404)
            return
        types = {".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml"}
        route.fulfill(path=str(file), content_type=types.get(file.suffix, "text/plain"))

    context.route("http://app-lab.test/**", serve)
    page = context.new_page()
    for prefix in ("/", "/small-apps/"):
        url = "http://app-lab.test" + prefix
        page.goto(url)
        expect(page.locator(".app-grid > .app-card")).to_have_count(12)
        expect(page.locator(".launch-link")).to_have_count(11)
        expect(page.locator(".app-card:has(.coming-soon) a, .app-card:has(.coming-soon) button")).to_have_count(0)
        expect(page.locator("#year")).to_have_text(page.evaluate("String(new Date().getFullYear())"))
        for width, columns in ((320, 1), (375, 1), (640, 1), (768, 2), (1000, 2), (1024, 3), (1440, 3)):
            page.set_viewport_size({"width": width, "height": 900})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Overflow at {width}"
            actual = page.locator(".app-grid").evaluate("el => getComputedStyle(el).gridTemplateColumns.split(' ').length")
            assert actual == columns, f"Expected {columns} columns at {width}, got {actual}"
            for card in page.locator(".app-card").all():
                assert card.evaluate("el => el.scrollWidth <= el.clientWidth"), f"Card overflow at {width}"
        page.set_viewport_size({"width": 1440, "height": 1080})
        page.screenshot(path="/tmp/app-lab-desktop.png", full_page=True)
        page.set_viewport_size({"width": 375, "height": 812})
        page.screenshot(path="/tmp/app-lab-mobile.png", full_page=True)
        page.locator(".launch-link").first.click()
        expect(page).to_have_url(url + "calculator/")
        expect(page.locator("#result")).to_have_text("0")
        print(f"PASS: gallery, assets, launch link, and seven viewport widths at {prefix}")

    result = page.locator("#result")

    def keys(sequence, expected):
        page.locator("[data-action=clear]").click()
        page.locator(".hint").click()  # Keyboard Enter should evaluate, not activate a focused button.
        for key in sequence:
            page.keyboard.press(key)
        expect(result).to_have_text(expected)

    cases = [
        (["2", "+", "3", "Enter"], "5"),
        (["9", "-", "4", "="], "5"),
        (["6", "*", "7", "Enter"], "42"),
        (["8", "/", "2", "Enter"], "4"),
        (["2", "+", "3", "*", "4", "Enter"], "20"),
        (["2", "+", "*", "3", "Enter"], "6"),
        ([".", "1", "+", ".", "2", "Enter"], "0.3"),
        (["1", ".", ".", "5"], "1.5"),
        (["1", "2", "Backspace"], "1"),
        (["9", "Backspace"], "0"),
        (["8", "/", "0", "Enter"], "Error"),
        (["8", "/", "0", "Enter", "7"], "7"),
        (["8", "/", "0", "Enter", "Backspace"], "0"),
        (["8", "/", "0", "Enter", "Escape"], "0"),
        (["1", "+", "1", "Enter", "3"], "3"),
        (["1", "+", "1", "Enter", "*", "3", "Enter"], "6"),
        (["9", "c"], "0"),
        (["9", "C"], "0"),
        (["9", "Escape"], "0"),
        (["1", "-", "3", "Enter"], "-2"),
        (["="], "0"),
        (["1", "+", "Enter"], "1"),
        (list("1234567890123456"), "123456789012345"),
    ]
    for sequence, expected in cases:
        keys(sequence, expected)
    keys(["1", "/", "0", "Enter"], "Error")
    expect(page.locator("#expression")).to_have_text("Cannot divide by zero")
    page.locator("[data-action=clear]").click()
    for digit in ("6", "5"):
        page.locator(f"[data-digit='{digit}']").click()
    page.locator("[data-action=backspace]").click()
    page.locator("[data-operator='+']").click()
    page.locator("[data-digit='4']").click()
    page.locator("[data-action=equals]").click()
    expect(result).to_have_text("10")
    page.locator("[data-action=clear]").click()
    expect(result).to_have_text("0")
    expect(page.locator("#expression")).to_have_text("Ready to calculate")
    for width in (320, 375, 768, 1440):
        page.set_viewport_size({"width": width, "height": 900})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    print("PASS: calculator arithmetic, chaining, decimals, input limits, errors, recovery, keyboard and click controls")

    no_js = browser.new_context(java_script_enabled=False)
    no_js.route("http://app-lab.test/**", serve)
    fallback = no_js.new_page()
    fallback.goto("http://app-lab.test/small-apps/")
    expect(fallback.locator(".app-card")).to_have_count(12)
    fallback.locator(".launch-link").first.click()
    expect(fallback).to_have_url("http://app-lab.test/small-apps/calculator/")
    print("PASS: gallery and navigation work without JavaScript")
    assert not missing, f"Missing local assets: {missing}"
    assert not errors, f"Browser JavaScript errors: {errors}"
    browser.close()
