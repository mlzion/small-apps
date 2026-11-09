"""Chromium checks at root and GitHub Pages paths; test dependencies only."""
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium')
    errors=[]; missing=[]
    def serve(route):
        path=urlsplit(route.request.url).path
        if path.startswith('/small-apps/'): path=path[len('/small-apps'):]
        file=ROOT/path.lstrip('/')
        if file.is_dir(): file/='index.html'
        if not file.is_file(): missing.append(path);route.fulfill(status=404);return
        route.fulfill(path=str(file),content_type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}.get(file.suffix,'text/plain'))
    def context(**kw):
        ctx=browser.new_context(**kw);ctx.add_init_script('''window.loopPending=0;window.loopMax=0;const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=(fn)=>{window.loopPending++;window.loopMax=Math.max(window.loopMax,window.loopPending);return raf((t)=>{window.loopPending--;fn(t);});};''');ctx.route('http://app-lab.test/**',serve);ctx.on('weberror',lambda e:errors.append(str(e)));return ctx
    ctx=context();page=ctx.new_page()
    for prefix in ['/', '/small-apps/']:
        page.set_viewport_size({'width':1280,'height':800})
        page.goto('http://app-lab.test'+prefix)
        page.get_by_role('link',name='Launch D::FUZE').click()
        expect(page).to_have_url('http://app-lab.test'+prefix+'d-fuze/')
        page.get_by_role('button',name='HOW TO PLAY',exact=True).click();expect(page.locator('#detail')).to_contain_text('Three lives')
        page.get_by_role('button',name='PLAY',exact=True).click()
        assert page.evaluate('game.state')=='PLAYING'
        assert page.evaluate('audio.context.state')=='running'
        # A late render must not backdate a new short press into repeated shots.
        page.evaluate('''lastTime-=0.8;window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',cancelable:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:' ',code:'Space'}));''')
        assert page.evaluate('game.ammo')==7
        page.evaluate('game.newGame()')
        for key,direction in [('ArrowLeft',-1),('a',-1),('ArrowRight',1),('d',1)]:
            before=page.evaluate('game.angle');page.keyboard.down(key);page.wait_for_timeout(100);page.keyboard.up(key)
            assert (page.evaluate('game.angle')-before)*direction>0
        before=page.evaluate('game.ammo');page.keyboard.press('Space');assert page.evaluate('game.ammo')==before-1
        page.wait_for_timeout(270);page.keyboard.down('d');page.keyboard.down('Space');page.wait_for_timeout(280);page.keyboard.up('Space');page.keyboard.up('d')
        expect(page.locator('#message')).to_have_text('BOMB D::FUZED!');assert page.evaluate('game.level')==1
        page.get_by_role('button',name='PLAY NEXT LEVEL').click();assert page.evaluate('game.level')==2
        page.keyboard.press('Escape');assert page.evaluate('game.state')=='PAUSED';remaining=page.evaluate('game.remaining');page.wait_for_timeout(250);assert page.evaluate('game.remaining')==remaining
        page.keyboard.press('Escape');assert page.evaluate('game.state')=='PLAYING'
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        page.evaluate("window.dispatchEvent(new Event('blur'))");assert page.evaluate('game.state')=='PAUSED';assert page.evaluate('JSON.stringify(input.held)')=='{"ccw":false,"cw":false,"fire":false}'
        page.get_by_role('button',name='RESUME',exact=True).last.click()
        page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden")
        assert page.evaluate('game.state')=='PAUSED'
        page.locator('#sound').click();expect(page.locator('#sound')).to_have_attribute('aria-pressed','true');assert page.evaluate('audio.voices.size')==0
        page.reload();expect(page.locator('#sound')).to_have_attribute('aria-pressed','true');page.locator('#sound').click()
        page.get_by_role('button',name='PLAY',exact=True).click()
        # Exercise real controller failure transitions without waiting 90 seconds.
        for lives in [2,1,0]:
            page.evaluate('game.update(31)');page.wait_for_timeout(1400)
            assert page.evaluate('game.lives')==lives
            if lives: page.get_by_role('button',name='RETRY LEVEL').click();assert page.evaluate('game.ammo')==8
        expect(page.locator('#message')).to_have_text('GAME OVER');page.get_by_role('button',name='NEW GAME').click();assert page.evaluate('game.lives')==3
        for width,height in [(1440,900),(1024,768),(768,1024),(812,375),(375,812),(320,568),(568,320)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(80)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,height)
            boxes=[page.locator(s).bounding_box() for s in ['canvas','[data-control=fire]','[data-control=ccw]','[data-control=cw]']]
            for box in boxes:
                assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width+1 and box['y']+box['height']<=height+1,(width,height,box)
            assert abs(boxes[0]['width']-boxes[0]['height'])<1
            for b in boxes[1:]:
                assert b['height']>=44 and b['width']>=44
                c=boxes[0];assert b['x']>=c['x']+c['width'] or b['x']+b['width']<=c['x'] or b['y']>=c['y']+c['height'] or b['y']+b['height']<=c['y']
            page.screenshot(path=f'/tmp/d-fuze-{width}x{height}.png')
            page.keyboard.press('Escape')
            for b in page.locator('#actions button').all():
                box=b.bounding_box();assert box['y']>=0 and box['y']+box['height']<=height+1,(width,height,box)
            page.keyboard.press('Escape')
        assert page.evaluate('loopMax')==1
        page.get_by_role('link',name='Back to App Lab',exact=True).click();expect(page).to_have_url('http://app-lab.test'+prefix+'#apps')
    mobile=context(viewport={'width':375,'height':812},is_mobile=True,has_touch=True,device_scale_factor=2)
    touch=mobile.new_page();touch.goto('http://app-lab.test/small-apps/d-fuze/');touch.get_by_role('button',name='PLAY',exact=True).tap()
    # Increase health only in this fixture to observe longer held multitouch firing.
    touch.evaluate('game.health=30;game.ammo=40')
    client=mobile.new_cdp_session(touch)
    def point(selector,id):
        box=touch.locator(selector).bounding_box();return {'x':box['x']+box['width']/2,'y':box['y']+box['height']/2,'id':id}
    fire=point('[data-control=fire]',1);cw=point('[data-control=cw]',2)
    scroll=touch.evaluate('scrollY');angle=touch.evaluate('game.angle')
    client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[fire,cw]});touch.wait_for_timeout(550)
    assert touch.evaluate('game.ammo')<=37;assert touch.evaluate('game.angle')>angle
    client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[fire]});ammo=touch.evaluate('game.ammo');angle=touch.evaluate('game.angle');touch.wait_for_timeout(300)
    assert touch.evaluate('game.ammo')==ammo;assert touch.evaluate('game.angle')>angle
    client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});angle=touch.evaluate('game.angle');touch.wait_for_timeout(150);assert touch.evaluate('game.angle')==angle;assert touch.evaluate('scrollY')==scroll
    touch.set_viewport_size({'width':812,'height':375});assert touch.evaluate('game.level')==1;assert touch.evaluate('game.ammo')==ammo
    touch.evaluate("window.dispatchEvent(new Event('blur'))");assert touch.evaluate('game.state')=='PAUSED'
    # Audio absence must be harmless.
    silent=context();silent.add_init_script("window.AudioContext=undefined;window.webkitAudioContext=undefined;Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage unavailable')}})");noaudio=silent.new_page();noaudio.goto('http://app-lab.test/small-apps/d-fuze/');noaudio.get_by_role('button',name='PLAY',exact=True).click();noaudio.keyboard.press('Space');assert noaudio.evaluate('game.health')==2
    assert not errors,errors
    assert not missing,missing
    print('PASS: gallery/direct navigation at both roots, keyboard/hold, victory/progression, pause/visibility/blur, lives/retry/game over, mute persistence, Web Audio/no-audio, seven viewports, real multitouch release/rotation/fire, orientation, no scroll/errors/missing assets')
    browser.close()
