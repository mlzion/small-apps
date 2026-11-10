"""Simulated sensors + real browser touch/audio. Run: python celphonica/test-motion.py"""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
                                args=['--autoplay-policy=document-user-activation-required'])
    errors, missing = [], []

    def serve(route):
        path = urlsplit(route.request.url).path
        if path.startswith('/small-apps/'): path = path[len('/small-apps'):]
        file = ROOT / path.lstrip('/')
        if file.is_dir(): file /= 'index.html'
        if not file.is_file():
            missing.append(path); route.fulfill(status=404); return
        mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'}
        route.fulfill(path=str(file), content_type=mime.get(file.suffix, 'text/plain'))

    def context(permissions=None, secure=True, **kwargs):
        ctx = browser.new_context(**kwargs)
        ctx.route('https://app-lab.test/**', serve)
        ctx.on('weberror', lambda error: errors.append(str(error)))
        config = permissions if permissions is not None else {'orientation': 'granted', 'motion': 'granted'}
        ctx.add_init_script('window.sensorConfig = ' + json.dumps(config) + ';' + """
          window.permissionCalls = [];
          window.testAngle = 0;
          Object.defineProperty(screen.orientation, 'angle', {get: () => testAngle});
          for (const [name, key] of [['DeviceOrientationEvent', 'orientation'], ['DeviceMotionEvent', 'motion']]) {
            if (!(key in sensorConfig)) { window[name] = undefined; continue; }
            window[name] = class extends Event {};
            if (sensorConfig[key] !== 'no-prompt') window[name].requestPermission = () => {
              permissionCalls.push(key);
              return sensorConfig[key] === 'throws' ? Promise.reject(new Error('blocked')) : Promise.resolve(sensorConfig[key]);
            };
          }
          window.audioProbe = {contexts: [], voices: [], gains: [], filters: []};
          const Native = window.AudioContext;
          window.AudioContext = class extends Native {
            constructor(options) { super(options); audioProbe.contexts.push(this); }
            createOscillator() {
              const node = super.createOscillator(), record = {node, stopped: false};
              const stop = node.stop.bind(node);
              node.stop = (...args) => { record.stopped = true; return stop(...args); };
              audioProbe.voices.push(record); return node;
            }
            createGain() { const node = super.createGain(); audioProbe.gains.push(node); return node; }
            createBiquadFilter() { const node = super.createBiquadFilter(); audioProbe.filters.push(node); return node; }
          };
        """ + ('' if secure else "Object.defineProperty(window, 'isSecureContext', {value: false});"))
        return ctx

    def sample(page, beta=0, gamma=0, alpha=0):
        page.evaluate('(v) => window.dispatchEvent(Object.assign(new Event("deviceorientation"), v))',
                      {'alpha': alpha, 'beta': beta, 'gamma': gamma})

    def gravity(page, x=0, y=0, z=9.8):
        page.evaluate('(g) => window.dispatchEvent(Object.assign(new Event("devicemotion"), {accelerationIncludingGravity:g}))',
                      {'x': x, 'y': y, 'z': z})

    def xy(page):
        page.wait_for_timeout(35)  # allow the batched visual frame, not audio startup
        return page.locator('#motion-level').evaluate('(el) => [Number(el.dataset.x), Number(el.dataset.y)]')

    def live(page):
        return page.evaluate('audioProbe.voices.filter(v => !v.stopped).length')

    ctx = context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto('https://app-lab.test/small-apps/celphonica/')
    assert page.evaluate('permissionCalls') == []
    sample(page, gamma=20)
    assert xy(page) == [0, 0]
    page.click('#motion-enable')
    expect(page.locator('#motion-enable')).to_have_attribute('aria-pressed', 'true')
    assert page.evaluate('permissionCalls') == ['orientation', 'motion']
    assert live(page) == 0
    # Invalid values must never grant readiness or create NaNs.
    sample(page, beta=None, gamma=None)
    expect(page.locator('#motion-level')).to_be_disabled()
    sample(page)
    expect(page.locator('#motion-level')).to_be_enabled()
    sample(page, gamma=12)
    x, y = xy(page)
    assert 0 < x < .48 and abs(y) < .001, (x, y)
    page.wait_for_timeout(180); sample(page, gamma=12)
    assert xy(page)[0] > .46
    assert page.evaluate('''() => {
      const b=document.getElementById('motion-bubble').getBoundingClientRect();
      const d=document.getElementById('motion-level').getBoundingClientRect();
      return b.x+b.width/2 > d.x+d.width/2+8;
    }'''), 'Sensor movement must move rendered bubble pixels, not only model state'
    page.click('#motion-level')
    assert xy(page) == [0, 0]
    page.wait_for_timeout(100); sample(page, gamma=12)
    assert xy(page) == [0, 0]

    # A fresh press captures raw current orientation; subsequent movement is visual only.
    note = page.locator('.note').first.bounding_box()
    pad = page.locator('#xy-pad').bounding_box()
    client = ctx.new_cdp_session(page)
    def touch(kind, points):
        client.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': points})
    finger = {'x': note['x'] + note['width'] / 2, 'y': note['y'] + note['height'] / 2, 'id': 1}
    touch('touchStart', [finger])
    page.wait_for_function('audioProbe.voices.some(v => !v.stopped)')
    assert xy(page) == [0, 0]
    expression = page.locator('#expression-value').inner_text()
    audio_before = page.evaluate('({frequency:audioProbe.voices.at(-1).node.frequency.value, cutoff:audioProbe.filters[0].frequency.value, gain:audioProbe.gains[0].gain.value})')
    sample(page, beta=9, gamma=22)
    assert xy(page)[0] > 0 and xy(page)[1] > 0
    assert live(page) == 1
    assert page.locator('#expression-value').inner_text() == expression
    audio_after = page.evaluate('({frequency:audioProbe.voices.at(-1).node.frequency.value, cutoff:audioProbe.filters[0].frequency.value, gain:audioProbe.gains[0].gain.value})')
    assert audio_before == audio_after, (audio_before, audio_after)
    pad_finger = {'x': pad['x'] + pad['width'] * .3, 'y': pad['y'] + pad['height'] * .4, 'id': 2}
    touch('touchStart', [finger, pad_finger])
    expect(page.locator('#expression-value')).to_have_text('Bright 30% · Level 60%')
    sample(page, beta=15, gamma=30)
    assert live(page) == 1
    # A second finger on a new note recenters, without releasing the first.
    other = page.locator('.note').nth(2).bounding_box()
    chord = {'x': other['x'] + other['width'] / 2, 'y': other['y'] + other['height'] / 2, 'id': 3}
    touch('touchStart', [finger, pad_finger, chord])
    assert xy(page) == [0, 0]
    assert live(page) == 2
    sample(page, beta=25, gamma=40)
    moved = xy(page)
    # Sliding changes pitch without erasing the last physical press reference.
    finger['x'] += note['width'] + 6
    touch('touchMove', [finger, pad_finger, chord])
    assert xy(page) == moved
    touch('touchEnd', [])
    expect(page.locator('.pressed')).to_have_count(0)
    assert live(page) == 0
    sample(page, beta=30, gamma=50)
    assert live(page) == 0
    page.click('#settings-open')
    page.select_option('#expression-mode', 'slider')
    page.locator('#motion-sensitivity').fill('4')
    expect(page.locator('#motion-sensitivity-value')).to_have_text('4×')
    page.click('#settings-close')
    page.locator('#volume-slider').fill('55')
    expect(page.locator('#expression-value')).to_have_text('Bright 30% · Level 55%')
    page.wait_for_timeout(180); sample(page, beta=80, gamma=80)
    x, y = xy(page)
    assert x*x + y*y <= 1.0002
    # Complete bubble, not just its center, must fit the circular surface.
    bounds = page.evaluate('''() => {
      const b=document.getElementById('motion-bubble').getBoundingClientRect();
      const d=document.getElementById('motion-level').getBoundingClientRect();
      return {distance:Math.hypot(b.x+b.width/2-d.x-d.width/2,b.y+b.height/2-d.y-d.height/2),radius:b.width/2,outer:d.width/2};
    }''')
    assert bounds['distance'] + bounds['radius'] <= bounds['outer'] - 1, bounds
    # Rotation and backgrounding invalidate the old sensor coordinate frame.
    page.evaluate('testAngle=90; screen.orientation.dispatchEvent(new Event("change"))')
    assert xy(page) == [0, 0]
    sample(page)
    page.wait_for_timeout(100); sample(page, beta=10)
    assert xy(page)[0] > .3 and abs(xy(page)[1]) < .001
    page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"))')
    sample(page, gamma=80)
    assert xy(page) == [0, 0]
    page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"))')
    sample(page, gamma=80)
    assert xy(page) == [0, 0]
    # Stalled streams are visibly reported and resume with a fresh reference.
    page.wait_for_timeout(2100)
    expect(page.locator('#motion-status')).to_contain_text('No sensor readings')
    expect(page.locator('#motion-level')).to_be_disabled()
    sample(page, gamma=5)
    assert xy(page) == [0, 0]
    page.click('#motion-enable')
    expect(page.locator('#motion-enable')).to_have_attribute('aria-pressed', 'false')
    sample(page, gamma=80)
    assert xy(page) == [0, 0]

    # Math checks use deterministic timestamps, independent of browser/test speed.
    page.evaluate('''async () => {
      const {MotionModel, orientationQuaternion:q, relativeTilt, clampCircle} = await import('./motion-math.js');
      const assert = (ok, label) => { if (!ok) throw Error(label); };
      for (const angle of [0,90,180,270]) {
        const t=relativeTilt(q(0,0,0),q(0,0,10),angle), a=angle*Math.PI/180;
        assert(Math.abs(t.x-10*Math.cos(a))<1e-6 && Math.abs(t.y+10*Math.sin(a))<1e-6,'screen axes');
        const v=relativeTilt(q(0,0,0),q(0,10,0),angle);
        assert(Math.abs(v.x-10*Math.sin(a))<1e-6 && Math.abs(v.y-10*Math.cos(a))<1e-6,'independent second axis');
      }
      const wrap=relativeTilt(q(0,179,12),q(0,-179,12),0);
      assert(Math.hypot(wrap.x,wrap.y)<3,'Euler wrap');
      const heading=relativeTilt(q(359,0,0),q(1,0,0),0);
      assert(Math.hypot(heading.x,heading.y)<1e-6,'heading wrap');
      const circle=clampCircle(3,4);
      assert(Math.abs(circle.x-.6)<1e-6 && Math.abs(circle.y-.8)<1e-6,'radial clamp');
      function response(step,sensitivity=1) {
        const m=new MotionModel();m.sensitivity=sensitivity;m.sample(q(0,0,0),0,0);
        for(let t=step;t<=200;t+=step)m.sample(q(0,0,5),t,0);
        return m.x;
      }
      assert(Math.abs(response(10)-response(50))<1e-9,'rate-independent smoothing');
      assert(Math.abs(response(10,2)-2*response(10))<1e-9,'sensitivity');
      const m=new MotionModel();m.sample(q(0,0,0),0,0);
      m.sample(q(0,0,10),16,0);assert(m.x>0&&m.x<.4,'smooth step');
      m.recenter();assert(m.x===0&&m.y===0,'raw recenter');
      m.sample(q(0,0,10),32,0);assert(m.x===0,'neutral stays centered');
      const jitter=new MotionModel();jitter.sample(q(0,0,0),0,0);
      let jitterPeak=0;
      for(let i=1;i<=100;i++) {
        jitter.sample(q(0,0,i%2?1:-1),i*16,0);
        jitterPeak=Math.max(jitterPeak,Math.abs(jitter.x));
      }
      assert(jitterPeak<.02,'alternating jitter attenuated below half raw amplitude');
    }''')

    # Explicit permission denial/rejection, no API, insecure page, and gravity-only support.
    for permissions, secure, message in [({}, True, 'unavailable'), ({'orientation':'granted'}, False, 'HTTPS'),
                                         ({'orientation':'denied','motion':'throws'}, True, 'denied')]:
        fallback = context(permissions, secure=secure)
        test = fallback.new_page(); test.goto('https://app-lab.test/celphonica/')
        if test.locator('#motion-enable').is_enabled(): test.click('#motion-enable')
        expect(test.locator('#motion-status')).to_contain_text(message)
        test.locator('.note').first.click()
        assert live(test) == 0
        assert test.evaluate('audioProbe.voices.length') > 0, 'Unavailable motion must not block notes'
        if message == 'denied':
            test.evaluate("sensorConfig.orientation='granted';sensorConfig.motion='granted'")
            test.click('#motion-enable'); sample(test)
            expect(test.locator('#motion-level')).to_be_enabled()
        fallback.close()
    fallback = context({'orientation':'denied','motion':'no-prompt'})
    test = fallback.new_page(); test.goto('https://app-lab.test/celphonica/')
    test.click('#motion-enable'); gravity(test)
    expect(test.locator('#motion-status')).to_contain_text('Gravity fallback')
    test.wait_for_timeout(100); gravity(test, x=-3)
    assert xy(test)[0] > 0
    sample(test, gamma=-80)  # denied orientation listener must not receive this
    assert xy(test)[0] > 0
    fallback.close()
    # No permission-method Android path; switch from fallback to preferred orientation.
    fallback = context({'orientation':'no-prompt','motion':'no-prompt'})
    test = fallback.new_page(); test.goto('https://app-lab.test/celphonica/')
    test.click('#motion-enable'); gravity(test)
    sample(test, gamma=15)
    expect(test.locator('#motion-status')).to_contain_text('Orientation')
    assert xy(test) == [0, 0]
    gravity(test, x=-9)
    assert xy(test) == [0, 0]
    fallback.close()
    # Notes are landscape-only. Portrait shows a rotate message.
    page.click('#motion-enable'); sample(page)
    for width, height in [(1280,800),(844,390),(844,320),(740,360),(667,375),(375,812),(320,568)]:
        page.set_viewport_size({'width':width,'height':height})
        if height >= width:
            expect(page.locator('#rotate-message')).to_be_visible()
            expect(page.locator('#keyboard')).to_be_hidden()
            continue
        for scale in ['major','minor','pentatonic','chromatic']:
            page.click('#settings-open')
            page.select_option('#scale',scale)
            page.click('#settings-close')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight')
            for element in page.locator('.note, #motion-enable, #motion-level').all():
                assert element.evaluate('''el => {const r=el.getBoundingClientRect();return r.width>15&&r.height>15&&r.y>=0&&r.bottom<=innerHeight&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'''), (width,height,scale)
        if (width,height) == (844,390):
            sample(page); page.click('#motion-level')
            page.wait_for_timeout(60); sample(page,beta=5,gamma=7); xy(page)
            page.screenshot(path=f'/tmp/celphonica-motion-{width}.png')
    assert not missing, missing
    assert not errors, errors
    print('PASS: opt-in/permissions/missing or stale sensors; orientation + gravity fallback; both hosting roots; raw note/manual recenter; quaternion/screen axes/wrap; smoothing/sensitivity/radial bounds; real simultaneous touch notes/XY + visual-only motion; slide/chord/release; slider; rotation/background; all scales and seven viewports')
    browser.close()
