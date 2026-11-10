"""Landscape Chromium regression checks with real mobile CDP multitouch."""
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
    errors,missing=[],[]
    def serve(route):
        path=urlsplit(route.request.url).path.removeprefix('/small-apps/').lstrip('/')
        file=ROOT/path
        if file.is_dir(): file/='index.html'
        if not file.is_file(): missing.append(path);route.fulfill(status=404);return
        route.fulfill(path=str(file),content_type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}.get(file.suffix,'text/plain'))
    def context(**kwargs):
        c=browser.new_context(**kwargs);c.route('http://app-lab.test/**',serve)
        c.on('weberror',lambda e:errors.append(str(e)));return c
    desktop=context(viewport={'width':1280,'height':720})
    page=desktop.new_page();page.goto('http://app-lab.test/small-apps/')
    page.get_by_role('link',name='Launch LaserBreak').click()
    expect(page).to_have_url('http://app-lab.test/small-apps/laserbreak/')
    assert page.locator('#mode').count()==0
    assert page.evaluate('world.settings.targetSize===40 && world.settings.blastMultiplier===3 && world.settings.barPercentage===40 && world.settings.sound')
    page.locator('#pause').click();before=page.evaluate('JSON.stringify([world.objects,world.effects,world.particles,world.time,world.spawnClock])')
    page.wait_for_timeout(80);assert page.evaluate('JSON.stringify([world.objects,world.effects,world.particles,world.time,world.spawnClock])')==before
    page.locator('#pause').click();page.locator('#session').click()
    assert page.evaluate('!world.running && !world.objects.length && !world.ready()')
    page.locator('#session').click();assert page.evaluate('world.running && world.objects.length===3')
    page.locator('#setup-toggle').click()
    before=page.evaluate('JSON.stringify([world.objects,world.effects,world.particles,world.time,world.spawnClock])')
    page.wait_for_timeout(100);assert page.evaluate('JSON.stringify([world.objects,world.effects,world.particles,world.time,world.spawnClock])')==before
    assert page.evaluate('world.settingsOpen && !world.paused && arena.inert && !world.ready()')
    existing=page.evaluate('JSON.stringify(world.objects)')
    values={'cooldown':1.25,'blastMultiplier':4.5,'targetSize':44,'targetSpeed':65,'barLength':140,'barSpeed':55,'barRotation':-90,'density':0,'barPercentage':70}
    for key,value in values.items():
        page.locator('#'+key).evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}',value)
        assert page.evaluate('k=>world.settings[k]',key)==value
    assert page.evaluate('JSON.stringify(world.objects)')==existing
    expect(page.get_by_role('slider',name='Bar Percentage',exact=True)).to_have_attribute('min','0')
    expect(page.locator('#barPercentage')).to_have_attribute('max','100')
    expect(page.locator('#barPercentage')).to_have_attribute('step','10')
    assert page.evaluate('world.bag.length===10 && world.bag.filter(t=>t==="bar").length===7')
    expect(page.locator('#blastMultiplier')).to_have_attribute('step','0.5')
    page.locator('#sound').uncheck();assert page.evaluate('!audio.enabled && !world.settings.sound')
    page.locator('#sound').check();assert page.evaluate('audio.enabled && world.settings.sound')
    page.locator('#debug').check();page.locator('#diagnostics').check()
    page.locator('#clear').click();assert page.evaluate('!world.objects.length')
    page.locator('#reset').click();assert page.evaluate('JSON.stringify(world.settings)===JSON.stringify(defaults) && world.settingsOpen')
    page.locator('#close-setup').click();assert page.evaluate('!world.settingsOpen && !world.paused && !arena.inert')
    page.evaluate('world.clear();world.settings.density=0;world.settings.cooldown=0;world.objects=[{id:101,type:"target",x:150,y:200,radius:20,speed:0,extent:20,color:"#36fff3"}]')
    box=page.locator('#left-pad').bounding_box();field=page.locator('canvas').bounding_box()
    page.mouse.move(box['x']+20,field['y']+field['height']*200/page.evaluate('world.height'));page.mouse.down();page.keyboard.down('Space')
    assert page.evaluate('world.objects.length')==1
    page.keyboard.up('Space');assert page.evaluate('world.objects.length')==0
    assert page.evaluate('world.effects.some(e=>e.type==="explosion" && e.r===60)')
    page.mouse.up()
    page.evaluate('world.clear();world.objects=[{id:101,type:"target",x:200,y:160,radius:20,speed:0,extent:20,color:"#36fff3"},{id:102,type:"target",x:650,y:320,radius:20,speed:0,extent:20,color:"#fff04b"},{id:103,type:"bar",x:460,y:210,length:100,thickness:12,angle:.6,speed:0,rotation:1,extent:51}];world.paused=true;syncSession()')
    page.screenshot(path='/tmp/laserbreak-desktop.png')
    for width,height in [(568,320),(667,375),(844,390),(1024,600),(1366,768)]:
        page.set_viewport_size({'width':width,'height':height})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight')
        left,right,field=[page.locator(sel).bounding_box() for sel in ['#left-pad','#right-pad','canvas']]
        assert field['width']>=350 and field['height']>200
        assert page.evaluate('Math.abs(canvas.width/1000-canvas.height/world.height)<.005')
        expected=97 if width<=600 else 130
        assert abs(left['width']-expected)<1 and abs(right['width']-expected)<1
        for sel in ['#pause','#session','#fullscreen']: expect(page.locator(sel)).to_be_in_viewport()
    mobile=context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=3)
    mobile.add_init_script('if(screen.orientation)screen.orientation.lock=()=>Promise.reject(new Error("unavailable"));')
    touch=mobile.new_page();touch.goto('http://app-lab.test/small-apps/laserbreak/')
    touch.evaluate('world.clear();world.settings.density=0;world.settings.cooldown=0;window.fired=[];const fire=world.fire.bind(world);world.fire=(a,b)=>{const ok=fire(a,b);if(ok)fired.push([a,b]);return ok;};void 0')
    client=mobile.new_cdp_session(touch)
    left,right=[touch.locator(sel).bounding_box() for sel in ['#left-pad','#right-pad']]
    a={'id':1,'x':left['x']+left['width']/2,'y':left['y']+100}
    b={'id':2,'x':right['x']+right['width']/2,'y':right['y']+160}
    def event(kind,points):client.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
    event('touchStart',[a]);event('touchStart',[a,b]);assert touch.evaluate('fired.length')==0
    assert touch.evaluate('input.points.size===2 && pads.left.classList.contains("active") && pads.right.classList.contains("active")')
    b2={**b,'y':right['y']+210,'x':right['x']-40}
    event('touchMove',[a,b2]);assert touch.evaluate('input.pair()[1].y')>300
    event('touchEnd',[a]);assert touch.evaluate('fired.length')==1
    event('touchStart',[a,b]);event('touchEnd',[a]);assert touch.evaluate('fired.length')==1
    event('touchEnd',[]);event('touchStart',[a,b]);event('touchEnd',[b]);assert touch.evaluate('fired.length')==2
    event('touchEnd',[]);event('touchStart',[a,b]);event('touchCancel',[]);assert touch.evaluate('fired.length')==2
    touch.evaluate('world.settings.cooldown=2;world.lastShot=world.time')
    event('touchStart',[a,b]);event('touchEnd',[a]);assert touch.evaluate('fired.length')==2
    touch.evaluate('world.lastShot=world.time-3');event('touchStart',[a,b]);event('touchEnd',[a]);assert touch.evaluate('fired.length')==2
    event('touchEnd',[]);event('touchStart',[a,b]);event('touchEnd',[a]);assert touch.evaluate('fired.length')==3
    event('touchEnd',[])
    # A third finger opens Setup before either aiming thumb lifts, without firing.
    event('touchStart',[a,b]);box=touch.locator('#setup-toggle').bounding_box()
    c={'id':3,'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}
    event('touchStart',[a,b,c]);expect(touch.locator('#setup')).to_be_visible()
    assert touch.evaluate('world.settingsOpen && input.points.size===0 && fired.length===3')
    event('touchEnd',[]);touch.locator('#close-setup').tap()
    # Orientation change aborts aiming and freezes all gameplay timing.
    event('touchStart',[a,b]);touch.set_viewport_size({'width':390,'height':844})
    expect(touch.locator('#orientation-overlay')).to_be_visible()
    assert touch.evaluate('world.orientationBlocked && input.points.size===0 && arena.inert && !world.ready()')
    before=touch.evaluate('world.time');touch.wait_for_timeout(100);assert touch.evaluate('world.time')==before
    event('touchEnd',[]);assert touch.evaluate('fired.length')==3
    touch.set_viewport_size({'width':844,'height':390});expect(touch.locator('#orientation-overlay')).to_be_hidden()
    assert touch.evaluate('!world.orientationBlocked && !arena.inert && !world.paused')
    touch.locator('#pause').tap();touch.set_viewport_size({'width':390,'height':844});touch.set_viewport_size({'width':844,'height':390})
    assert touch.evaluate('world.paused')
    touch.locator('#pause').tap();touch.locator('#session').tap()
    touch.set_viewport_size({'width':390,'height':844});touch.set_viewport_size({'width':844,'height':390})
    assert touch.evaluate('!world.running && !world.objects.length')
    touch.locator('#session').tap();touch.evaluate('world.configure("density",20);world.start();needsDraw=true')
    touch.screenshot(path='/tmp/laserbreak-mobile.png')
    assert touch.evaluate('scrollX===0 && scrollY===0 && getComputedStyle(arena).touchAction==="none"')
    assert not errors,errors
    assert not missing,missing
    browser.close()
    print('PASS: release-only real multitouch, alignment/aim/capture/cancel/re-arm/cooldown, third-contact Setup cancellation, blast control, sound toggle, future-only properties, main controls, 5 landscapes, portrait/session restoration, gallery/assets')
