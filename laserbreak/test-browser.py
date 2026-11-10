"""Desktop Chromium + CDP multitouch in mobile landscape; no external requests."""
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'))
    errors, missing = [], []
    def serve(route):
        path = urlsplit(route.request.url).path.removeprefix('/small-apps/').lstrip('/')
        file = ROOT / path
        if file.is_dir(): file /= 'index.html'
        if not file.is_file(): missing.append(path); route.fulfill(status=404); return
        route.fulfill(path=str(file), content_type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}.get(file.suffix, 'text/plain'))
    def context(**kwargs):
        c = browser.new_context(**kwargs); c.route('http://app-lab.test/**', serve)
        c.on('weberror', lambda e: errors.append(str(e))); return c
    desktop = context(viewport={'width':1280,'height':720})
    page = desktop.new_page(); page.goto('http://app-lab.test/small-apps/')
    page.get_by_role('link', name='Launch LaserBreak').click()
    expect(page).to_have_url('http://app-lab.test/small-apps/laserbreak/')
    expect(page.locator('#setup')).to_be_hidden()
    expect(page.locator('#performance')).to_be_hidden()
    expect(page.locator('#pause')).to_be_visible(); expect(page.locator('#session')).to_have_text('Stop')
    # Pausing freezes objects, rotation, spawning, cooldown and effect ages.
    page.locator('#pause').click()
    before = page.evaluate('JSON.stringify([world.objects,world.effects,world.time,world.spawnClock])')
    page.wait_for_timeout(100)
    assert page.evaluate('JSON.stringify([world.objects,world.effects,world.time,world.spawnClock])') == before
    expect(page.locator('#pause')).to_have_text('Resume'); page.locator('#pause').click()
    page.locator('#session').click(); expect(page.locator('#session')).to_have_text('Start')
    assert page.evaluate('!world.running && world.objects.length===0 && world.effects.length===0 && !world.ready()')
    expect(page.locator('#pause')).to_be_disabled()
    page.locator('#session').click(); assert page.evaluate('world.running && world.objects.length===3 && world.ready()')
    page.locator('#setup-toggle').click()
    page.locator('#mode').select_option('release')
    # Existing objects are not modified when properties change.
    page.evaluate('world.paused=true;window.existing=JSON.stringify(world.objects)')
    values = {'cooldown':1.25,'targetSize':44,'targetSpeed':65,'barLength':140,'barSpeed':55,'barRotation':-90,'density':0}
    for key, value in values.items():
        page.locator('#'+key).evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}', value)
        assert page.evaluate('key=>world.settings[key]', key) == value
    assert page.evaluate('JSON.stringify(world.objects)===existing')
    assert page.locator('#barThickness').count() == 0
    page.locator('#debug').check(); assert page.evaluate('world.settings.debug')
    page.locator('#diagnostics').check(); expect(page.locator('#performance')).to_be_visible()
    expect(page.locator('#performance')).to_contain_text('Render')
    page.locator('#clear').click(); assert page.evaluate('world.objects.length') == 0
    page.locator('#reset').click(); assert page.evaluate('JSON.stringify(world.settings)===JSON.stringify(defaults)')
    page.locator('#close-setup').click()
    page.evaluate('world.clear();world.settings.density=0;world.settings.cooldown=0')
    # Desktop input resolves collision effects immediately, with no traveling state.
    page.evaluate('world.objects=[{id:101,type:"target",x:500,y:200,radius:12,speed:0,extent:12,color:"#36fff3"}]')
    box = page.locator('#left-pad').bounding_box()
    y = page.locator('canvas').bounding_box()['y'] + page.locator('canvas').bounding_box()['height'] * 200 / page.evaluate('world.height')
    page.mouse.move(box['x']+20, y); page.mouse.down(); page.keyboard.down('Space')
    assert page.evaluate('world.objects.length') == 0
    assert page.evaluate('world.effects.some(e=>e.type==="explosion")')
    assert page.evaluate('world.effects.find(e=>e.type==="flash").beams.every(b=>b.to.x===500)')
    page.keyboard.up('Space'); page.mouse.up()
    page.evaluate('world.objects=[{id:101,type:"target",x:200,y:160,radius:12,speed:0,extent:12,color:"#36fff3"},{id:102,type:"target",x:650,y:320,radius:12,speed:0,extent:12,color:"#fff04b"},{id:103,type:"bar",x:460,y:210,length:100,thickness:12,angle:.6,speed:0,rotation:1,extent:51}];world.effects=[];world.paused=true;syncSession()')
    page.screenshot(path='/tmp/laserbreak-desktop.png')
    for width, height in [(568,320),(667,375),(844,390),(1024,600),(1366,768)]:
        page.set_viewport_size({'width':width,'height':height})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight')
        left, right, field = [page.locator(sel).bounding_box() for sel in ['#left-pad','#right-pad','canvas']]
        assert field['width'] >= 350 and field['height'] > 200
        assert page.evaluate('Math.abs(canvas.width/1000-canvas.height/world.height)<.005')
        expected = 97 if width <= 600 else 130
        assert abs(left['width']-expected) < 1 and abs(right['width']-expected) < 1
        assert abs(left['height']-field['height']) < 1 and abs(right['height']-field['height']) < 1
        assert left['x']+left['width'] <= field['x']+1 and field['x']+field['width'] <= right['x']+1
        expect(page.locator('#pause')).to_be_in_viewport(); expect(page.locator('#session')).to_be_in_viewport()
    mobile = context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=3)
    mobile.add_init_script('window.lockAttempts=0;if(screen.orientation)screen.orientation.lock=()=>{lockAttempts++;return Promise.reject(new Error("Fullscreen unavailable in test"));};')
    touch = mobile.new_page(); touch.goto('http://app-lab.test/small-apps/laserbreak/')
    touch.evaluate('world.clear();world.settings.density=0;world.settings.cooldown=0;window.fired=[];const fire=world.fire.bind(world);world.fire=(a,b)=>{const ok=fire(a,b);if(ok)fired.push([a,b]);return ok;};void 0')
    client = mobile.new_cdp_session(touch)
    left, right = [touch.locator(sel).bounding_box() for sel in ['#left-pad','#right-pad']]
    a = {'id':1,'x':left['x']+left['width']/2,'y':left['y']+100}
    b = {'id':2,'x':right['x']+right['width']/2,'y':right['y']+160}
    def event(kind, points): client.send('Input.dispatchTouchEvent', {'type':kind,'touchPoints':points})
    event('touchStart', [a]); assert touch.evaluate('fired.length') == 0
    event('touchStart', [a,b]); assert touch.evaluate('fired.length') == 1
    assert touch.evaluate('input.points.size') == 2
    event('touchEnd', [a]); event('touchStart', [a,b]); assert touch.evaluate('fired.length') == 1
    event('touchEnd', []); event('touchStart', [a,b]); assert touch.evaluate('fired.length') == 2
    event('touchEnd', [])
    assert touch.evaluate('lockAttempts') > 0
    touch.locator('#setup-toggle').tap(); touch.locator('#mode').select_option('release'); touch.locator('#close-setup').tap()
    event('touchStart', [a,b]); assert touch.evaluate('fired.length') == 2
    b2 = {**b,'y':right['y']+210,'x':right['x']-40}
    event('touchMove', [a,b2]); assert touch.evaluate('input.pair()[1].y') > 300
    event('touchEnd', [a]); assert touch.evaluate('fired.length') == 3
    event('touchEnd', [])
    event('touchStart', [a,b]); event('touchCancel', []); assert touch.evaluate('fired.length') == 3
    touch.evaluate('world.settings.mode="touch";world.settings.cooldown=2;world.lastShot=world.time')
    event('touchStart', [a,b]); assert touch.evaluate('fired.length') == 3
    touch.evaluate('world.lastShot=world.time-3'); event('touchMove', [a,b]); assert touch.evaluate('fired.length') == 3
    event('touchEnd', []); event('touchStart', [a,b]); assert touch.evaluate('fired.length') == 4
    event('touchEnd', [])
    assert touch.evaluate('scrollX===0 && scrollY===0 && getComputedStyle(arena).touchAction==="none"')
    # Portrait rotation during held release-mode contacts must not fire.
    touch.evaluate('world.settings.mode="release"'); event('touchStart', [a,b])
    touch.set_viewport_size({'width':390,'height':844})
    expect(touch.locator('#orientation-overlay')).to_be_visible()
    expect(touch.locator('#orientation-title')).to_have_text('Rotate your phone to play LaserBreak.')
    expect(touch.locator('#arena')).to_be_hidden()
    assert touch.evaluate('world.orientationBlocked && input.points.size===0 && arena.inert && !world.ready()')
    before = touch.evaluate('world.time'); touch.wait_for_timeout(120); assert touch.evaluate('world.time') == before
    assert touch.evaluate('world.fire(100,100)') is False
    touch.locator('#orientation-overlay').tap(); assert touch.evaluate('input.points.size') == 0
    event('touchEnd', []); assert touch.evaluate('fired.length') == 4
    touch.set_viewport_size({'width':844,'height':390}); expect(touch.locator('#orientation-overlay')).to_be_hidden()
    assert touch.evaluate('!world.orientationBlocked && !arena.inert && input.points.size===0 && !world.paused')
    # Explicit pause and stop survive a rotation round-trip.
    touch.locator('#pause').tap(); before=touch.evaluate('world.time')
    touch.set_viewport_size({'width':390,'height':844}); touch.set_viewport_size({'width':844,'height':390})
    assert touch.evaluate('world.paused'); touch.wait_for_timeout(80); assert touch.evaluate('world.time') == before
    touch.locator('#pause').tap(); touch.locator('#session').tap()
    touch.set_viewport_size({'width':390,'height':844}); touch.set_viewport_size({'width':844,'height':390})
    assert touch.evaluate('!world.running && world.objects.length===0')
    touch.locator('#session').tap(); assert touch.evaluate('world.running')
    touch.evaluate('world.configure("density",20);world.start();needsDraw=true')
    touch.screenshot(path='/tmp/laserbreak-mobile.png')
    touch.evaluate('window.dispatchEvent(new Event("blur"))'); assert touch.evaluate('world.paused && input.points.size===0')
    assert not errors, errors
    assert not missing, missing
    browser.close()
    print('PASS: gallery/assets, future-only settings, immediate beams/explosion, desktop input, 5 landscape layouts, wider pads, mobile multitouch modes/cancel/cooldown, portrait input/time blocking, orientation lock fallback, pause/resume and stop/start')
