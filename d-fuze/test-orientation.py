"""Android landscape regressions. Chromium emulation, not a physical-device test."""
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium')
    errors, scripts = [], []

    def serve(route):
        url = urlsplit(route.request.url)
        path = url.path.removeprefix('/small-apps')
        file = ROOT / path.lstrip('/')
        if file.is_dir():
            file /= 'index.html'
        assert file.is_file(), url.path
        if file.name == 'game.js':
            scripts.append(parse_qs(url.query))
        route.fulfill(path=str(file), content_type={
            '.html': 'text/html', '.js': 'text/javascript',
            '.css': 'text/css', '.svg': 'image/svg+xml',
        }.get(file.suffix, 'text/plain'))

    def context(**kwargs):
        ctx = browser.new_context(**kwargs)
        ctx.route('http://app-lab.test/**', serve)
        ctx.on('weberror', lambda e: errors.append(str(e)))
        return ctx

    mobile = context(is_mobile=True, has_touch=True, device_scale_factor=2.625,
                     viewport={'width': 412, 'height': 915})
    page = mobile.new_page()
    snapshot = '[game.level,game.remaining,game.ammo,game.lives,game.health,game.angle]'
    for prefix in ['/', '/small-apps/']:
        page.goto('http://app-lab.test' + prefix + 'd-fuze/')
        page.get_by_role('button', name='PLAY', exact=True).tap()
        for width, height in [(915, 412), (1040, 448), (1100, 520), (1280, 540)]:
            page.set_viewport_size({'width': width, 'height': height})
            expect(page.locator('#orientation-overlay')).to_be_visible()
            assert page.evaluate('game.state') == 'PAUSED', (width, height)
            frozen = page.evaluate(snapshot)
            assert page.evaluate('audio.voices.size') == 0
            assert page.evaluate('Object.values(input.held).some(Boolean)') is False
            page.keyboard.press('Escape')
            page.keyboard.press('Space')
            page.wait_for_timeout(300)
            assert page.evaluate(snapshot) == frozen
            page.set_viewport_size({'width': 412, 'height': 915})
            expect(page.locator('#orientation-overlay')).to_be_hidden()
            assert page.evaluate('game.state') == 'PAUSED'
            page.wait_for_timeout(100)
            assert page.evaluate(snapshot) == frozen
            page.get_by_role('button', name='RESUME', exact=True).last.tap()
            page.wait_for_timeout(100)
            assert page.evaluate('game.remaining') < frozen[1]
            assert page.evaluate('[game.ammo,game.lives,game.health]') == frozen[2:5]
        page.keyboard.press('Escape')
        # A sufficiently tall touch tablet stays unrestricted, even if very wide.
        for width, height in [(960, 600), (1024, 768), (1280, 800)]:
            page.set_viewport_size({'width': width, 'height': height})
            expect(page.locator('#orientation-overlay')).to_be_hidden()
            assert page.evaluate('needsPortrait()') is False

    # Some touch environments expose fine-pointer media queries (e.g. a mouse).
    fallback = context(is_mobile=True, has_touch=True,
                       viewport={'width': 1100, 'height': 520})
    fallback.add_init_script('''const realMatchMedia=window.matchMedia.bind(window);
      window.matchMedia=(q)=>q==='(any-pointer: coarse)'
        ? {matches:false,addEventListener(){}} : realMatchMedia(q);''')
    fine = fallback.new_page()
    fine.goto('http://app-lab.test/small-apps/d-fuze/')
    assert fine.evaluate('navigator.maxTouchPoints') > 0
    expect(fine.locator('#orientation-overlay')).to_be_visible()
    assert fine.evaluate('game.state') == 'MAIN_MENU'

    # Model browser chrome reducing the visual viewport without a layout resize.
    visual = context(is_mobile=True, has_touch=True,
                     viewport={'width': 1100, 'height': 700})
    visual.add_init_script('''const view=new EventTarget();
      Object.assign(view,{width:1100,height:700,scale:1});
      Object.defineProperty(window,'visualViewport',{value:view});''')
    chrome = visual.new_page()
    chrome.goto('http://app-lab.test/small-apps/d-fuze/')
    chrome.get_by_role('button', name='PLAY', exact=True).tap()
    chrome.evaluate("visualViewport.height=380;visualViewport.dispatchEvent(new Event('resize'))")
    assert chrome.evaluate('game.state') == 'PAUSED'
    expect(chrome.locator('#orientation-overlay')).to_be_visible()
    chrome.evaluate("visualViewport.height=700;visualViewport.dispatchEvent(new Event('resize'))")
    expect(chrome.locator('#orientation-overlay')).to_be_hidden()
    assert chrome.evaluate('game.state') == 'PAUSED'
    # Screen-orientation events must also recheck immediately, without waiting for resize.
    chrome.evaluate("visualViewport.height=400;screen.orientation.dispatchEvent(new Event('change'))")
    expect(chrome.locator('#orientation-overlay')).to_be_visible()
    chrome.evaluate("visualViewport.height=700;window.dispatchEvent(new Event('orientationchange'))")
    expect(chrome.locator('#orientation-overlay')).to_be_hidden()
    # Pinching a roomy tablet does not make it a cramped phone.
    assert chrome.evaluate('''visualViewport.width=550;visualViewport.height=350;
      visualViewport.scale=2;needsPortrait()''') is False

    desktop = context(viewport={'width': 1100, 'height': 448})
    mouse = desktop.new_page()
    mouse.goto('http://app-lab.test/small-apps/d-fuze/')
    expect(mouse.locator('#orientation-overlay')).to_be_hidden()
    mouse.get_by_role('button', name='PLAY', exact=True).click()
    mouse.keyboard.down('ArrowRight')
    angle = mouse.evaluate('game.angle')
    mouse.wait_for_timeout(100)
    mouse.keyboard.up('ArrowRight')
    assert mouse.evaluate('game.angle') > angle
    assert scripts and all(s.get('v') == ['20261109-landscape2'] for s in scripts)
    assert not errors, errors
    print('PASS: both hosting roots; 915/1040/1100/1280px phone landscape; '
          'pause/resources/audio/input/manual resume; coarse-pointer fallback; '
          'visual viewport and orientation events; pinch zoom; tablets/desktop; versioned script')
    browser.close()
