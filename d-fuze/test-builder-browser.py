"""Local Chromium integration: editor UI, data transfer, real game Test Mode."""
import csv
import io
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium')
    errors, missing = [], []
    def serve(route):
        path=urlsplit(route.request.url).path
        if path.startswith('/small-apps/'): path=path[len('/small-apps'):]
        file=ROOT/path.lstrip('/')
        if file.is_dir(): file/='index.html'
        if not file.is_file(): missing.append(path);route.fulfill(status=404);return
        route.fulfill(path=str(file),content_type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}.get(file.suffix,'text/plain'))
    def context(**kwargs):
        ctx=browser.new_context(accept_downloads=True,**kwargs)
        ctx.route('http://app-lab.test/**',serve)
        ctx.on('weberror',lambda e:errors.append(str(e)))
        return ctx
    ctx=context(viewport={'width':1440,'height':1000})
    page=ctx.new_page()
    for prefix in ['/', '/small-apps/']:
        page.goto('http://app-lab.test'+prefix)
        page.get_by_role('button',name='Developer Tools',exact=True).click()
        expect(page).to_have_url('http://app-lab.test'+prefix+'d-fuze/builder/')
        if page.locator('#access-dialog').is_visible():
            expect(page.locator('#builder')).to_be_hidden()
            page.locator('#access-code').fill('wrong')
            page.get_by_role('button',name='OPEN LEVEL BUILDER').click()
            expect(page.locator('#access-error')).to_contain_text('not recognized')
            page.locator('#access-code').fill('FUSE-LAB-3')
            page.get_by_role('button',name='OPEN LEVEL BUILDER').click()
        expect(page.locator('#builder')).to_be_visible()
        expect(page.locator('#level-table tbody tr')).to_have_count(12)
        page.locator('#level-name').fill('Unsaved <ring> & draft')
        timer=page.get_by_role('spinbutton',name='Level 1 Timer (s)',exact=True)
        timer.fill('72');timer.press('Tab')
        assert page.evaluate('current().timer')==72
        # Numeric errors disable testing/export, then recover without losing the row.
        timer=page.get_by_role('spinbutton',name='Level 1 Timer (s)',exact=True)
        timer.fill('0');timer.press('Tab')
        expect(page.locator('#errors')).to_contain_text('Timer')
        expect(page.locator('#test-level')).to_be_disabled()
        timer=page.get_by_role('spinbutton',name='Level 1 Timer (s)',exact=True)
        timer.fill('72');timer.press('Tab')
        expect(page.locator('#test-level')).to_be_enabled()
        page.get_by_role('combobox',name='Ring 1 family').select_option('medium')
        checkboxes=page.locator('#ring-editor input[type=checkbox]')
        expect(checkboxes).to_have_count(5)
        for i in range(4): checkboxes.nth(i).uncheck()
        checkboxes.nth(4).click()
        expect(checkboxes.nth(4)).to_be_checked()
        expect(page.locator('#status')).to_contain_text('at least one')
        # Restore all eligible profiles with a deliberate family change.
        page.get_by_role('combobox',name='Ring 1 family').select_option('hard')
        page.get_by_role('combobox',name='Ring 1 family').select_option('easy')
        assert page.locator('#ring-editor input:checked').count()==5
        page.locator('#profile-family').select_option('hard')
        expect(page.locator('#profile-title')).to_contain_text('Hard 1 of 5')
        page.get_by_role('button',name='Next profile',exact=True).click()
        expect(page.locator('#profile-title')).to_contain_text('Hard 2 of 5')
        page.get_by_role('button',name='Previous profile',exact=True).click()
        page.locator('#profile-play').click();page.wait_for_timeout(150)
        assert page.evaluate('profileTime')>0
        page.locator('#profile-play').click()
        page.locator('#profile-time').evaluate("el=>{el.value=4.75;el.dispatchEvent(new Event('input',{bubbles:true}));}")
        expect(page.locator('#profile-readout')).to_have_text('4.75s / 0.0°')
        assert len(page.locator('#profile-graph').evaluate('el=>el.toDataURL()'))>3000
        page.locator('#save-draft').click()
        expect(page.locator('#status')).to_contain_text('only in this browser')
        page.locator('#level-name').fill('temporary change')
        page.locator('#load-draft').click()
        expect(page.locator('#level-name')).to_have_value('Unsaved <ring> & draft')
        # Downloads contain actual settings and schema metadata.
        with page.expect_download() as event: page.locator('#export-json').click()
        exported=json.loads(Path(event.value.path()).read_text())
        assert exported['version']==1 and len(exported['levels'])==12
        assert exported['levels'][0]['timer']==72
        with page.expect_download() as event: page.locator('#export-csv').click()
        rows=list(csv.reader(io.StringIO(Path(event.value.path()).read_text())))
        assert len(rows)==13 and 'ringCount' in rows[0]
        old=page.evaluate('JSON.stringify(doc)')
        bad=json.dumps({'version':99}).encode()
        page.locator('#import-json').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':bad})
        expect(page.locator('#status')).to_contain_text('Import rejected')
        assert page.evaluate('JSON.stringify(doc)')==old
        page.locator('#import-json').set_input_files({'name':'levels.json','mimeType':'application/json','buffer':json.dumps(exported).encode()})
        expect(page.locator('#status')).to_contain_text('JSON imported')
        # Add/duplicate/delete/reorder mutate only the document in this browser.
        page.locator('#duplicate-level').click();expect(page.locator('#level-table tbody tr')).to_have_count(13)
        page.locator('#move-down').click();assert page.evaluate('selected')==2
        page.locator('#move-up').click();assert page.evaluate('selected')==1
        page.locator('#delete-level').click();expect(page.locator('#level-table tbody tr')).to_have_count(12)
        page.locator('#add-level').click();expect(page.locator('#level-table tbody tr')).to_have_count(13)
        page.locator('#delete-level').click();expect(page.locator('#level-table tbody tr')).to_have_count(12)
        page.get_by_role('button',name='EDIT 10',exact=True).click()
        expect(page.locator('#ring-editor .ring-row')).to_have_count(4)
        expect(page.locator('#test-level')).to_be_disabled()
        expect(page.locator('#test-explanation')).to_contain_text('Phase 5')
        # Independent mixed families share the same preview clock.
        for number,family in [(1,'hard'),(2,'medium'),(3,'easy')]:
            page.get_by_role('combobox',name=f'Ring {number} family').select_option(family)
        page.locator('#preview-play').click();page.wait_for_timeout(150)
        assert page.evaluate('previewTime')>0
        page.locator('#preview-pause').click();t=page.evaluate('previewTime')
        page.wait_for_timeout(120);assert page.evaluate('previewTime')==t
        page.locator('#preview-restart').click();assert page.evaluate('previewTime')==0
        page.get_by_role('button',name='EDIT 1',exact=True).click()
        expected=page.evaluate('JSON.stringify(current())')
        page.locator('#test-level').click()
        expect(page).to_have_url('http://app-lab.test'+prefix+'d-fuze/?test=1')
        expect(page.locator('#test-mode')).to_be_visible()
        assert page.evaluate('game.testMode')
        assert page.evaluate('game.rings[0].profile.family.duration')==10
        page.get_by_role('button',name='START TEST',exact=True).click()
        page.keyboard.press('Space');assert page.evaluate('game.ammo')==39
        page.evaluate("while(game.state==='PLAYING'){game.angle=game.rings[0].gate.angle;game.fire();game.update(.25);}")
        expect(page.get_by_role('button',name='RETRY LEVEL',exact=True)).to_be_visible()
        expect(page.get_by_role('button',name='PLAY NEXT LEVEL',exact=True)).to_have_count(0)
        before=page.evaluate('[game.level,game.seed,game.rings[0].profile.id]')
        page.evaluate('game.nextLevel()');assert page.evaluate('game.level')==before[0]
        page.get_by_role('button',name='RETRY LEVEL',exact=True).click()
        assert page.evaluate('[game.level,game.seed,game.rings[0].profile.id]')==before
        assert page.evaluate('game.ammo')==40
        page.evaluate('game.update(game.config.time+1)')
        expect(page.get_by_role('button',name='RETRY WITH NEW SEED',exact=True)).to_be_visible()
        page.get_by_role('button',name='RETRY WITH NEW SEED',exact=True).click()
        assert page.evaluate('game.seed')!=before[1]
        page.keyboard.press('Escape')
        page.get_by_role('button',name='RETURN TO EDITOR',exact=True).click()
        expect(page).to_have_url('http://app-lab.test'+prefix+'d-fuze/builder/')
        assert page.evaluate('JSON.stringify(current())')==expected
        # Two-ring Test Mode uses independent edited settings in the real engine.
        page.get_by_role('button',name='EDIT 4',exact=True).click()
        page.locator('#assembly-enabled').check()
        page.locator('#assembly-speed').fill('20');page.locator('#assembly-speed').press('Tab')
        expect(page.locator('#test-level')).to_be_enabled()
        page.locator('#test-level').click()
        page.get_by_role('button',name='START TEST',exact=True).click()
        assert page.evaluate('game.rings.length')==2
        page.keyboard.press('Space')
        assert page.evaluate('game.rings[0].gate.health')==2
        page.evaluate("while(game.state==='PLAYING'){if(game.rings.every(r=>Math.abs(r.relativeAngle)<1e-8)){game.angle=game.rings[1].displayAngle;game.fire();}game.update(.05);}")
        expect(page.get_by_role('button',name='RETRY LEVEL',exact=True)).to_be_visible()
        assert page.evaluate('game.health')==0
        original=page.evaluate('game.rings.map(r=>r.profile.id)')
        page.get_by_role('button',name='RETRY LEVEL',exact=True).click()
        assert page.evaluate('game.rings.map(r=>r.profile.id)')==original
        assert page.evaluate('game.rings.map(r=>r.gate.health)')==[2,2]
        page.keyboard.press('Escape')
        page.get_by_role('button',name='RETURN TO EDITOR',exact=True).click()
        expect(page.locator('#assembly-enabled')).to_be_checked()
        # Reset for the next hosting-root pass, exercising native confirmation.
        page.once('dialog',lambda d:d.accept())
        page.locator('#reset-defaults').click()
        expect(page.locator('#level-name')).to_have_value('Draft 1')
    # Direct Test Mode without a valid transfer must never silently start a normal game.
    page.evaluate("sessionStorage.setItem(DFuzeSchema.TEST_KEY,'{}')")
    page.goto('http://app-lab.test/small-apps/d-fuze/?test=1')
    expect(page.locator('#message')).to_have_text('TEST UNAVAILABLE')
    page.goto('http://app-lab.test/small-apps/d-fuze/')
    assert not page.evaluate('game.testMode')
    assert page.evaluate('game.rings[0].profile.family.duration')==10
    expect(page.locator('#test-mode')).to_be_hidden()
    page.evaluate("game.level=6;game.startLevel();game.transition('LEVEL_COMPLETE')")
    expect(page.locator('#detail')).to_contain_text('All 6 available levels complete')
    expect(page.get_by_role('button',name='PLAY NEXT LEVEL',exact=True)).to_have_count(0)
    # Responsive editor and access prompt, with real emulated phone taps.
    mobile=context(viewport={'width':375,'height':812},is_mobile=True,has_touch=True,device_scale_factor=2)
    phone=mobile.new_page();phone.goto('http://app-lab.test/small-apps/d-fuze/builder/')
    phone.locator('#access-code').fill('FUSE-LAB-3');phone.get_by_role('button',name='OPEN LEVEL BUILDER').tap()
    for width,height in [(320,480),(375,812),(412,915),(768,1024),(1440,900)]:
        phone.set_viewport_size({'width':width,'height':height});phone.wait_for_timeout(100)
        assert phone.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,height)
        assert phone.locator('#profile-graph').bounding_box()['height']>=200
        for b in phone.locator('button').all():
            if b.is_visible():
                box=b.bounding_box();assert box['height']>=44 and box['width']>=44,(width,height,box)
        phone.screenshot(path=f'/tmp/d-fuze-builder-{width}.png',full_page=True)
    phone.set_viewport_size({'width':320,'height':480})
    phone.locator('#profile-next').tap();expect(phone.locator('#profile-title')).to_contain_text('2 of 5')
    phone.get_by_role('button',name='EDIT 4',exact=True).tap()
    phone.locator('#test-level').tap()
    expect(phone.locator('#test-mode')).to_be_visible()
    phone.get_by_role('button',name='START TEST',exact=True).tap()
    phone.locator('[data-control=fire]').tap()
    assert phone.evaluate('game.ammo')==49
    assert phone.evaluate('game.rings[0].gate.health')==2
    assert phone.evaluate('game.rings[1].gate.health')==1
    phone.set_viewport_size({'width':812,'height':375})
    expect(phone.locator('#orientation-overlay')).to_be_visible()
    frozen=phone.evaluate('[game.elapsed,game.animationTime,game.ammo,game.rings[0].gate.health]')
    phone.wait_for_timeout(150)
    assert phone.evaluate('[game.elapsed,game.animationTime,game.ammo,game.rings[0].gate.health]')==frozen
    phone.set_viewport_size({'width':320,'height':480})
    assert phone.evaluate('game.state')=='PAUSED'
    phone.get_by_role('button',name='RESUME',exact=True).last.tap()
    phone.evaluate('game.update(game.config.time+1)')
    expect(phone.get_by_role('button',name='RETRY LEVEL',exact=True)).to_be_visible()
    for b in phone.locator('#actions button').all():
        box=b.bounding_box();assert box['y']>=0 and box['y']+box['height']<=480
    phone.get_by_role('button',name='RETURN TO EDITOR',exact=True).tap()
    expect(phone.locator('#builder')).to_be_visible()
    phone.locator('#lock').tap();expect(phone.locator('#builder')).to_be_hidden();expect(phone.locator('#access-dialog')).to_be_visible()
    assert not errors,errors
    assert not missing,missing
    print('PASS: root/Pages access gate, level/ring editing, numeric validation, profile viewer/scrub, four-ring animation-only preview, JSON/CSV, import rejection, drafts, row actions, real-game Test Mode/retries/no advance/return, normal legacy isolation, mobile/desktop layouts and touch')
    browser.close()
