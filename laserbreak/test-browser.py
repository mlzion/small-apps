"""Desktop Chromium + real CDP multitouch in mobile landscape; no server needed."""
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
    expect(page.locator('#setup')).to_be_hidden()
    page.locator('#setup-toggle').click()
    expect(page.locator('#setup')).to_be_visible()
    page.locator('#mode').select_option('release')
    # All sliders update their setting immediately using their actual UI listeners.
    values={'cooldown':1.25,'targetSize':22,'targetSpeed':65,'barLength':140,'barThickness':14,'barSpeed':55,'barRotation':-90,'density':0}
    for key,value in values.items():
        page.locator('#'+key).evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}',value)
        assert page.evaluate('key=>world.settings[key]',key)==value
    page.locator('#debug').check();assert page.evaluate('world.settings.debug')
    page.locator('#pause').click();before=page.evaluate('world.time');page.wait_for_timeout(100)
    assert page.evaluate('world.time')==before
    page.locator('#pause').click();page.locator('#clear').click();assert page.evaluate('world.objects.length')==0
    page.locator('#reset').click();assert page.evaluate('JSON.stringify(world.settings)===JSON.stringify(defaults)')
    page.locator('#close-setup').click()
    page.evaluate('world.settings.density=0;world.settings.cooldown=0')
    # Desktop mouse + Space uses the same two-pointer controller.
    box=page.locator('#left-pad').bounding_box();page.mouse.move(box['x']+20,box['y']+100);page.mouse.down()
    page.keyboard.down('Space');assert page.evaluate('world.lastShot')>=0
    page.keyboard.up('Space');page.mouse.up()
    page.evaluate('world.clear();world.settings.density=0;world.settings.debug=true;world.spawnClock=0;world.objects=[{id:101,type:"target",x:200,y:160,radius:18,angle:0,color:"#65f5ef"},{id:102,type:"target",x:650,y:320,radius:18,angle:0,color:"#f5e67a"},{id:103,type:"bar",x:460,y:210,length:130,thickness:12,angle:.6}];world.paused=true')
    page.screenshot(path='/tmp/laserbreak-desktop.png')
    for width,height in [(568,320),(667,375),(844,390),(1024,600),(1366,768)]:
        page.set_viewport_size({'width':width,'height':height})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight')
        left,right,field=[page.locator(sel).bounding_box() for sel in ['#left-pad','#right-pad','canvas']]
        assert field['width']>350 and field['height']>200
        assert abs(left['height']-field['height'])<1 and abs(right['height']-field['height'])<1
        assert left['x']+left['width']<=field['x']+1 and field['x']+field['width']<=right['x']+1
    mobile=context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=2)
    touch=mobile.new_page();touch.goto('http://app-lab.test/small-apps/laserbreak/')
    touch.evaluate('world.settings.density=0;world.settings.cooldown=0;window.fired=[];const fire=world.fire.bind(world);world.fire=(a,b)=>{const ok=fire(a,b);if(ok)fired.push([a,b]);return ok;};void 0')
    client=mobile.new_cdp_session(touch)
    left,right=[touch.locator(sel).bounding_box() for sel in ['#left-pad','#right-pad']]
    a={'id':1,'x':left['x']+left['width']/2,'y':left['y']+100}
    b={'id':2,'x':right['x']+right['width']/2,'y':right['y']+160}
    def event(kind,points):client.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
    event('touchStart',[a]);assert touch.evaluate('fired.length')==0
    event('touchStart',[a,b]);assert touch.evaluate('fired.length')==1
    assert touch.evaluate('input.points.size')==2
    event('touchEnd',[a]);event('touchStart',[a,b]);assert touch.evaluate('fired.length')==1
    event('touchEnd',[]);event('touchStart',[a,b]);assert touch.evaluate('fired.length')==2
    event('touchEnd',[])
    # Switch mode through visible controls, then slide with capture beyond the pad.
    touch.locator('#setup-toggle').tap();touch.locator('#mode').select_option('release');touch.locator('#close-setup').tap()
    event('touchStart',[a,b]);assert touch.evaluate('fired.length')==2
    b2={**b,'y':right['y']+210,'x':right['x']-40}
    event('touchMove',[a,b2]);assert touch.evaluate('input.pair()[1].y')>300
    assert touch.evaluate('input.points.size')==2
    event('touchEnd',[a]);assert touch.evaluate('fired.length')==3
    event('touchEnd',[])
    event('touchStart',[a,b]);event('touchCancel',[]);assert touch.evaluate('fired.length')==3
    # Cooldown cannot auto-fire while held, even after it expires.
    touch.evaluate('world.settings.mode="touch";world.settings.cooldown=2;world.lastShot=world.time')
    event('touchStart',[a,b]);assert touch.evaluate('fired.length')==3
    touch.evaluate('world.lastShot=world.time-3');event('touchMove',[a,b]);assert touch.evaluate('fired.length')==3
    event('touchEnd',[]);event('touchStart',[a,b]);assert touch.evaluate('fired.length')==4
    event('touchEnd',[])
    assert touch.evaluate('scrollX===0 && scrollY===0 && getComputedStyle(arena).touchAction==="none"')
    # Opening setup and backgrounding discard gestures, without firing in release mode.
    touch.evaluate('world.settings.mode="release"');event('touchStart',[a,b]);touch.locator('#setup-toggle').tap()
    assert touch.evaluate('input.points.size')==0
    event('touchEnd',[]);touch.locator('#close-setup').tap()
    touch.evaluate('world.settings.density=0;world.objects=[{id:9,type:"target",x:500,y:200,radius:15,angle:0,color:"#65f5ef"}];window.dispatchEvent(new Event("blur"))')
    assert touch.evaluate('world.paused && input.points.size===0')
    touch.screenshot(path='/tmp/laserbreak-mobile.png')
    # Portrait remains contained and offers orientation guidance.
    touch.set_viewport_size({'width':390,'height':844})
    expect(touch.locator('.rotate-note')).to_be_visible()
    assert touch.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    assert not missing,missing
    browser.close()
    print('PASS: gallery navigation/assets, settings, pause/reset/clear, desktop fallback, five landscape sizes, mobile multitouch, both modes, capture, cancel, cooldown/re-arm, gesture prevention and portrait hint')
