"""Shared six-profile schedule across Builder preview and real Test Mode."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium')
    errors=[]
    for width,height,prefix in [(375,812,'/small-apps/'),(1440,1000,'/')]:
        ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<500,has_touch=True,accept_downloads=True)
        def serve(route):
            path=urlsplit(route.request.url).path.removeprefix('/small-apps');file=ROOT/path.lstrip('/')
            if file.is_dir():file/='index.html'
            assert file.is_file(),path
            route.fulfill(path=str(file),content_type={'.json':'application/json','.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'}.get(file.suffix,'text/plain'))
        ctx.route('http://app-lab.test/**',serve);ctx.on('weberror',lambda e:errors.append(str(e)))
        editor=ctx.new_page();editor.goto('http://app-lab.test'+prefix+'d-fuze/builder/')
        editor.locator('#access-code').fill('FUSE-LAB-3');editor.get_by_role('button',name='OPEN LEVEL BUILDER').click()
        expect(editor.locator('[aria-label$=" family"]')).to_have_count(1)
        assert editor.get_by_role('spinbutton',name='Level 1 Playback ×',exact=True).count()==0
        for id in ['motion-new','motion-duplicate','motion-delete']:expect(editor.locator('#'+id)).to_be_hidden()
        first=editor.locator('#motion-keys tr').first
        for field in first.locator('input').all():expect(field).to_have_attribute('readonly','')
        expect(first.get_by_role('button',name='DELETE KEY')).to_be_disabled()
        assert editor.evaluate('doc.ringProfiles.length')==18
        editor.get_by_role('button',name='EDIT 10',exact=True).click()
        editor.get_by_role('combobox',name='Level motion family',exact=True).select_option('hard')
        editor.locator('#level-seed').fill('12345');editor.locator('#level-seed').press('Tab')
        with editor.expect_popup() as event:editor.locator('#test-level').click()
        test=event.value;test.get_by_role('button',name='START TEST',exact=True).click()
        previous=None
        for t in [0,9.999,10,10.001,19.999,20,20.001,49.999,50,59.999,60,70.2,100.1]:
            preview=editor.evaluate('''t=>{previewTime=t;drawLevel();return {ids:previewProfiles.map(p=>p.id),
              angles:previewProfiles.map(p=>DFuzeExperimentalMotion.sampleProfile(p,t))};}''',t)
            actual=test.evaluate('''t=>{game.elapsed=t;game.updateRings();return {ids:game.rings.map(r=>r.profile.id),angles:game.rings.map(r=>r.relativeAngle)};}''',t)
            assert preview==actual
            assert len(set(actual['ids']))==4
            assert all(id.startswith('hard-') for id in actual['ids'])
            if previous and int(t//10)==previous[0]+1:assert all(a!=b for a,b in zip(previous[1],actual['ids']))
            previous=(int(t//10),actual['ids'])
        test.evaluate("game.pause()")
        frozen=test.evaluate('JSON.stringify([game.elapsed,game.assembly.angle,game.rings.map(r=>[r.profile.id,r.displayAngle])])')
        test.wait_for_timeout(100)
        assert test.evaluate('JSON.stringify([game.elapsed,game.assembly.angle,game.rings.map(r=>[r.profile.id,r.displayAngle])])')==frozen
        test.get_by_role('button',name='RETURN TO EDITOR',exact=True).click()
        # Explicit legacy import preserves balance and inserts one sixth profile per family.
        legacy=editor.evaluate("({...JSON.parse(JSON.stringify(doc)),version:3})")
        legacy['levels']=json.loads((ROOT/'d-fuze/test-fixtures/levels-v3.json').read_text())
        legacy['ringProfiles']=[p for p in legacy['ringProfiles'] if not p['id'].endswith('-06')]
        editor.locator('#import-json').set_input_files({'name':'v3.json','mimeType':'application/json','buffer':json.dumps(legacy).encode()})
        expect(editor.locator('#status')).to_contain_text('strongest legacy ring family')
        expect(editor.locator('#status')).to_contain_text('Added sixth hard profile')
        assert editor.evaluate('doc.version')==4
        with editor.expect_download() as event:editor.locator('#publish').click()
        exported=json.loads(Path(event.value.path()).read_text());assert exported['version']==4
        assert all('playbackSpeed' not in l and 'motionFamily' in l and all('family' not in r for r in l['rings']) for l in exported['levels'])
        assert len(exported['ringProfiles'])==18
        # Assembly retains its independent rate and profile management controls.
        editor.locator('#motion-mode').select_option('assembly')
        expect(editor.locator('#motion-new')).to_be_visible()
        expect(editor.locator('#assembly-rate')).to_be_visible()
        assert editor.evaluate('document.documentElement.scrollWidth<=innerWidth')
        ctx.close()
    assert not errors,errors
    print('PASS: single level family/no ring rate or ring creation/deletion; six editable profiles/family and locked zero start; preview/Test Mode seeded shuffle and exact boundaries across cycles; pause; explicit v3 migration/complete v4 JSON; assembly editing preserved; Android-sized and desktop/root/Pages')
    browser.close()
