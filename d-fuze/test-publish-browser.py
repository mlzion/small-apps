import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium')
    errors=[]
    ctx=browser.new_context(viewport={'width':375,'height':812},is_mobile=True,has_touch=True,accept_downloads=True)
    def serve(route):
        path=urlsplit(route.request.url).path.removeprefix('/small-apps');f=ROOT/path.lstrip('/')
        if f.is_dir():f/='index.html'
        assert f.is_file(),path
        route.fulfill(path=str(f),content_type={'.json':'application/json','.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'}.get(f.suffix,'text/plain'))
    ctx.route('http://app-lab.test/**',serve);ctx.on('weberror',lambda e:errors.append(str(e)))
    page=ctx.new_page()
    for prefix in ['/', '/small-apps/']:
        page.goto('http://app-lab.test'+prefix+'d-fuze/builder/')
        if page.locator('#access-dialog').is_visible():
            page.locator('#access-code').fill('FUSE-LAB-3');page.get_by_role('button',name='OPEN LEVEL BUILDER').tap()
        expect(page.locator('#builder')).to_be_visible()
        expect(page.locator('#level-table tbody tr')).to_have_count(12)
        assert page.evaluate('JSON.stringify(doc)===JSON.stringify(DFuzeLevels.publishedDocument())')
        expect(page.locator('#save-draft,#load-draft,#export-json,#export-csv,#reset-defaults')).to_have_count(0)
        page.locator('#level-name').fill('Memory only')
        page.once('dialog',lambda d:d.dismiss());page.locator('#reload-published').tap()
        expect(page.locator('#level-name')).to_have_value('Memory only')
        page.once('dialog',lambda d:d.accept());page.locator('#reload-published').tap()
        expect(page.locator('#level-name')).to_have_value('Draft 1')
        timer=page.get_by_role('spinbutton',name='Level 1 Timer (s)',exact=True)
        timer.fill('81');timer.press('Tab')
        page.locator('#level-name').fill('Experimental 81')
        with page.expect_popup() as event:page.locator('#test-level').tap()
        test=event.value;test.get_by_role('button',name='START TEST',exact=True).tap()
        assert test.evaluate('game.config.time')==81
        timer=page.get_by_role('spinbutton',name='Level 1 Timer (s)',exact=True)
        timer.fill('82');timer.press('Tab')
        with page.expect_download() as event:page.locator('#publish').tap()
        exported=json.loads(Path(event.value.path()).read_text())
        assert event.value.suggested_filename=='published-levels.json'
        assert exported['version']==4 and len(exported['levels'])==12
        assert len(exported['ringProfiles'])==18 and exported['assemblyProfiles']
        assert exported['levels'][0]['timer']==82
        expect(page.locator('#status')).to_contain_text('NOT LIVE')
        assert test.evaluate('game.config.time')==81
        assert page.evaluate('DFuzeLevels.publishedDocument().levels[0].timer')==48
        timer.fill('0');timer.press('Tab')
        downloads=[];page.on('download',lambda d:downloads.append(d))
        page.locator('#publish').tap();expect(page.locator('#status')).to_contain_text('Publish blocked')
        page.wait_for_timeout(100);assert not downloads
        timer=page.get_by_role('spinbutton',name='Level 1 Timer (s)',exact=True);timer.fill('82');timer.press('Tab')
        test.keyboard.press('Escape');test.get_by_role('button',name='RETURN TO EDITOR',exact=True).tap()
        expect(page.locator('#level-name')).to_have_value('Experimental 81')
        assert page.evaluate('current().timer')==82
        # Old saved data is ignored; reload creates an entirely new published workspace.
        page.evaluate("localStorage.setItem('d-fuze-builder-draft-v1','old edits');sessionStorage.setItem('d-fuze-editor-session-v1','old edits')")
        page.reload();expect(page.locator('#builder')).to_be_visible()
        assert page.evaluate('current().timer')==48
        assert page.evaluate('JSON.stringify(doc)===JSON.stringify(DFuzeLevels.publishedDocument())')
    installed=browser.new_context()
    def install(route):
        if urlsplit(route.request.url).path.endswith('/published-levels.json'):
            route.fulfill(body=json.dumps(exported),content_type='application/json')
        else:serve(route)
    installed.route('http://app-lab.test/**',install)
    normal=installed.new_page();normal.goto('http://app-lab.test/small-apps/d-fuze/')
    normal.get_by_role('button',name='PLAY',exact=True).click()
    assert normal.evaluate('game.config.time')==82
    assert not normal.evaluate('game.testMode')
    assert not errors,errors
    print('PASS: published startup/fresh sessions, memory edits, reload confirm/cancel, popup Test Mode and return, valid JSON Publish/not-live notice, running game/source isolation, invalid export blocked, obsolete draft UI absent, old storage ignored, both hosting paths')
    browser.close()
