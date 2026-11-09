from pathlib import Path
from urllib.parse import urlsplit
import json
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
        route.fulfill(path=str(f),content_type={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'}.get(f.suffix,'text/plain'))
    ctx.route('http://app-lab.test/**',serve);ctx.on('weberror',lambda e:errors.append(str(e)))
    page=ctx.new_page();page.goto('http://app-lab.test/small-apps/d-fuze/builder/')
    page.locator('#access-code').fill('FUSE-LAB-3');page.get_by_role('button',name='OPEN LEVEL BUILDER').tap()
    expect(page.locator('input[type=range]')).to_have_count(0)
    expect(page.locator('#assembly-enabled,#profile-speed,#preview-speed')).to_have_count(0)
    width=page.get_by_role('combobox',name='Ring 1 gate width',exact=True)
    assert width.locator('option').evaluate_all('(els)=>els.map(el=>+el.value)')==list(range(10,121,10))
    expect(page.locator('#ring-editor input[type=checkbox]')).to_have_count(0)
    for row in page.locator('#motion-keys tr').all():
        t=row.locator('input').nth(0).input_value()
        if t in ['0','3.5','5','8.5','10']:
            expect(row.locator('input').nth(0)).to_have_attribute('readonly','')
            expect(row.locator('input').nth(1)).to_have_attribute('readonly','')
            expect(row.get_by_role('button',name='DELETE KEY')).to_be_disabled()
    angle=page.get_by_role('textbox',name='Motion key 2 angle',exact=True)
    angle.fill('-')
    angle.evaluate("el=>{el.focus();window.dispatchEvent(new Event('resize'));if(document.activeElement!==el)throw Error('Resize replaced the focused angle field');}")
    expect(angle).to_have_value('-')
    angle.fill('40');angle.press('Tab');page.get_by_role('button',name='Reverse sign key 2',exact=True).tap()
    expect(angle).to_have_value('-40')
    assert angle.get_attribute('inputmode')=='text'
    a=angle.bounding_box();b=page.get_by_role('button',name='Reverse sign key 2',exact=True).bounding_box()
    assert b['x']>=a['x']+a['width'] and abs((a['y']+a['height']/2)-(b['y']+b['height']/2))<3
    expect(page.locator('#motion-new')).to_be_hidden()
    expect(page.locator('#motion-duplicate')).to_be_hidden()
    expect(page.locator('#motion-delete')).to_be_hidden()
    assert page.evaluate('doc.ringProfiles.length')==18
    text=page.evaluate("document.querySelector('#motion-play').click();assemblyEditor.tick(1.2);document.querySelector('#profile-readout').textContent")
    assert '-40.0°' in text
    page.locator('#motion-play').tap();assert page.evaluate('assemblyEditor.time')==0
    wrapped=page.evaluate("document.querySelector('#motion-play').click();assemblyEditor.tick(10.25);assemblyEditor.time")
    assert abs(wrapped-.25)<1e-8
    page.locator('#motion-play').tap();assert page.evaluate('assemblyEditor.time')==0
    page.locator('#motion-mode').select_option('assembly')
    angle=page.get_by_role('textbox',name='Motion key 2 angle',exact=True)
    page.get_by_role('button',name='Reverse sign key 2',exact=True).tap();expect(angle).to_have_value('-24')
    wrapped=page.evaluate("document.querySelector('#motion-play').click();assemblyEditor.tick(25.25);assemblyEditor.time")
    assert abs(wrapped-.25)<1e-8
    page.locator('#motion-play').tap();assert page.evaluate('assemblyEditor.time')==0
    page.locator('#preview-play').tap();page.wait_for_timeout(100);assert page.evaluate('previewTime')>0
    page.locator('#preview-play').tap();assert page.evaluate('previewTime')==0
    with page.expect_download() as event:page.locator('#publish').tap()
    exported=json.loads(Path(event.value.path()).read_text());assert exported['version']==4
    assert exported['ringProfiles'][0]['keyframes'][1][1]==-40
    assert exported['assemblyProfiles'][0]['keyframes'][1][1]==-24
    # Older widths are adjusted visibly; v3 invalid widths are rejected, never rounded.
    legacy=page.evaluate("const old=JSON.parse(JSON.stringify(doc));old.version=2;delete old.ringProfiles;old.levels.forEach(l=>{l.assembly.enabled=false;l.playbackSpeed=1;l.rings.forEach(r=>{r.family=l.motionFamily;r.profiles=DFuzeExperimentalMotion.eligible(r.family).slice(0,5).map(p=>p.id)});delete l.motionFamily;});old.levels[0].rings[0].gateWidth=91;old")
    page.locator('#import-json').set_input_files({'name':'legacy.json','mimeType':'application/json','buffer':json.dumps(legacy).encode()})
    expect(page.locator('#status')).to_contain_text('91° adjusted to 90°')
    expect(page.get_by_role('combobox',name='Ring 1 gate width')).to_have_value('90')
    broken=page.evaluate('JSON.parse(JSON.stringify(doc))');broken['levels'][0]['rings'][0]['gateWidth']=15
    page.locator('#import-json').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(broken).encode()})
    expect(page.locator('#status')).to_contain_text('Import rejected')
    expect(page.get_by_role('combobox',name='Ring 1 gate width')).to_have_value('90')
    for w,h in [(320,480),(375,812),(412,915),(1440,900)]:
        page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(100)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=f'/tmp/unified-motion-{w}.png',full_page=True)
    assert not errors,errors
    print('PASS: mobile sign flip/negative animation/memory/export, protected controls, 10s/25s looping, Stop resets, removed scrubbing/speed/eligibility/enable UI, gate dropdown and visible migration/rejection, responsive layouts')
    browser.close()
