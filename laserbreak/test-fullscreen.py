"""Real Chromium fullscreen + orientation lifecycle, rejection and missing-API checks."""
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'))
    errors = []
    def serve(route):
        file = ROOT / urlsplit(route.request.url).path.lstrip('/')
        if file.is_dir(): file /= 'index.html'
        route.fulfill(path=str(file), content_type={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}.get(file.suffix, 'text/html'))
    def context(**kwargs):
        c = browser.new_context(**kwargs); c.route('http://app-lab.test/**', serve)
        c.on('weberror', lambda e: errors.append(str(e))); return c
    for mobile in [False, True]:
        c = context(viewport={'width':844 if mobile else 1280,'height':390 if mobile else 720}, is_mobile=mobile, has_touch=mobile)
        c.add_init_script('window.locks=[];window.unlocks=0;screen.orientation.lock=async mode=>{locks.push(mode);};screen.orientation.unlock=()=>{unlocks++;};')
        page = c.new_page(); page.goto('http://app-lab.test/laserbreak/')
        button = page.locator('#fullscreen')
        expect(button).to_have_attribute('aria-label', 'Enter fullscreen')
        page.evaluate('world.clear();world.settings.density=0;world.settings.mode="release";input.down(1,"left",100);input.down(2,"right",200);window.resizeCalls=0;const nativeResize=resize;resize=()=>{resizeCalls++;nativeResize();};void 0')
        button.click(); page.wait_for_function('document.fullscreenElement!==null')
        expect(button).to_have_attribute('aria-label', 'Exit fullscreen'); expect(button).to_have_attribute('aria-pressed','true')
        assert page.evaluate('input.points.size===0 && world.effects.length===0 && resizeCalls>0 && !world.orientationBlocked')
        assert page.evaluate('locks.includes("landscape") && Math.abs(fieldBox.width-canvas.clientWidth)<1 && Math.abs(world.height-1000*canvas.clientHeight/canvas.clientWidth)<.01 && diagnostics.pixels<=1000000')
        button.click(); page.wait_for_function('document.fullscreenElement===null')
        expect(button).to_have_attribute('aria-label', 'Enter fullscreen'); expect(button).to_have_attribute('aria-pressed','false')
        assert page.evaluate('unlocks>0')
        # Browser-initiated exit must also update the control, not just button clicks.
        button.click(); page.wait_for_function('document.fullscreenElement!==null')
        page.evaluate('document.exitFullscreen()'); expect(button).to_have_attribute('aria-pressed','false')
        # Fullscreen remains usable even if orientation locking rejects.
        page.evaluate('screen.orientation.lock=async()=>{throw Error("lock unavailable");};void 0')
        button.click(); page.wait_for_function('document.fullscreenElement!==null')
        page.set_viewport_size({'width':390,'height':844})
        expect(page.locator('#orientation-overlay')).to_be_visible()
        assert page.evaluate('world.orientationBlocked && !world.ready() && arena.inert')
        page.evaluate('document.exitFullscreen()')
        page.set_viewport_size({'width':844 if mobile else 1280,'height':390 if mobile else 720})
        expect(page.locator('#orientation-overlay')).to_be_hidden(); expect(button).to_have_attribute('aria-pressed','false')
        # Orientation locking is optional even when fullscreen itself is available.
        page.evaluate('screen.orientation.lock=undefined;void 0')
        button.click(); page.wait_for_function('document.fullscreenElement!==null')
        button.click(); page.wait_for_function('document.fullscreenElement===null')
        # A fullscreen lock that resolves after exit must be released.
        page.evaluate('window.resolveLock=null;screen.orientation.lock=()=>new Promise(resolve=>{window.resolveLock=resolve;});void 0')
        button.click(); page.wait_for_function('document.fullscreenElement!==null && typeof resolveLock==="function"')
        before = page.evaluate('unlocks')
        button.click(); page.wait_for_function('document.fullscreenElement===null')
        page.evaluate('resolveLock()'); page.wait_for_function(f'unlocks>{before}')
        page.evaluate('screen.orientation.lock=async()=>{};document.documentElement.requestFullscreen=async()=>{throw Error("denied");};void 0')
        button.click(); expect(page.locator('#view-status')).to_have_text('Full screen unavailable in this browser.')
        expect(button).to_be_enabled(); expect(button).to_have_attribute('aria-pressed','false')
        assert page.evaluate('!world.orientationBlocked && world.running')
        c.close()
    for unsupported in ["Object.defineProperty(document,'fullscreenEnabled',{value:false});", "Element.prototype.requestFullscreen=undefined;"]:
        c = context(viewport={'width':844,'height':390})
        c.add_init_script(unsupported)
        page = c.new_page(); page.goto('http://app-lab.test/laserbreak/')
        expect(page.locator('#fullscreen')).to_be_hidden()
        assert page.evaluate('world.running && world.ready()')
        c.close()
    assert not errors, errors
    browser.close()
    print('PASS: desktop/mobile real fullscreen entry/exit, labels/state, resize, gesture discard, orientation lock success/rejection/late completion cleanup, portrait guard, denied requests, missing API')
