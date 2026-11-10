"""Run from repository root: python synth-lab/test-browser.py (Playwright + Chromium)."""
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
PROBE = """(() => {
 window.audioProbe = {contexts: [], oscillators: [], gains: [], analysers: []};
 const Native = window.AudioContext;
 window.AudioContext = class extends Native {
  constructor(...args) { super(...args); audioProbe.contexts.push(this); }
  createOscillator() {
   const node = super.createOscillator(), record = {node, stopped:false, ended:false};
   const stop = node.stop.bind(node);
   node.stop = (...args) => { record.stopped=true; return stop(...args); };
   node.addEventListener('ended', () => record.ended=true);
   audioProbe.oscillators.push(record); return node;
  }
  createGain() { const n=super.createGain(); audioProbe.gains.push(n); return n; }
  createAnalyser() { const n=super.createAnalyser(); audioProbe.analysers.push(n); return n; }
 };
})()"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
                                args=['--autoplay-policy=document-user-activation-required'])
    errors, missing = [], []
    def serve(route):
        path = unquote(urlsplit(route.request.url).path)
        if path.startswith('/small-apps/'): path = path[len('/small-apps'):]
        file = (ROOT / path.lstrip('/')).resolve()
        if not file.is_relative_to(ROOT): return route.fulfill(status=403)
        if file.is_dir(): file /= 'index.html'
        if not file.is_file():
            missing.append(path); return route.fulfill(status=404)
        mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml'}
        route.fulfill(path=str(file), content_type=mime.get(file.suffix, 'text/plain'))
    def context(**options):
        ctx = browser.new_context(**options, reduced_motion='reduce')
        ctx.route('https://app-lab.test/**', serve)
        ctx.add_init_script(PROBE)
        ctx.on('weberror', lambda e: errors.append(str(e)))
        return ctx
    def live(page): return page.evaluate('audioProbe.oscillators.filter(o=>!o.stopped).length')
    def point(page, midi, fraction=.5):
        key = page.locator(f'.key[data-midi="{midi}"]')
        box = key.bounding_box()
        # Use lower part of white keys to avoid black overlays.
        return {'x': box['x'] + box['width'] * fraction, 'y': box['y'] + box['height'] * .85}
    def hold(page, midi=69):
        page.mouse.move(**point(page, midi)); page.mouse.down()
        page.wait_for_function('audioProbe.oscillators.some(o=>!o.stopped)')
    def release(page):
        page.mouse.up()
        expect(page.locator('.pressed')).to_have_count(0)
        assert live(page) == 0
        page.wait_for_function('audioProbe.oscillators.every(o=>o.ended)')

    ctx = context(viewport={'width':1280,'height':900})
    page = ctx.new_page()
    for prefix in ('/', '/small-apps/'):
        page.goto('https://app-lab.test' + prefix)
        page.get_by_role('link', name='Launch Synth Lab').click()
        expect(page).to_have_url('https://app-lab.test' + prefix + 'synth-lab/')
        expect(page.locator('.key')).to_have_count(13)
        assert page.evaluate('audioProbe.contexts.length') == 0
        hold(page)
        assert abs(page.evaluate('audioProbe.oscillators.at(-1).node.frequency.value') - 440) < .001
        release(page)
        page.get_by_role('link', name='← App Lab').click()
        expect(page).to_have_url('https://app-lab.test' + prefix)
    page.goto('https://app-lab.test/small-apps/synth-lab/')
    page.locator('#next').click()
    expect(page.locator('#lesson-title')).to_have_text('Play your first note')
    expect(page.locator('#next')).to_be_disabled()
    hold(page,60)
    expect(page.locator('#next')).to_be_enabled()
    assert abs(page.evaluate('audioProbe.oscillators.at(-1).node.frequency.value') - 261.625565) < .001
    release(page)
    page.locator('#next').click()
    expect(page.locator('#lesson-title')).to_have_text('Change the waveform')
    for wave in ('sine','triangle','sawtooth','square'):
        page.locator(f'[data-wave={wave}]').click()
        hold(page)
        assert page.evaluate('audioProbe.oscillators.at(-1).node.type') == wave
        release(page)
    # Actual analyzer samples, spectral peak and live waveform switching.
    page.locator('[data-wave=sine]').click(); hold(page)
    page.wait_for_function('''() => {
      const a=audioProbe.analysers[0], data=new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(data); return data.some(v=>Math.abs(v)>.005);
    }''')
    def peak(page):
        return page.evaluate('''() => { const a=audioProbe.analysers[0], d=new Uint8Array(a.frequencyBinCount);
        a.getByteFrequencyData(d); let i=d.indexOf(Math.max(...d));
        return i * audioProbe.contexts[0].sampleRate / a.fftSize; }''')
    page.wait_for_timeout(160)
    assert abs(peak(page) - 440) < 15
    # Set volume while held and verify the real AudioParam.
    page.locator('#volume').fill('30')
    page.wait_for_function('Math.abs(audioProbe.gains[0].gain.value-.3)<.002')
    page.locator('#tuning').fill('432')
    page.wait_for_function('Math.abs(audioProbe.oscillators.at(-1).node.frequency.value-432)<.01')
    page.locator('[data-wave=sawtooth]').focus(); page.keyboard.press('Enter')
    assert page.evaluate('audioProbe.oscillators.at(-1).node.type') == 'sawtooth'
    page.wait_for_function('''() => {
     const a=audioProbe.analysers[0],d=new Uint8Array(a.frequencyBinCount);a.getByteFrequencyData(d);
     const bin=Math.round(864/audioProbe.contexts[0].sampleRate*a.fftSize);
     return Math.max(d[bin-1],d[bin],d[bin+1])>100;
    }''')
    # Mode controls must preserve active sound and settings.
    page.locator('#free').focus(); page.keyboard.press('Enter')
    assert live(page)==1
    expect(page.locator('#lesson')).to_be_hidden()
    page.locator('#guided').focus(); page.keyboard.press('Enter')
    assert live(page)==1
    expect(page.locator('[data-wave=sawtooth]')).to_have_attribute('aria-pressed','true')
    expect(page.locator('#tuning')).to_have_value('432')
    release(page)
    page.locator('#next').click(); expect(page.locator('#scope-panel')).to_have_class('display tutorial-highlight')
    page.locator('#next').click(); expect(page.locator('#lesson-title')).to_have_text('See the harmonics')
    page.locator('#next').click(); expect(page.locator('#lesson-title')).to_have_text('Keep exploring.')
    page.locator('#lesson-restart').click(); expect(page.locator('#lesson-title')).to_have_text('What makes a sound?')
    page.locator('#skip').click(); expect(page.locator('#next')).to_be_disabled()
    page.locator('#skip').click(); expect(page.locator('#lesson-title')).to_have_text('Change the waveform')
    page.locator('#back').click(); expect(page.locator('[data-wave=sine]')).to_have_attribute('aria-pressed','true')
    page.locator('#free').click()
    page.locator('[data-help=pitch]').click(); expect(page.locator('#help-copy')).to_contain_text('440 Hz')
    page.keyboard.press('Escape'); expect(page.locator('#help')).to_be_hidden()
    # Keyboard accessibility and polyphony from separate input sources.
    page.locator('.key[data-midi="69"]').focus(); page.keyboard.down('Space')
    page.wait_for_function('audioProbe.oscillators.filter(o=>!o.stopped).length===1')
    page.keyboard.down('k'); page.wait_for_function('audioProbe.oscillators.filter(o=>!o.stopped).length===2')
    page.keyboard.up('Space'); assert live(page)==1
    page.keyboard.up('k'); assert live(page)==0
    # A mouse held outside the key still releases through pointer capture.
    hold(page); page.mouse.move(0,0); release(page)
    for event in ('blur','pagehide'):
        hold(page); page.evaluate(f"window.dispatchEvent(new Event('{event}'))"); assert live(page)==0; page.mouse.up()
    hold(page)
    page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
    assert live(page)==0; page.mouse.up()
    page.evaluate("delete document.hidden")
    # Delayed unlock must not create a voice after a tap is released/canceled.
    page.evaluate('''async () => {
      const c=audioProbe.contexts[0]; window.originalResume=c.resume.bind(c);
      c.resume=()=>new Promise(resolve=>setTimeout(()=>originalResume().then(resolve),100)); await c.suspend();
    }''')
    page.locator('.key[data-midi="60"]').click(); page.wait_for_timeout(200); assert live(page)==0
    page.evaluate('audioProbe.contexts[0].resume=originalResume')
    # Render/resizing and responsive lesson usability, including short phones.
    for width,height in ((320,568),(375,812),(600,800),(768,900),(1440,900),(844,390)):
        page.set_viewport_size({'width':width,'height':height})
        page.locator('#restart').click()
        for step in range(5):
            panel=page.locator('#lesson')
            panel.scroll_into_view_if_needed()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (width,step)
            # Navigation is visible above the keyboard and can be clicked.
            panel.evaluate('(el)=>el.scrollIntoView({block:"end"})')
            nav=page.locator('#skip').bounding_box(); dock=page.locator('#keyboard').bounding_box()
            assert nav['y']>=0 and nav['y']+nav['height']<=dock['y'], (width,height,step,nav,dock)
            for key in page.locator('.key').all():
                assert key.evaluate('el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height*.85)?.closest(".key")===el}')
            for canvas in page.locator('canvas').all():
                assert canvas.evaluate('el=>el.width>0 && Math.abs(el.width-el.clientWidth*Math.min(devicePixelRatio,2))<2')
            page.locator('#skip').click()
        page.locator('#free').click()
    page.set_viewport_size({'width':1280,'height':1000})
    page.locator('#scope-panel').scroll_into_view_if_needed(); hold(page,60)
    page.wait_for_timeout(200)
    page.screenshot(path='/tmp/synth-lab-desktop.png'); release(page)

    mobile=context(viewport={'width':375,'height':812},is_mobile=True,has_touch=True,device_scale_factor=2)
    touch=mobile.new_page();touch.goto('https://app-lab.test/small-apps/synth-lab/')
    client=mobile.new_cdp_session(touch)
    def send(kind,points): client.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
    a=dict(point(touch,60),id=1); b=dict(point(touch,67),id=2)
    start_scroll=touch.evaluate('scrollY')
    send('touchStart',[a,b]);touch.wait_for_function('audioProbe.oscillators.filter(o=>!o.stopped).length===2')
    expect(touch.locator('.pressed')).to_have_count(2)
    a['y']-=35;send('touchMove',[a,b]); assert touch.evaluate('scrollY')==start_scroll
    send('touchEnd',[a]);assert live(touch)==1;expect(touch.locator('.pressed')).to_have_count(1)
    send('touchCancel',[]);assert live(touch)==0;expect(touch.locator('.pressed')).to_have_count(0)
    # Same pitch still has independent source IDs.
    a=dict(point(touch,60,.2),id=1);b=dict(point(touch,60,.8),id=2)
    send('touchStart',[a,b]);touch.wait_for_function('audioProbe.oscillators.filter(o=>!o.stopped).length===2')
    expect(touch.locator('.pressed')).to_have_count(1)
    send('touchEnd',[a]);assert live(touch)==1
    send('touchEnd',[]);assert live(touch)==0
    touch.locator('#free').click();touch.locator('#scope-panel').scroll_into_view_if_needed()
    send('touchStart',[dict(point(touch,60),id=1)])
    touch.wait_for_function('audioProbe.oscillators.some(o=>!o.stopped)')
    touch.screenshot(path='/tmp/synth-lab-mobile.png');send('touchEnd',[])
    # Explicitly handle unsupported/failed audio without a JavaScript error.
    bad=context();bad.add_init_script("window.AudioContext=class {constructor(){throw new Error('Unavailable')}}")
    failure=bad.new_page();failure.goto('https://app-lab.test/small-apps/synth-lab/')
    failure.locator('#enable').click();expect(failure.locator('#audio-status')).to_contain_text('Could not enable audio')
    assert not errors, errors
    assert not missing, missing
    print('PASS: gallery and both deployment roots; real audio frequency, four waveforms, analyzer samples/harmonics, live tuning/volume; independent releases; tutorial gating/back/skip/repeat/completion; mode preservation; help/focus; keyboard; blur/pagehide/visibility; delayed unlock; six layouts and canvas resizing; mobile multitouch/shared pitch/cancellation/no scrolling; audio failure; assets/errors')
    browser.close()
