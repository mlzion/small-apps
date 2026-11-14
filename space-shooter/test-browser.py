"""Real Chromium input/rendering regressions. No server or external requests.
Run from the repository root: python space-shooter/test-browser.py
"""
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'http://galactix.test'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'))
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    errors, missing = [], []
    context.on('weberror', lambda error: errors.append(str(error)))

    def serve(route):
        path = unquote(urlsplit(route.request.url).path)
        if path.startswith('/small-apps/'):
            path = path[len('/small-apps'):]
        file = (ROOT / path.lstrip('/')).resolve()
        if not file.is_relative_to(ROOT):
            route.fulfill(status=403)
            return
        if file.is_dir():
            file /= 'index.html'
        if not file.is_file():
            missing.append(path)
            route.fulfill(status=404)
            return
        types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'}
        route.fulfill(path=str(file), content_type=types.get(file.suffix, 'application/octet-stream'))

    context.route(ORIGIN + '/**', serve)
    # Observe the real engine for assertions, without adding test globals to production.
    context.add_init_script("""{
      let engine;
      Object.defineProperty(window,'Galactix',{get(){return engine},set(value){
        engine=value;const create=value.create;
        engine.create=(...args)=>(window.__world=create(...args));
      }});
      let audioModule;
      Object.defineProperty(window,'GalactixAudio',{get(){return audioModule},set(value){
        audioModule=value;const create=value.create;
        value.create=(...args)=>{const audio=create(...args);window.__audio=audio;window.__audioEvents=[];
          const play=audio.play;audio.play=cues=>{window.__audioEvents.push(...cues);play(cues);};return audio;};
      }});
      try{if(!localStorage.getItem('galactix.best.v01'))localStorage.setItem('galactix.best.v01','1234');}catch{}
    }""")
    page = context.new_page()
    for prefix in ('/', '/small-apps/'):
        page.goto(ORIGIN + prefix)
        page.evaluate("localStorage.setItem('galactix.best.v01','1234')")
        page.get_by_role('link', name='Launch Galactix').click()
        expect(page).to_have_url(ORIGIN + prefix + 'space-shooter/')
        expect(page.locator('#level-select option')).to_have_count(30)
        expect(page.locator('#best')).to_have_text('BEST 01234')
        expect(page.locator('#level')).to_have_text('01 / 30')
        for width, height in ((320, 568), (375, 812), (390, 844), (430, 932)):
            page.set_viewport_size({'width': width, 'height': height})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight')
            field, pad, fire = [page.locator(s).bounding_box() for s in ('#field', '#drag-pad', '#fire')]
            assert field['height'] > 200 and field['y'] + field['height'] <= pad['y']
            assert pad['y'] == fire['y'] and fire['y'] + fire['height'] <= height
            assert page.locator('#action').evaluate('el=>el.getBoundingClientRect().top>=document.querySelector("#field").getBoundingClientRect().top')
            page.screenshot(path=f'/tmp/galactix-v03-menu-{width}.png')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.locator('#action').click()
        expect(page.locator('#menu')).to_be_hidden()
        page.wait_for_timeout(100)
        pad, fire = [page.locator(s).bounding_box() for s in ('#drag-pad', '#fire')]
        def point(box, ident):
            return {'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2, 'id': ident}
        left, right = point(pad, 1), point(fire, 2)
        cdp = context.new_cdp_session(page)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [left, right]})
        page.wait_for_timeout(80)
        assert page.evaluate('__world.actionId') > 0
        x = page.evaluate('__world.player.x')
        left['x'] += 32
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [left, right]})
        page.wait_for_timeout(100)
        assert page.evaluate('__world.player.x') > x + 20
        assert page.locator('#fire').evaluate('el=>el.classList.contains("active")')
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchCancel', 'touchPoints': []})
        assert not page.locator('#fire').evaluate('el=>el.classList.contains("active")')
        assert not page.locator('#drag-pad').evaluate('el=>el.classList.contains("active")')
        page.wait_for_timeout(50)
        count = page.evaluate('__world.actionId')
        page.wait_for_timeout(400)
        assert page.evaluate('__world.actionId') == count, 'cancelled fire is released'
        page.keyboard.down('ArrowLeft'); page.keyboard.down('Space'); page.wait_for_timeout(120)
        page.keyboard.up('ArrowLeft'); page.keyboard.up('Space')
        assert page.evaluate('__world.actionId') > count
        # Sound is an optional user gesture, and does not change the engine clock.
        page.locator('#sound').click()
        expect(page.locator('#sound')).to_have_attribute('aria-pressed', 'true')
        page.wait_for_function('__audio.diagnostics.timer')
        page.keyboard.press('p'); expect(page.locator('#menu-title')).to_have_text('Flight paused')
        page.evaluate('__world.effects.rapid=6;__world.effects.spread=8')
        assert page.evaluate('__audio.diagnostics.voices===0 && !__audio.diagnostics.timer')
        time = page.evaluate('__world.time')
        page.wait_for_timeout(150)
        assert page.evaluate('__world.time') == time and page.evaluate('__world.effects.rapid') == 6
        page.locator('#action').click()
        page.set_viewport_size({'width': 844, 'height': 390})
        expect(page.locator('#orientation-overlay')).to_be_visible()
        page.wait_for_timeout(50); time = page.evaluate('__world.time'); page.wait_for_timeout(150)
        assert page.evaluate('__world.time') == time
        assert page.locator('#game').evaluate('el=>el.inert')
        page.set_viewport_size({'width': 390, 'height': 844})
        expect(page.locator('#orientation-overlay')).to_be_hidden()
        expect(page.locator('#menu-title')).to_have_text('Flight paused')
        page.locator('#action').click()
        expect(page.locator('#weapons')).to_contain_text('RAPID')
        for level in range(1, 31):
            assert page.evaluate('__world.level') == level
            page.evaluate('__world.state="cleared";__world.score=100')
            expect(page.locator('#action')).to_have_text('Fly again →' if level == 30 else 'Next sector →')
            page.locator('#action').click()
        assert page.evaluate('__world.level') == 1
        page.evaluate('__world.state="lost"')
        expect(page.locator('#action')).to_have_text('Retry sector →')
        page.locator('#level-select').select_option('30')
        page.locator('#action').click()
        expect(page.locator('#level')).to_have_text('30 / 30')
        page.evaluate("""{
          __world.invulnerable=100;
          for(let i=0;i<432;i++)Galactix.step(__world,1/120);
          __world.invulnerable=0;
          __world.pickups=[{kind:'shield',x:100,y:220,age:0},{kind:'rapid',x:180,y:220,age:0},{kind:'spread',x:260,y:220,age:0}];
        }""")
        page.wait_for_timeout(100)
        page.screenshot(path='/tmp/galactix-v03-pickups.png')
        page.evaluate('__world.pickups.forEach(p=>{p.x=__world.player.x;p.y=__world.player.y})')
        page.wait_for_timeout(40)
        assert page.evaluate('__world.shield && __world.effects.rapid>7 && __world.effects.spread>9')
        expect(page.locator('#weapons')).to_contain_text('SPREAD')
        assert page.evaluate('__world.enemies.filter(e=>e.boss).length===1 && __world.enemies.find(e=>e.boss).maxHp===15')
        assert page.evaluate('__audio.diagnostics.bpm===145 && __audio.diagnostics.voices<=12')
        page.evaluate('__world.bullets=[];__world.shotClock=__world.bossShotClock=__world.bossDiveClock=1e9;__world.invulnerable=0')
        for rapid, spread in ((8, 0), (0, 10), (8, 10), (1.8, 8), (8, 1.8), (0, 0)):
            page.evaluate('([r,s])=>{__world.effects.rapid=r;__world.effects.spread=s}', [rapid, spread])
            page.wait_for_timeout(40)
            assert page.evaluate('''() => {
              const c=document.querySelector('canvas'),r=c.getBoundingClientRect(),scale=Math.min(r.width/360,r.height/480);
              const x=(r.width-360*scale)/2+(__world.player.x+6)*scale;
              const y=(r.height-480*scale)/2+(__world.player.y+5)*scale;
              const pixel=c.getContext('2d').getImageData(Math.round(x*c.width/r.width),Math.round(y*c.height/r.height),1,1).data;
              const color=GalactixAppearance.weaponStyle(__world.effects,__world.time).hull;
              return [1,3,5].every((j,i)=>Math.abs(pixel[i]-parseInt(color.slice(j,j+2),16))<10);
            }'''), 'canvas hull color must follow active and flashing weapon effects'
        page.evaluate('__world.effects.rapid=8;__world.effects.spread=10;__world.bullets=[{x:__world.player.x+22,y:__world.player.y-30,speed:30}]')
        page.wait_for_timeout(40)
        page.screenshot(path='/tmp/galactix-v03-powered.png')
        page.evaluate('__world.effects.rapid=.02;__world.effects.spread=.02')
        expect(page.locator('#weapons')).to_have_text('')
        page.wait_for_timeout(100)
        # Exercise each new warning path in the real renderer, not just the headless engine.
        for pattern in ('file', 'kamikaze', 'boss'):
            page.evaluate('''kind => {
              __world.invulnerable=100;__world.bullets=[];
              __world.enemies.forEach(e=>{e.mode='formation';e.pattern=null;e.group=null;e.majorFired=false;});
              __world.config={...__world.config,fileChance:kind==='file'?1:0,kamikazeChance:kind==='kamikaze'?1:0};
              __world.shotClock=__world.bossShotClock=1e9;
              __world.diveClock=kind==='boss'?1e9:0;__world.bossDiveClock=kind==='boss'?0:1e9;
            }''', pattern)
            page.wait_for_function('kind=>__world.enemies.some(e=>e.pattern===kind && e.mode==="telegraph")', arg=pattern)
            page.screenshot(path=f'/tmp/galactix-v03-{pattern}-warning.png')
            assert page.evaluate('kind=>__world.enemies.filter(e=>e.pattern===kind).length', pattern) >= (3 if pattern == 'file' else 1)
            page.evaluate('''() => {for(let i=0;i<240;i++)Galactix.step(__world,1/120);}''')
            page.wait_for_timeout(30)
            assert page.evaluate('kind=>__world.enemies.some(e=>e.pattern===kind && e.mode==="dive")', pattern)
        page.evaluate('''() => {
          const b=__world.enemies.find(e=>e.boss);b.hp=1;b.mode='formation';b.pattern=null;
          b.x=b.homeX+Math.sin(__world.time*1.1)*__world.config.sway;b.y=b.homeY+Math.sin(__world.time*1.6+b.id*.4)*4;
          __world.enemies=[b];__world.shots=[{x:b.x,y:b.y+1,vx:0,vy:-440,action:{id:999,attempt:1,multiplier:1}}];
        }''')
        expect(page.locator('#menu-title')).to_have_text('Welcome home.')
        assert page.evaluate('__audioEvents.includes("bossDestroy") && __audioEvents.includes("finalVictory")')
        assert page.evaluate('__audio.diagnostics.fanfare==="finalVictory" && !__audio.diagnostics.timer && __audio.diagnostics.voices<=12')
        page.reload(); expect(page.locator('#best')).to_have_text('BEST 03000')
        expect(page.locator('#sound')).to_have_attribute('aria-pressed', 'true')
        page.locator('header a').click(); expect(page).to_have_url(ORIGIN + prefix)
        page.goto(ORIGIN + prefix + 'space-shooter/')
        page.locator('#sound').click()  # Reset the saved preference for the next path.
        cdp.detach()
        print('PASS: viewport layout, real two-finger/keyboard input, cancel, sound preference, pause, portrait, 30-sector UI, pickup HUD, best score and links at', prefix)
    assert not missing, missing
    assert not errors, errors
    context.close(); browser.close()
