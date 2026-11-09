"""Phase 5: real multi-ring play, growing configuration, snapshots and Test Mode."""
import json
import math
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
SOURCE=json.loads((ROOT/'d-fuze/published-levels.json').read_text())
# Actual ray shots through shared geometric holds. Only aim/time are driven by
# the test; damage, ammo, target selection and effects use the production engine.
WIN="""() => {
  let index=0, sequence=[], beams=[];
  while(game.state==='PLAYING') {
    const local=4.6+Math.floor(index/2)*5+(index%2)*.3;
    game.update(local/game.config.animationPlaybackSpeed-game.elapsed);
    game.angle=game.rings.at(-1).displayAngle;
    const before=game.rings.map(r=>r.gate.health), health=game.health;
    const ammo=game.ammo;
    if(!game.fire())throw Error('Shot was not ready');
    const changed=game.rings.findIndex((r,i)=>r.gate.health!==before[i]);
    if(game.ammo!==ammo-1)throw Error('Wrong shot consumption');
    if(changed>=0 && game.health!==health)throw Error('Two targets damaged');
    if(changed>=0 && before.some((h,i)=>i>changed && h>0))throw Error('Inner damage through intact outer gate');
    const radius=Math.hypot(game.lastShot.point.x,game.lastShot.point.y);
    const expected=changed>=0?game.rings[changed].radius+4:75;
    if(Math.abs(radius-expected)>1e-7)throw Error('Incorrect beam endpoint');
    sequence.push(changed>=0?changed+1:'bomb');beams.push(radius);index++;
    if(index>200)throw Error('No completion');
  }
  if(game.state!=='DEFUSING')throw Error('Level failed');
  game.update(1);return {sequence,beams};
}"""

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium')
    errors=[]
    for prefix,viewport in [('/',{'width':1440,'height':1000}),('/small-apps/',{'width':375,'height':812})]:
        published=json.loads(json.dumps(SOURCE))
        ctx=browser.new_context(viewport=viewport,is_mobile=viewport['width']<500,has_touch=True,accept_downloads=True)
        def serve(route):
            path=urlsplit(route.request.url).path.removeprefix('/small-apps')
            if path.endswith('/published-levels.json'):
                route.fulfill(body=json.dumps(published),content_type='application/json');return
            file=ROOT/path.lstrip('/')
            if file.is_dir():file/='index.html'
            assert file.is_file(),path
            route.fulfill(path=str(file),content_type={'.json':'application/json','.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'}.get(file.suffix,'text/plain'))
        ctx.route('http://app-lab.test/**',serve);ctx.on('weberror',lambda e:errors.append(str(e)))
        normal=ctx.new_page();normal.goto('http://app-lab.test'+prefix+'d-fuze/')
        normal.get_by_role('button',name='PLAY',exact=True).click()
        assert normal.evaluate('game.levelCount')==12
        for number in [7,10,12]:
            normal.evaluate('(n)=>{game.level=n;game.startLevel()}',number)
            count=3 if number==7 else 4
            assert normal.evaluate('game.rings.length')==count
            initial=normal.evaluate('game.rings.map(r=>r.gate.health)')
            normal.evaluate('game.angle=game.rings.at(-1).displayAngle')
            if viewport['width']<500:normal.locator('[data-control=fire]').tap()
            else:normal.keyboard.press('Space')
            after=normal.evaluate('game.rings.map(r=>r.gate.health)')
            assert after==initial[:-1]+[initial[-1]-1]
            normal.evaluate('game.startLevel();game.angle=game.rings.at(-1).displayAngle+Math.PI;game.fire()')
            assert normal.evaluate('game.lastShot.kind')=='wall'
            assert math.isclose(normal.evaluate('Math.hypot(game.lastShot.point.x,game.lastShot.point.y)'),108+(count-1)*30+4,abs_tol=1e-6)
            result=normal.evaluate(WIN)
            expected=[]
            for ring in reversed(SOURCE['levels'][number-1]['rings']):expected += [ring['number']]*ring['gateHealth']
            expected += ['bomb']*SOURCE['levels'][number-1]['bombHealth']
            assert result['sequence']==expected
            expect(normal.locator('#message')).to_have_text('BOMB D::FUZED!')
            if number<12:expect(normal.get_by_role('button',name='PLAY NEXT LEVEL',exact=True)).to_be_visible()
            else:
                expect(normal.locator('#detail')).to_contain_text('All 12 available levels complete')
                expect(normal.get_by_role('button',name='PLAY NEXT LEVEL',exact=True)).to_have_count(0)
        normal.evaluate('game.level=10;game.startLevel();game.fail();game.update(1.3)')
        normal.get_by_role('button',name='RETRY LEVEL',exact=True).click()
        assert normal.evaluate('game.rings.map(r=>r.gate.health)')==[2]*4
        assert normal.evaluate('game.lives')==2
        # Four rings keep the existing portrait controls, geometry and orientation pause.
        if viewport['width']<500:
            for w,h in [(320,480),(375,812),(412,915)]:
                normal.set_viewport_size({'width':w,'height':h})
                for selector in ['canvas','[data-control=fire]','[data-control=ccw]','[data-control=cw]']:
                    box=normal.locator(selector).bounding_box()
                    assert box['x']>=0 and box['x']+box['width']<=w+1
                    assert box['y']>=0 and box['y']+box['height']<=h+1
                assert normal.evaluate('document.documentElement.scrollWidth<=innerWidth')
                normal.screenshot(path=f'/tmp/d-fuze-four-rings-{w}.png')
            normal.set_viewport_size({'width':812,'height':375})
            expect(normal.locator('#orientation-overlay')).to_be_visible()
            assert normal.evaluate('game.state')=='PAUSED'
            frozen=normal.evaluate('JSON.stringify([game.remaining,game.ammo,game.lives,game.elapsed,game.rings.map(r=>[r.displayAngle,r.gate.health])])')
            normal.wait_for_timeout(150)
            assert normal.evaluate('JSON.stringify([game.remaining,game.ammo,game.lives,game.elapsed,game.rings.map(r=>[r.displayAngle,r.gate.health])])')==frozen
            normal.set_viewport_size({'width':375,'height':812})
            expect(normal.locator('#orientation-overlay')).to_be_hidden()
            assert normal.evaluate('game.state')=='PAUSED'
            normal.locator('#actions').get_by_role('button',name='RESUME',exact=True).tap()
            assert normal.evaluate('game.state')=='PLAYING'
        editor=ctx.new_page();editor.goto('http://app-lab.test'+prefix+'d-fuze/builder/')
        editor.locator('#access-code').fill('FUSE-LAB-3');editor.get_by_role('button',name='OPEN LEVEL BUILDER').click()
        expect(editor.locator('#level-table tbody tr')).to_have_count(12)
        editor.locator('#add-level').click()
        expect(editor.locator('#level-table tbody tr')).to_have_count(13)
        editor.get_by_role('spinbutton',name='Level 13 Rings',exact=True).fill('4')
        editor.get_by_role('spinbutton',name='Level 13 Rings',exact=True).press('Tab')
        editor.get_by_role('spinbutton',name='Level 13 Timer (s)',exact=True).fill('111')
        editor.get_by_role('spinbutton',name='Level 13 Timer (s)',exact=True).press('Tab')
        for i,width in enumerate([10,60,120,20],1):
            editor.get_by_role('combobox',name=f'Ring {i} gate width',exact=True).select_option(str(width))
        editor.locator('#level-name').fill('Experimental Level 13')
        seed=editor.evaluate('current().seed')
        with editor.expect_popup() as event:editor.locator('#test-level').click()
        test=event.value;test.get_by_role('button',name='START TEST',exact=True).click()
        assert test.evaluate('[game.testMode,game.level,game.rings.length,game.config.time,game.seed]')==[True,13,4,111,seed]
        snapshot=test.evaluate('game.rings.map(r=>r.profile.id)')
        editor.get_by_role('spinbutton',name='Level 13 Timer (s)',exact=True).fill('112')
        editor.get_by_role('spinbutton',name='Level 13 Timer (s)',exact=True).press('Tab')
        test.evaluate('game.fail();game.update(1.3)')
        test.get_by_role('button',name='RETRY LEVEL',exact=True).click()
        assert test.evaluate('game.config.time')==111
        assert test.evaluate('game.rings.map(r=>r.profile.id)')==snapshot
        test.evaluate(WIN)
        expect(test.get_by_role('button',name='PLAY NEXT LEVEL',exact=True)).to_have_count(0)
        test.evaluate('game.nextLevel()');assert test.evaluate('game.level')==13
        test.get_by_role('button',name='RETURN TO EDITOR',exact=True).click()
        expect(editor.locator('#level-name')).to_have_value('Experimental Level 13')
        assert editor.evaluate('current().timer')==112
        with editor.expect_download() as event:editor.locator('#publish').click()
        thirteen=json.loads(Path(event.value.path()).read_text())
        assert len(thirteen['levels'])==13 and thirteen['levels'][12]['timer']==112
        expect(editor.locator('#status')).to_contain_text('NOT LIVE')
        published=thirteen
        newer=ctx.new_page();newer.goto('http://app-lab.test'+prefix+'d-fuze/')
        newer.get_by_role('button',name='PLAY',exact=True).click()
        assert newer.evaluate('game.levelCount')==13
        newer.evaluate("game.level=13;game.startLevel();game.transition('LEVEL_COMPLETE')")
        expect(newer.locator('#detail')).to_contain_text('All 13 available levels complete')
        assert newer.evaluate('game.config.time')==112
        # An existing game still uses the original complete source snapshot.
        normal.evaluate('game.newGame()');assert normal.evaluate('game.levelCount')==12
        for _ in range(7):editor.locator('#add-level').click()
        expect(editor.locator('#level-table tbody tr')).to_have_count(20)
        editor.locator('#duplicate-level').click();expect(editor.locator('#level-table tbody tr')).to_have_count(21)
        editor.locator('#move-up').click();editor.locator('#move-down').click();editor.locator('#delete-level').click()
        assert editor.evaluate('doc.levels.every((l,i)=>l.number===i+1)')
        with editor.expect_download() as event:editor.locator('#publish').click()
        published=json.loads(Path(event.value.path()).read_text());assert len(published['levels'])==20
        twenty=ctx.new_page();twenty.goto('http://app-lab.test'+prefix+'d-fuze/')
        twenty.get_by_role('button',name='PLAY',exact=True).click()
        for number in range(1,21):
            assert twenty.evaluate('game.level')==number
            twenty.evaluate("game.transition('LEVEL_COMPLETE')")
            if number<20:twenty.get_by_role('button',name='PLAY NEXT LEVEL',exact=True).click()
        expect(twenty.locator('#detail')).to_contain_text('All 20 available levels complete')
        expect(twenty.get_by_role('button',name='PLAY NEXT LEVEL',exact=True)).to_have_count(0)
        ctx.close()
    assert not errors,errors
    assert json.loads((ROOT/'d-fuze/published-levels.json').read_text())==SOURCE
    print('PASS: real three/four-ring keyboard/touch play and outside-in wins/beam endpoints, retry, small-phone geometry/orientation pause, Level 13 Add/Test snapshot/retry/return/no advance, complete 13/20-level downloads installed through normal loader, 20-level UI progression, original-session isolation, editor row operations, both hosting paths')
    browser.close()
