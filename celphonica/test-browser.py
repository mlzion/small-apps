"""Run from repository root: python celphonica/test-browser.py."""
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
# Observe actual Web Audio nodes without replacing their implementation.
PROBE = """(() => {
  window.audioProbe = {contexts: [], oscillators: [], gains: [], filters: []};
  const Native = window.AudioContext;
  window.AudioContext = class extends Native {
    constructor(options) { super(options); audioProbe.contexts.push(this); }
    createOscillator() {
      const node = super.createOscillator();
      const record = {node, stopped: false, ended: false};
      const stop = node.stop.bind(node);
      node.stop = (...args) => { record.stopped = true; return stop(...args); };
      node.addEventListener('ended', () => record.ended = true);
      audioProbe.oscillators.push(record); return node;
    }
    createGain() { const n = super.createGain(); audioProbe.gains.push(n); return n; }
    createBiquadFilter() { const n = super.createBiquadFilter(); audioProbe.filters.push(n); return n; }
  };
})()"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
                                args=['--autoplay-policy=document-user-activation-required'])
    errors, missing = [], []

    def serve(route):
        path = urlsplit(route.request.url).path
        if path.startswith('/small-apps/'):
            path = path[len('/small-apps'):]
        file = ROOT / path.lstrip('/')
        if file.is_dir():
            file /= 'index.html'
        if not file.is_file():
            missing.append(path)
            route.fulfill(status=404)
            return
        mime = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml'}
        route.fulfill(path=str(file), content_type=mime.get(file.suffix, 'text/plain'))

    def context(**options):
        ctx = browser.new_context(**options)
        ctx.route('https://app-lab.test/**', serve)
        ctx.add_init_script(PROBE)
        ctx.on('weberror', lambda error: errors.append(str(error)))
        return ctx

    def point(page, selector, index=0, x=.5, y=.5):
        b = page.locator(selector).nth(index).bounding_box()
        return {'x': b['x'] + b['width'] * x, 'y': b['y'] + b['height'] * y}

    def live(page):
        return page.evaluate('audioProbe.oscillators.filter(o => !o.stopped).length')

    def mouse_down(page, index=0):
        pos = point(page, '.note', index)
        page.mouse.move(**pos)
        page.mouse.down()
        page.wait_for_function('audioProbe.contexts[0]?.state === "running"')
        expect(page.locator('.pressed')).to_have_count(1)

    ctx = context(viewport={'width': 1280, 'height': 800})
    page = ctx.new_page()
    for prefix in ('/', '/small-apps/'):
        page.goto('https://app-lab.test' + prefix)
        page.get_by_role('link', name='Launch Celphonica').click()
        expect(page).to_have_url('https://app-lab.test' + prefix + 'celphonica/')
        expect(page.locator('.note')).to_have_count(21)
        assert page.evaluate('audioProbe.contexts.length') == 0
        mouse_down(page)
        page.wait_for_function('audioProbe.oscillators.length === 1')
        assert abs(page.evaluate('audioProbe.oscillators[0].node.frequency.value') - 130.8128) < .01
        page.mouse.move(**point(page, '.note', 1))
        expect(page.locator('#notes')).to_have_text('Key: C maj | Note: D3')
        assert live(page) == 1
        page.mouse.move(**point(page, 'header'))
        assert live(page) == 0
        page.mouse.move(**point(page, '.note', 2))
        assert live(page) == 1
        page.mouse.up()
        expect(page.locator('.pressed')).to_have_count(0)
        page.wait_for_function('audioProbe.oscillators.every(o => o.ended)')

    page.click('#settings-open')
    for scale, count in [('chromatic', 36), ('minor', 21), ('pentatonic', 15), ('major', 21)]:
        page.select_option('#scale', scale)
        expect(page.locator('.note')).to_have_count(count)
    page.select_option('#root', '2')
    expect(page.locator('.note').first).to_have_text('D3')
    expect(page.locator('.note').nth(2)).to_have_text('F♯3')
    page.click('#octave-up')
    expect(page.locator('.note').first).to_have_text('D4')
    page.click('#octave-down')
    expect(page.locator('.note').first).to_have_text('D3')
    for _ in range(5):
        if page.locator('#octave-down').is_enabled(): page.click('#octave-down')
    expect(page.locator('#octave-down')).to_be_disabled()
    for _ in range(6):
        if page.locator('#octave-up').is_enabled(): page.click('#octave-up')
    expect(page.locator('#octave-up')).to_be_disabled()
    for _ in range(3): page.click('#octave-down')
    page.click('#settings-close')
    for waveform in ('sine', 'triangle', 'sawtooth'):
        page.click('#settings-open')
        page.select_option('#waveform', waveform)
        page.click('#settings-close')
        mouse_down(page)
        assert page.evaluate('audioProbe.oscillators.at(-1).node.type') == waveform
        page.mouse.up()
    page.click('#settings-open')
    page.locator('#volume').fill('20')
    page.click('#settings-close')
    mouse_down(page)
    page.wait_for_function('Math.abs(audioProbe.gains[0].gain.value - .2) < .01')
    page.evaluate("window.dispatchEvent(new Event('blur'))")
    assert live(page) == 0
    page.mouse.up()
    mouse_down(page)
    page.locator('#settings-open').focus()
    page.keyboard.press('Enter')  # A mouse cannot click a second control while held.
    assert live(page) == 0
    page.select_option('#scale', 'minor')
    assert live(page) == 0
    page.mouse.up()
    page.click('#settings-close')
    # Resume may resolve after a short tap: it must not resurrect that voice.
    page.evaluate('''() => {
      const c = audioProbe.contexts[0];
      window.originalResume = c.resume.bind(c);
      c.resume = () => new Promise(resolve => setTimeout(() => originalResume().then(resolve), 100));
      return c.suspend();
    }''')
    page.locator('.note').first.click()
    page.wait_for_timeout(180)
    assert live(page) == 0
    page.evaluate('audioProbe.contexts[0].resume = originalResume')
    page.screenshot(path='/tmp/celphonica-desktop.png')

    mobile = context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True, device_scale_factor=2)
    touch = mobile.new_page()
    touch.goto('https://app-lab.test/small-apps/celphonica/')
    client = mobile.new_cdp_session(touch)

    def send(kind, points):
        client.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': points})

    a = dict(point(touch, '.note', 0), id=1)
    b = dict(point(touch, '.note', 2), id=2)
    send('touchStart', [a, b])
    expect(touch.locator('.pressed')).to_have_count(2)
    touch.wait_for_function('audioProbe.oscillators.filter(o => !o.stopped).length === 2')
    a = dict(point(touch, '.note', 1), id=1)
    send('touchMove', [a, b])
    expect(touch.locator('#notes')).to_have_text('Key: C maj | Note: D3·E3')
    assert live(touch) == 2
    # Two independent voices sharing one highlighted note; one release keeps it held.
    a = dict(point(touch, '.note', 2, x=.25), id=1)
    send('touchMove', [a, b])
    expect(touch.locator('.pressed')).to_have_count(1)
    assert live(touch) == 2
    send('touchEnd', [a])
    assert live(touch) == 1
    expect(touch.locator('.pressed')).to_have_count(1)
    pad = dict(point(touch, '#xy-pad', x=.2, y=.25), id=3)
    send('touchStart', [b, pad])
    expect(touch.locator('#expression-value')).to_have_text('Bright 20% · Level 75%')
    assert live(touch) == 1
    pad = dict(point(touch, '#xy-pad', x=.9, y=.5), id=3)
    send('touchMove', [b, pad])
    expect(touch.locator('#expression-value')).to_have_text('Bright 90% · Level 50%')
    touch.wait_for_timeout(100)
    cutoff = touch.evaluate('audioProbe.filters[0].frequency.value')
    assert 10000 < cutoff < 12000
    send('touchCancel', [])
    expect(touch.locator('.pressed')).to_have_count(0)
    assert live(touch) == 0
    touch.click('#settings-open')
    touch.select_option('#expression-mode', 'slider')
    touch.click('#settings-close')
    expect(touch.locator('#xy-pad')).to_be_hidden()
    expect(touch.locator('#volume-slider')).to_be_visible()
    touch.locator('#volume-slider').fill('35')
    expect(touch.locator('#expression-value')).to_have_text('Bright 90% · Level 35%')
    touch.screenshot(path='/tmp/celphonica-landscape.png')
    # Landscape performance; portrait intentionally shows only the rotate message.
    for width, height in [(1440, 900), (844, 390), (740, 360), (667, 375), (375, 812), (320, 568)]:
        touch.set_viewport_size({'width': width, 'height': height})
        if height >= width:
            expect(touch.locator('#rotate-message')).to_be_visible()
            expect(touch.locator('#keyboard')).to_be_hidden()
            continue
        for scale in ('major', 'minor', 'chromatic', 'pentatonic'):
            touch.click('#settings-open')
            touch.select_option('#scale', scale)
            touch.click('#settings-close')
            assert touch.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert touch.evaluate('document.documentElement.scrollHeight <= innerHeight')
            assert touch.evaluate('scrollX === 0 && scrollY === 0')
            for button in touch.locator('.note').all():
                box = button.bounding_box()
                assert box['width'] > 15 and box['height'] > 15, (width, height, box)
                assert box['y'] >= 0 and box['y'] + box['height'] <= height
                # Every note can actually be hit, without another surface covering it.
                assert button.evaluate('(el) => { const r=el.getBoundingClientRect(); return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest(".note") === el; }')
    touch.set_viewport_size({'width': 375, 'height': 812})
    touch.screenshot(path='/tmp/celphonica-portrait.png')
    assert not missing, missing
    assert not errors, errors
    print('PASS: both deployment roots; lazy audio unlock; real oscillator pitch/waveforms/release; mouse slide/outside/re-entry; delayed unlock; root/scales/octaves/bounds; volume; blur/settings cleanup; CDP multitouch/shared pitch/slide/cancel; concurrent XY expression; vertical slider; all scales across six viewports; assets and browser errors')
    browser.close()
