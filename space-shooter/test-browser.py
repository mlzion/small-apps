"""Galactix real Chromium regressions. Local routed files, no server/network assets."""
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
    context.add_init_script("""{
      let engine,audioModule;
      Object.defineProperty(window,'Galactix',{get(){return engine},set(value){
        engine=value;for(const method of ['create','next','restart']){const original=value[method];value[method]=(...args)=>(window.__world=original(...args));}
      }});
      Object.defineProperty(window,'GalactixAudio',{get(){return audioModule},set(value){
        audioModule=value;const create=value.create;
        value.create=(...args)=>{const audio=create(...args);window.__audio=audio;window.__audioEvents=[];
          const play=audio.play;audio.play=cues=>{window.__audioEvents.push(...cues);play(cues);};return audio;};
      }});
      window.__pathDashCalls=0;const dash=CanvasRenderingContext2D.prototype.setLineDash;
      CanvasRenderingContext2D.prototype.setLineDash=function(value){if(value.length)window.__pathDashCalls++;return dash.call(this,value);};
    }""")
    page = context.new_page()
    def jump(level):
        if page.locator('#menu').is_hidden():
            page.locator('#pause').click()
        expect(page.locator('#level-select')).to_be_visible()
        page.locator('#level-select').select_option(str(level))
        page.locator('#action').click()
        expect(page.locator('#menu')).to_be_hidden()
    def summon():
        page.evaluate("""() => {
          const w=__world;w.invulnerable=100;w.config={...w.config,sway:0};
          w.diveClock=w.shotClock=w.bossMineClock=w.fieldMineClock=1e6;w.bullets=[];w.enemyMines=[];w.pickups=[];
          w.ordinaryKills=Math.ceil(w.ordinaryTotal/2)-1;
          w.enemies=w.enemies.filter(e=>!e.boss).slice(0,w.ordinaryTotal-w.ordinaryKills);
          w.enemies.forEach(e=>{e.mode='formation';e.x=e.homeX;e.y=e.homeY;});
          const v=w.enemies[0];v.hp=1;v.homeX=v.x=180;v.homeY=v.y=230;
          w.shots=[{x:v.x,y:v.y+1,vx:0,vy:-440,action:{id:900,attempt:1,multiplier:1}}];
        }""")
        page.wait_for_function('__world.bossStatus==="entering"')
        expect(page.locator('#boss-notice')).to_be_visible()
        assert page.evaluate('__audioEvents.includes("bossEnter")')
        page.wait_for_function('__world.enemies.some(e=>e.boss&&e.mode==="formation")', timeout=5000)
        page.evaluate('__world.bossShotClock=__world.bossDiveClock=__world.bossMineClock=1e6')
    for prefix in ('/', '/small-apps/'):
        page.goto(ORIGIN + prefix)
        page.evaluate("localStorage.setItem('galactix.best.v01','1234')")
        page.get_by_role('link', name='Launch Galactix').click()
        expect(page).to_have_url(ORIGIN + prefix + 'space-shooter/')
        expect(page.locator('#level-select option')).to_have_count(40)
        expect(page.locator('#best')).to_have_text('BEST 01234')
        expect(page.locator('#level')).to_have_text('01 / 40')
        expect(page.locator('#sound')).to_have_count(0)
        assert page.evaluate('__audio.diagnostics.voices===0 && __world.campaign.unlocked.length===0')
        for width, height in ((320, 568), (375, 812), (390, 844), (430, 932)):
            page.set_viewport_size({'width': width, 'height': height})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight')
            field, pad, fire = [page.locator(s).bounding_box() for s in ('#field', '#drag-pad', '#fire')]
            assert field['height'] > 200 and field['y'] + field['height'] <= pad['y']
            assert pad['y'] == fire['y'] and fire['y'] + fire['height'] <= height
            assert page.locator('#action').evaluate('el=>el.getBoundingClientRect().top>=document.querySelector("#field").getBoundingClientRect().top')
            page.screenshot(path=f'/tmp/galactix-v04-menu-{width}.png')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.locator('#action').click()
        page.wait_for_function('__audio.diagnostics.background')
        assert page.evaluate('__audio.diagnostics.rate===.7 && __audio.diagnostics.voices===2')
        pad, fire = [page.locator(s).bounding_box() for s in ('#drag-pad', '#fire')]
        def point(box, ident):
            return {'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2, 'id': ident}
        left, right = point(pad, 1), point(fire, 2)
        cdp = context.new_cdp_session(page)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [left, right]})
        page.wait_for_timeout(80)
        count = page.evaluate('__world.actionId')
        assert count > 0
        x = page.evaluate('__world.player.x')
        left['x'] += 32
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [left, right]})
        page.wait_for_timeout(100)
        assert page.evaluate('__world.player.x') > x + 20
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchCancel', 'touchPoints': []})
        assert not page.locator('#fire').evaluate('el=>el.classList.contains("active")')
        assert not page.locator('#drag-pad').evaluate('el=>el.classList.contains("active")')
        page.wait_for_timeout(60)
        count = page.evaluate('__world.actionId')
        page.wait_for_timeout(400)
        assert page.evaluate('__world.actionId') == count
        page.keyboard.down('ArrowLeft'); page.keyboard.down('Space'); page.wait_for_timeout(100)
        page.keyboard.up('ArrowLeft'); page.keyboard.up('Space')
        assert page.evaluate('__world.actionId') > count
        jump(6)
        assert page.evaluate('Galactix.equip(__world,"rapid")')
        page.keyboard.press('p')
        expect(page.locator('#menu-title')).to_have_text('Flight paused')
        frozen = page.evaluate('[__world.time,__world.weapon.remaining]')
        page.wait_for_timeout(180)
        assert page.evaluate('[__world.time,__world.weapon.remaining]') == frozen
        assert page.evaluate('!__audio.diagnostics.background && __audio.diagnostics.voices===0')
        expect(page.locator('#level-select')).to_be_visible()
        page.locator('#action').click()
        page.set_viewport_size({'width': 844, 'height': 390})
        expect(page.locator('#orientation-overlay')).to_be_visible()
        page.wait_for_timeout(40); time = page.evaluate('__world.time'); page.wait_for_timeout(120)
        assert page.evaluate('__world.time') == time
        assert page.evaluate('!__audio.diagnostics.background && __audio.diagnostics.voices===0')
        page.set_viewport_size({'width': 390, 'height': 844})
        expect(page.locator('#menu-title')).to_have_text('Flight paused')
        page.locator('#action').click()
        page.wait_for_function('__audio.diagnostics.background')
        for level, expected in ((6, ['rapid']), (11, ['rapid','spread']), (16, ['rapid','spread','double']), (21, ['rapid','spread','double','laser']), (26, ['rapid','spread','double','laser','mine']), (40, ['rapid','spread','double','laser','mine'])):
            jump(level)
            assert page.evaluate('__world.campaign.unlocked') == expected
            assert page.evaluate('__world.dropPool') == expected
            assert page.evaluate('__world.weapon.kind') == 'normal'
        jump(20)
        assert page.evaluate('__world.bossStatus==="pending" && !__world.enemies.some(e=>e.boss)')
        summon()
        assert page.evaluate('__world.enemies.find(e=>e.boss).maxHp===18')
        page.screenshot(path='/tmp/galactix-v04-boss.png')
        # Hold two touch points and Space across a real boss-killing hit.
        left, right = point(page.locator('#drag-pad').bounding_box(), 1), point(page.locator('#fire').bounding_box(), 2)
        cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[left,right]})
        page.keyboard.down('Space')
        page.evaluate("""() => {
          const w=__world,b=w.enemies.find(e=>e.boss),keep=w.enemies.find(e=>!e.boss);
          keep.homeX=keep.x=300;keep.homeY=keep.y=100;keep.mode='formation';
          b.hp=1;w.enemies=[b,keep];w.shots=[{x:b.x,y:b.y+1,vx:0,vy:-440,action:{id:999,attempt:1,multiplier:1}}];
        }""")
        page.wait_for_function('__world.state==="celebrating"')
        expect(page.locator('#celebration')).to_be_visible()
        expect(page.locator('#reward-title')).to_have_text('NEW POWER-UP ACHIEVED!')
        expect(page.locator('#reward-name')).to_have_text('Laser')
        assert page.evaluate('__world.weapon.kind==="laser" && __world.weapon.charges===1')
        frozen = page.evaluate('JSON.stringify([__world.time,__world.player,__world.enemies,__world.shots,__world.bullets,__world.weapon])')
        action_count = page.evaluate('__world.actionId')
        page.wait_for_timeout(300)
        assert page.evaluate('JSON.stringify([__world.time,__world.player,__world.enemies,__world.shots,__world.bullets,__world.weapon])') == frozen
        assert page.evaluate('!__audio.diagnostics.background')
        page.screenshot(path='/tmp/galactix-v04-unlock.png')
        page.keyboard.down('Space')  # auto-repeat, not a new press
        left['x'] += 20
        cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[left,right]})
        page.wait_for_function('__world.state==="playing"', timeout=4000)
        page.wait_for_timeout(80)
        assert page.evaluate('__world.weapon.charges===1 && __world.weapon.kind==="laser"')
        assert page.evaluate('__world.actionId') == action_count
        assert page.evaluate('__audioEvents.filter(x=>x==="laser").length===0')
        page.keyboard.up('Space')
        cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
        cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[right]})
        page.wait_for_function('__world.beam!==null')
        assert page.evaluate('__world.weapon.kind==="normal"')
        cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
        page.wait_for_timeout(280)
        assert page.evaluate('__world.beam===null && __audioEvents.filter(x=>x==="laser").length===1')
        jump(1)
        for level in range(1, 41):
            assert page.evaluate('__world.level') == level
            page.evaluate('__world.state="cleared";__world.score=100')
            expect(page.locator('#action')).to_have_text('Fly again →' if level == 40 else 'Next sector →')
            page.locator('#action').click()
        assert page.evaluate('__world.level===1 && __world.campaign.unlocked.length===0')
        jump(40)
        page.evaluate('__world.invulnerable=0;__world.diveClock=__world.shotClock=__world.fieldMineClock=1e6')
        for kind in ('rapid','spread','double','laser','mine','normal'):
            page.evaluate('kind=>{if(kind==="normal")__world.weapon={kind:"normal",remaining:0,charges:0};else Galactix.equip(__world,kind)}', kind)
            page.wait_for_timeout(40)
            assert page.evaluate("""() => {
              const c=document.querySelector('#field > canvas'),r=c.getBoundingClientRect(),scale=Math.min(r.width/360,r.height/480);
              const x=(r.width-360*scale)/2+(__world.player.x+6)*scale,y=(r.height-480*scale)/2+(__world.player.y+5)*scale;
              const pixel=c.getContext('2d').getImageData(Math.round(x*c.width/r.width),Math.round(y*c.height/r.height),1,1).data;
              const color=GalactixAppearance.weaponStyle(__world.weapon).hull;
              return [1,3,5].every((j,i)=>Math.abs(pixel[i]-parseInt(color.slice(j,j+2),16))<10);
            }"""), 'hull must show exactly the equipped weapon color'
        page.evaluate('__world.pickups=[{kind:"double",x:90,y:220,age:0},{kind:"laser",x:180,y:220,age:0},{kind:"mine",x:270,y:220,age:0}];Galactix.equip(__world,"double")')
        page.wait_for_timeout(40); page.screenshot(path='/tmp/galactix-v04-pickups.png')
        page.evaluate('__world.weapon.remaining=.02')
        expect(page.locator('#weapons')).to_have_text('')
        summon()
        for pattern in ('file','kamikaze','boss'):
            page.evaluate("""kind => {
              const w=__world;w.invulnerable=100;w.bullets=[];
              w.enemies.forEach(e=>{e.mode='formation';e.pattern=null;e.group=null;e.majorFired=false;});
              w.config={...w.config,fileChance:kind==='file'?1:0,kamikazeChance:kind==='kamikaze'?1:0};
              w.shotClock=w.bossShotClock=w.bossMineClock=w.fieldMineClock=1e6;
              w.diveClock=kind==='boss'?1e6:0;w.bossDiveClock=kind==='boss'?0:1e6;
            }""", pattern)
            page.wait_for_function('kind=>__world.enemies.some(e=>e.pattern===kind&&e.mode==="telegraph")', arg=pattern, timeout=5000)
            page.screenshot(path=f'/tmp/galactix-v04-{pattern}-warning.png')
            assert page.evaluate('__pathDashCalls') == 0
            page.evaluate('for(let i=0;i<240;i++)Galactix.step(__world,1/120)')
            page.wait_for_timeout(30)
        page.evaluate("""() => {
          const b=__world.enemies.find(e=>e.boss);b.hp=10;__world.bossMineClock=0;
        }""")
        page.wait_for_function('__world.enemyMines.length>0')
        page.evaluate('__world.enemyMines.forEach(m=>{m.x=m.lane;m.y=340;m.warning=true;m.fuse=.9})')
        page.wait_for_timeout(40); page.screenshot(path='/tmp/galactix-v04-enemy-mines.png')
        assert page.evaluate('__world.enemyMines.length<=2 && __audio.diagnostics.rate===2.5 && __audio.diagnostics.voices<=12')
        page.evaluate("""() => {
          const w=__world,b=w.enemies.find(e=>e.boss);b.hp=1;b.mode='formation';b.pattern=null;
          b.x=GalactixAttacks.homeX(w,b);b.y=b.homeY+Math.sin(w.time*1.6+b.id*.4)*4;
          w.enemies=[b];w.bossDiveClock=w.bossShotClock=w.bossMineClock=1e6;
          w.shots=[{x:b.x,y:b.y+1,vx:0,vy:-440,action:{id:1001,attempt:1,multiplier:1}}];
        }""")
        expect(page.locator('#reward-title')).to_have_text('BOSS DEFEATED!')
        assert page.evaluate('__world.state==="celebrating" && __world.announcement.bonus===3000 && !__audio.diagnostics.background')
        expect(page.locator('#menu-title')).to_have_text('Galaxy secured!', timeout=5000)
        assert page.evaluate('__audioEvents.includes("bossReward") && __audioEvents.includes("finalVictory") && __audio.diagnostics.fanfare==="finalVictory" && !__audio.diagnostics.background')
        assert page.evaluate('__pathDashCalls') == 0
        page.screenshot(path='/tmp/galactix-v04-final.png')
        score = page.evaluate('__world.score')
        expect(page.locator('#best')).to_have_text('BEST ' + str(score).zfill(5))
        page.reload(); expect(page.locator('#best')).to_have_text('BEST ' + str(score).zfill(5))
        expect(page.locator('#sound')).to_have_count(0)
        assert page.evaluate('__audio.diagnostics.voices===0')
        page.locator('header a').click(); expect(page).to_have_url(ORIGIN + prefix)
        cdp.detach()
        print('PASS: real portrait/two-finger/keyboard controls, 40-sector selector/sequential UI, jump unlocks, delayed bosses, frozen unlock/fresh fire, weapon pixels, no dashed paths, mines, continuous audio, final celebration and persistence at', prefix)
    assert not missing, missing
    assert not errors, errors
    context.close(); browser.close()
