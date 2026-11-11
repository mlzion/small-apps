"""Arcade/Free Play integration, real touch input, deadline and lifecycle checks."""
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
    errors=[]
    def serve(route):
        file=ROOT/urlsplit(route.request.url).path.lstrip('/')
        if file.is_dir():file/='index.html'
        route.fulfill(path=str(file),content_type={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}.get(file.suffix,'text/html'))
    for mobile in [False,True]:
        context=browser.new_context(viewport={'width':844 if mobile else 1280,'height':390 if mobile else 720},is_mobile=mobile,has_touch=mobile)
        context.route('http://app-lab.test/**',serve);context.on('weberror',lambda e:errors.append(str(e)))
        context.add_init_script('screen.orientation.lock=async()=>{throw Error("unsupported");};')
        page=context.new_page();page.goto('http://app-lab.test/laserbreak/')
        assert page.evaluate('session.mode==="free" && !world.arcadeBlocked')
        page.locator('#setup-toggle').click()
        for key,value in {'cooldown':1.2,'targetSize':50,'density':40,'barPercentage':70}.items():
            page.locator('#'+key).evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}',value)
        page.locator('#game-mode').select_option('arcade')
        assert page.evaluate('session.state==="ready" && session.remaining===45 && !world.ready() && world.objects.length===0')
        expect(page.locator('#level-select')).to_be_visible();expect(page.locator('#cooldown')).to_be_disabled()
        page.locator('#close-setup').click();expect(page.locator('#arcade-menu')).to_be_visible()
        expect(page.locator('#arcade-action')).to_have_text('Start Level 1')
        page.locator('#arcade-action').click()
        expect(page.locator('#arcade-menu')).to_be_hidden();expect(page.locator('#arcade-level')).to_have_text('1/25')
        assert page.evaluate('session.state==="playing" && world.stats.targets===0 && world.objects.length===3 && world.bag.length===7')
        assert page.evaluate('document.querySelector("#defense-bar").classList.contains("neutral") && document.querySelector("#defense-bar").innerText===""')
        # One direct double hit, one blast victim, one destroyed bar: only two targets count.
        page.evaluate('world.configure("density",0);world.settings.cooldown=0;world.objects=[{id:101,type:"target",x:150,y:200,radius:20,extent:20,speed:0,color:"#36fff3"},{id:102,type:"target",x:150,y:270,radius:15,extent:15,speed:0,color:"#fff04b"},{id:103,type:"bar",x:175,y:250,length:20,thickness:12,angle:0,rotation:0,speed:0,extent:12}]')
        left,right=[page.locator(sel).bounding_box() for sel in ['#left-pad','#right-pad']]
        field=page.locator('canvas').bounding_box();y=field['y']+field['height']*200/page.evaluate('world.height')
        if mobile:
            client=context.new_cdp_session(page)
            a={'id':1,'x':left['x']+left['width']/2,'y':y};b={'id':2,'x':right['x']+right['width']/2,'y':y}
            def event(kind,points):client.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
            event('touchStart',[a,b]);assert page.evaluate('world.stats.targets')==0
            event('touchEnd',[a]);assert page.evaluate('world.stats.targets')==2
            event('touchEnd',[])
        else:
            page.mouse.move(left['x']+20,y);page.mouse.down();page.keyboard.down('Space')
            assert page.evaluate('world.stats.targets')==0
            page.keyboard.up('Space');page.mouse.up()
        assert page.evaluate('world.stats.targets===2 && world.stats.shots===1 && world.objects.length===0')
        page.wait_for_function('document.querySelector("#defense-destroyed").style.width==="100%"')
        assert page.locator('#arcade-targets').count()==0
        assert page.locator('#defense-bar').bounding_box()['height']==7
        assert page.evaluate('document.querySelector("#defense-marker").style.left==="40%"')
        # Escape only fully departed circles; score/flash/audio are Arcade-only.
        page.evaluate('window.escapeCalls=0;window.originalEscape=audio.playEscape.bind(audio);audio.playEscape=()=>{escapeCalls++;return originalEscape()};world.objects=[{id:104,type:"target",x:300,y:world.height+21,radius:20,extent:20,speed:0},{id:105,type:"bar",x:500,y:world.height+60,extent:51,speed:0,angle:0,rotation:0,length:100,thickness:12}]')
        page.wait_for_function('world.stats.escaped===1')
        assert page.evaluate('world.stats.targets===2 && escapeCalls===1 && world.effects.some(e=>e.type==="escape" && e.x===300)')
        page.wait_for_function('parseFloat(document.querySelector("#defense-destroyed").style.width)<67')
        assert page.evaluate('session.warningCount===0')
        page.screenshot(path=f'/tmp/laserbreak-defense-{mobile}.png')
        # Setup, explicit pause, and hidden-page interruption must freeze the active clock.
        page.locator('#setup-toggle').click();before=page.evaluate('[session.elapsed,world.time,JSON.stringify(world.stats)]')
        page.wait_for_timeout(120);assert page.evaluate('[session.elapsed,world.time,JSON.stringify(world.stats)]')==before
        page.locator('#close-setup').click();page.locator('#pause').click();before=page.evaluate('session.elapsed')
        page.wait_for_timeout(100);assert page.evaluate('session.elapsed')==before
        page.locator('#pause').click()
        page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"))')
        before=page.evaluate('session.elapsed');page.wait_for_timeout(100);assert page.evaluate('session.elapsed')==before
        assert page.evaluate('world.paused');page.evaluate('delete document.hidden');page.locator('#pause').click()
        page.locator('#session').click();assert page.evaluate('session.state==="stopped" && !world.objects.length')
        before=page.evaluate('session.elapsed');page.wait_for_timeout(80);assert page.evaluate('session.elapsed')==before
        page.locator('#session').click();assert page.evaluate('session.level.number===1 && world.stats.targets===0')
        # Testing Level Select resets all level state while the panel holds time at zero.
        page.locator('#setup-toggle').click();page.locator('#level-select').select_option('24');page.locator('#load-level').click()
        assert page.evaluate('session.level.number===24 && session.remaining===45 && world.time===0 && world.stats.targets===0 && world.stats.shots===0 && world.objects.length===3 && world.bag.length===7')
        page.locator('#close-setup').click()
        assert page.evaluate('document.querySelector("#defense-marker").style.left==="76.2%"')
        # Hold an aiming gesture into the deadline: no stale release can fire in the retry screen.
        page.evaluate('input.down(77,"left",180);input.down(78,"right",190);refreshPads();session.elapsed=44.99;world.time=44.99;world.stats.targets=1;world.stats.escaped=9')
        page.wait_for_function('session.state==="retry"')
        assert page.evaluate('input.points.size===0 && !world.ready() && session.remaining===0')
        expect(page.locator('#arcade-action')).to_have_text('Retry Level 24')
        expect(page.locator('#arcade-detail')).to_contain_text('FAIL')
        expect(page.locator('#arcade-detail')).to_contain_text('Escaped 9')
        expect(page.locator('#arcade-detail')).to_contain_text('Required 76.2%')
        page.locator('#arcade-action').click();assert page.evaluate('session.level.number===24 && world.stats.targets===0')
        page.evaluate('world.stats.targets=10;world.stats.escaped=0;session.step(1)');assert page.evaluate('session.state')=='playing'
        page.evaluate('session.elapsed=44.99;world.time=44.99');page.wait_for_function('session.state==="between"')
        expect(page.locator('#arcade-action')).to_have_text('Start Level 25')
        page.locator('#arcade-action').click();expect(page.locator('#arcade-level')).to_have_text('25/25')
        # At Level 25, cross 80% twice; no continuous/recovery warning.
        page.evaluate('world.clear();world.configure("density",0);world.stats.targets=4;world.stats.escaped=0;window.pulses=0;document.querySelector("#defense-escaped").addEventListener("animationstart",()=>pulses++)')
        def escape():
            before=page.evaluate('world.stats.escaped')
            page.evaluate('world.objects.push({type:"target",x:400,y:world.height+21,radius:20,extent:20,speed:0})')
            page.wait_for_function(f'world.stats.escaped==={before+1}')
        escape();assert page.evaluate('session.warningCount')==0
        escape();page.wait_for_function('pulses===1');assert page.evaluate('session.warningCount')==1
        escape();page.wait_for_timeout(420);assert page.evaluate('pulses')==1
        page.evaluate('world.stats.targets=12');page.wait_for_timeout(120)
        escape();page.wait_for_function('pulses===2');assert page.evaluate('session.warningCount')==2
        page.evaluate('world.stats.targets=20;session.elapsed=44.99;world.time=44.99')
        page.wait_for_function('session.state==="victory"');expect(page.locator('#arcade-title')).to_have_text('All 25 levels cleared')
        expect(page.locator('#arcade-detail')).to_contain_text('PASS')
        expect(page.locator('#arcade-detail')).to_contain_text('Required 80%')
        page.screenshot(path=f'/tmp/laserbreak-arcade-victory-{mobile}.png')
        page.locator('#arcade-action').click();assert page.evaluate('session.level.number===1 && world.stats.targets===0')
        if mobile:
            for width,height in [(568,320),(667,375),(844,390)]:
                page.set_viewport_size({'width':width,'height':height})
                hud=page.locator('#arcade-hud').bounding_box();field=page.locator('canvas').bounding_box()
                assert hud['x']>=field['x'] and hud['x']+hud['width']<=field['x']+field['width']
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                for sel in ['#pause','#session','#fullscreen','#setup-toggle']:expect(page.locator(sel)).to_be_in_viewport()
        # Fullscreen and portrait handling retain the same Arcade clock/state semantics.
        page.locator('#fullscreen').click();page.wait_for_function('document.fullscreenElement!==null')
        page.locator('#setup-toggle').click();before=page.evaluate('session.elapsed');page.wait_for_timeout(80);assert page.evaluate('session.elapsed')==before
        assert page.evaluate('setup.getBoundingClientRect().height===innerHeight')
        page.locator('#close-setup').click()
        page.set_viewport_size({'width':390,'height':844});expect(page.locator('#orientation-overlay')).to_be_visible()
        before=page.evaluate('session.elapsed');page.wait_for_timeout(100);assert page.evaluate('session.elapsed')==before
        page.evaluate('document.exitFullscreen()');page.set_viewport_size({'width':844 if mobile else 1280,'height':390 if mobile else 720})
        expect(page.locator('#orientation-overlay')).to_be_hidden()
        page.screenshot(path=f'/tmp/laserbreak-arcade-{mobile}.png')
        page.locator('#setup-toggle').click();page.locator('#level-select').select_option('5');page.locator('#load-level').click();page.locator('#restart-arcade').click()
        assert page.evaluate('session.level.number===1 && session.elapsed===0 && world.stats.targets===0')
        page.locator('#sound').uncheck();page.locator('#game-mode').select_option('free')
        assert page.evaluate('world.settings.cooldown===1.2 && world.settings.targetSize===50 && world.settings.density===40 && world.settings.barPercentage===70 && !world.settings.sound && !world.arcadeBlocked')
        expect(page.locator('#cooldown')).to_be_enabled();expect(page.locator('#arcade-hud')).to_be_hidden();expect(page.locator('#defense-bar')).to_be_hidden()
        assert page.evaluate('!world.trackEscapes && world.stats.escaped===0')
        page.locator('#close-setup').click();assert page.evaluate('session.mode==="free" && world.running')
        context.close()
    assert not errors,errors
    browser.close()
    print('PASS: desktop/mobile Arcade modes and generated controls, real release firing/counting, 45-second outcomes, retry/advance/victory/restart, held-gesture deadline cancellation, Level Select reset, Setup/pause/background/portrait clocks, fullscreen, Free Play restoration')
