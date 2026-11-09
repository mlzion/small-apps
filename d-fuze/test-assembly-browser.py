from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium')
    errors=[]
    def serve(route):
        path=urlsplit(route.request.url).path.removeprefix('/small-apps')
        f=ROOT/path.lstrip('/')
        if f.is_dir():f/='index.html'
        route.fulfill(path=str(f),content_type={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'}.get(f.suffix,'text/plain'))
    ctx=browser.new_context(viewport={'width':375,'height':812},is_mobile=True,has_touch=True)
    ctx.route('http://app-lab.test/**',serve);ctx.on('weberror',lambda e:errors.append(str(e)))
    page=ctx.new_page();page.goto('http://app-lab.test/small-apps/d-fuze/builder/')
    page.locator('#access-code').fill('FUSE-LAB-3');page.get_by_role('button',name='OPEN LEVEL BUILDER').tap()
    page.locator('#reload-published').tap();expect(page.locator('#level-table tbody tr')).to_have_count(12)
    assert page.evaluate('current().timer')==48
    page.locator('#motion-mode').select_option('assembly')
    # An invalid key disables testing/export without crashing the animation preview.
    field=page.get_by_role('spinbutton',name='Motion key 2 time',exact=True)
    field.fill('0');field.press('Tab');expect(page.locator('#test-level')).to_be_disabled()
    expect(page.locator('#errors')).to_contain_text('increasing')
    field.fill('5');field.press('Tab');expect(page.locator('#test-level')).to_be_enabled()
    page.locator('#motion-mode').select_option('assembly')
    page.locator('#motion-new').tap();new_id=page.locator('#motion-profile').input_value()
    expect(page.locator('#motion-keys tr')).to_have_count(2)
    page.locator('#motion-delete').tap()
    assert not page.evaluate('(id)=>doc.assemblyProfiles.some(p=>p.id===id)',new_id)
    page.locator('#motion-duplicate').tap()
    custom=page.locator('#motion-profile').input_value()
    page.locator('#motion-keys tr').nth(0).get_by_role('button',name='INSERT AFTER').tap()
    expect(page.locator('#motion-keys tr')).to_have_count(7)
    page.screenshot(path='/tmp/assembly-editor-phone.png',full_page=True)
    # v1 browser draft upgrade preserves values and constant-speed behavior.
    legacy=page.evaluate("const old=JSON.parse(JSON.stringify(doc));old.version=1;delete old.assemblyProfiles;delete old.ringProfiles;old.levels.forEach(l=>{l.assembly={enabled:false};l.playbackSpeed=1;l.rings.forEach(r=>{r.family=l.motionFamily;r.profiles=DFuzeExperimentalMotion.eligible(r.family).slice(0,5).map(p=>p.id)});delete l.motionFamily;});old.levels[0].timer=91;old.levels[0].assembly={enabled:true,speed:15};old")
    import json
    page.locator('#import-json').set_input_files({'name':'legacy.json','mimeType':'application/json','buffer':json.dumps(legacy).encode()})
    expect(page.locator('#status')).to_contain_text('JSON imported')
    assert page.evaluate('current().timer')==91
    assert page.evaluate('doc.version')==4
    assert page.evaluate('current().assembly.profileId').startswith('migrated-constant')
    editor=page
    with page.expect_popup() as popup:
        page.locator('#test-level').tap()
    page=popup.value
    page.get_by_role('button',name='START TEST').tap()
    page.wait_for_timeout(100);assert page.evaluate('game.assembly.angle')>0
    page.keyboard.press('Escape');frozen=page.evaluate('[game.elapsed,game.assembly.time,game.assembly.angle]')
    page.wait_for_timeout(100);assert page.evaluate('[game.elapsed,game.assembly.time,game.assembly.angle]')==frozen
    page.get_by_role('button',name='RETURN TO EDITOR',exact=True).tap();page=editor;expect(page.locator('#builder')).to_be_visible();assert page.evaluate('current().timer')==91
    # Published corruption must surface an error, never a substituted level.
    broken=browser.new_context();broken.on('weberror',lambda e:errors.append(str(e)))
    def bad(route):
        if urlsplit(route.request.url).path.endswith('/published-levels.json'):
            data=json.loads((ROOT/'d-fuze/published-levels.json').read_text());data['levels'][0]['timer']=0;route.fulfill(body=json.dumps(data),content_type='application/json')
        else:serve(route)
    broken.route('http://app-lab.test/**',bad)
    invalid=broken.new_page();invalid.goto('http://app-lab.test/small-apps/d-fuze/')
    expect(invalid.locator('#message')).to_have_text('CONFIGURATION ERROR')
    expect(invalid.locator('#detail')).to_contain_text('Timer')
    assert invalid.evaluate('game') is None
    assert not errors,errors
    print('PASS: mobile assembly key validation/insert/new/delete, published document load, v1 JSON file migration, real Test Mode parent/pause/return, invalid published data visible error/no fallback')
    browser.close()
