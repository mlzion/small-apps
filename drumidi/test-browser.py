"""Run from repository root: python drumidi/test-browser.py (Playwright + Chromium)."""
import json, os
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
PROBE="""(() => {
window.probe={contexts:[],hits:[],gains:[]}; const Native=window.AudioContext;
window.AudioContext=class extends Native {constructor(...a){super(...a);probe.contexts.push(this);}
createGain(){const g=super.createGain();probe.gains.push(g);return g;}
createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n),stop=n.stop.bind(n),record={stopped:false,ended:false};n.addEventListener('ended',()=>record.ended=true);
n.start=(time)=>{Object.assign(record,{time,rate:n.playbackRate.value,duration:n.buffer.duration,drum:window.currentDrum});probe.hits.push(record);return start(time);};
n.stop=(...a)=>{record.stopped=true;return stop(...a);};return n;}}
})()"""
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--autoplay-policy=document-user-activation-required'])
 errors=[];missing=[]
 def serve(route):
  path=unquote(urlsplit(route.request.url).path)
  if path.startswith('/small-apps/'):path=path[len('/small-apps'):]
  file=(ROOT/path.lstrip('/')).resolve()
  if not file.is_relative_to(ROOT):return route.fulfill(status=403)
  if file.is_dir():file/='index.html'
  if not file.is_file():missing.append(path);return route.fulfill(status=404)
  mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg','.svg':'image/svg+xml'}
  route.fulfill(path=str(file),content_type=mime.get(file.suffix,'text/plain'))
 def context(**kw):
  c=browser.new_context(**kw);c.route('https://app-lab.test/**',serve);c.add_init_script(PROBE);c.on('weberror',lambda e:errors.append(str(e)));return c
 c=context(viewport={'width':412,'height':915},is_mobile=True,has_touch=True,device_scale_factor=2)
 page=c.new_page();url='https://app-lab.test/small-apps/drumidi/'
 page.goto(url);page.screenshot(path='/tmp/drumidi-initial.png');expect(page.locator('.cell')).to_have_count(72);assert page.evaluate('probe.contexts.length')==0
 def choose(index):
  page.locator('#pattern').tap();page.locator('#pattern-options button').nth(index).tap()
 def cell(m,pos):page.locator(f'.cell[data-drum="{m}"][data-position="{pos}"]').tap()
 def sub(i):page.locator('#subdivisions button').nth(i-1).tap()
 def project():return page.evaluate("JSON.parse(localStorage.getItem('app-lab-drumidi-v1'))")
 def library(p):page.locator('.library-pattern').filter(has=page.get_by_text(p,exact=True)).tap()
 def place(p,lane,bar):library(p);page.get_by_role('button',name=f'Place {p} in lane {lane}, bar {bar}',exact=True).tap()
 page.locator('#length').select_option('4')
 page.evaluate("""() => {const original=DrumAudio.prototype.hit;DrumAudio.prototype.hit=function(n,t){window.currentDrum=n.drum;return original.call(this,n,t);};}""")
 # Four bars, all subdivisions in one group, and a hit at the very last 64th.
 cell(35,0);sub(1);cell(38,2)
 for i in range(1,9):sub(i)
 for b in range(2,5):
  page.locator('#bars button').nth(b-1).tap();cell(35,0);sub(1)
 cell(50,7);sub(8)
 page.locator('#bars button').first.tap();cell(38,2);expect(page.locator('#subdivisions button[aria-pressed=true]')).to_have_count(8)
 choose(1);page.locator('#length').select_option('2');cell(42,0);sub(1)
 choose(2);cell(49,7);sub(8)
 page.locator('#add-drum').tap();page.locator('#drum-choice').select_option('56');page.locator('#confirm-drum').tap();expect(page.locator('.drum-row')).to_have_count(10)
 page.locator('#bpm').fill('137');page.locator('#bpm').dispatch_event('change')
 page.locator('#arrangement-tab').tap();place('P1','A',1);place('P2','A',6);place('P3','B',2);place('P2','B',4);place('P3','C',1)
 expect(page.locator('.clip')).to_have_count(5)
 print('PASS: touch patterns and independent arrangement lanes',flush=True)
 # Reject overlap, overflow and timeline truncation.
 page.locator('.lane').first.locator('.clip').first.tap();page.locator('#clip-start').select_option('2');page.locator('#copy-clip').tap();expect(page.locator('.clip')).to_have_count(5);expect(page.locator('#clip-error')).to_contain_text('does not fit');page.get_by_label('Close clip actions').tap()
 place('P1','B',8);expect(page.locator('.clip')).to_have_count(5)
 page.locator('#arrangement-length').select_option('6');expect(page.locator('#arrangement-length')).to_have_value('8')
 # Copy/move/delete via touch-friendly clip actions.
 page.locator('.lane-b .clip').first.tap();page.locator('#clip-start').select_option('7');page.locator('#copy-clip').tap();expect(page.locator('.clip')).to_have_count(6)
 page.locator('.lane-b .clip').last.tap();page.locator('#clip-start').select_option('6');page.locator('#move-clip').tap();expect(page.locator('.clip')).to_have_count(6)
 page.locator('.lane-b .clip').last.tap();page.locator('#delete-clip').tap();expect(page.locator('.clip')).to_have_count(5)
 # Genuine long press opens a clip context menu.
 clip=page.locator('.lane-b .clip').first;clip.scroll_into_view_if_needed();box=clip.bounding_box();cdp=c.new_cdp_session(page)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':box['x']+10,'y':box['y']+20,'id':1}]});page.wait_for_timeout(650)
 expect(page.locator('#clip-dialog')).to_be_visible();cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.get_by_label('Close clip actions').tap()
 # Native Web Audio decoding and sample scheduling, start/stop, stop and page reset.
 page.locator('#bpm').fill('300');page.locator('#bpm').dispatch_event('change')
 page.get_by_role('button',name='Start',exact=True).tap()
 try:page.wait_for_function('probe.hits.length>4')
 except Exception:
  print(page.evaluate('({status:document.getElementById("status").textContent,hits:probe.hits,contexts:probe.contexts.map(a=>({state:a.state,time:a.currentTime})),hidden:document.hidden})'),errors,flush=True)
  raise
 expect(page.get_by_role('button',name='Stop',exact=True)).to_be_visible()
 assert page.evaluate('probe.contexts[0].state')=='running'
 assert page.evaluate('probe.hits.every(h=>h.duration>0 && h.rate>0)')
 assert page.evaluate('probe.gains.some(g=>Math.abs(g.gain.value-Math.pow(106/127,1.35))<1e-6)')
 # Eight bars at 300 BPM: wait across the actual loop seam and verify precise 64ths.
 page.wait_for_function('probe.hits.some(h=>h.time-probe.hits[0].time>6.3)',timeout=35000)
 assert page.evaluate('probe.hits.some(h=>h.drum===49 && h.time-probe.hits[0].time<1)')
 times=page.evaluate('probe.hits.map(h=>h.time)');expected=60/300/16
 assert sum(abs((b-a)-expected)<1e-6 for a,b in zip(times,times[1:]))>=6
 assert any(abs((t-times[0])-32*60/300)<1e-6 for t in times),times

 page.get_by_role('button',name='Stop',exact=True).tap();count=page.evaluate('probe.hits.length');page.wait_for_timeout(150);assert page.evaluate('probe.hits.length')==count
 page.get_by_role('button',name='Start',exact=True).tap();page.wait_for_timeout(250);page.get_by_role('button',name='Stop',exact=True).tap();assert page.evaluate('probe.hits.every(h=>h.stopped||h.ended)')
 page.get_by_role('button',name='Start',exact=True).tap();page.locator('#pattern-tab').tap();expect(page.get_by_role('button',name='Start',exact=True)).to_be_visible()
 page.locator('#bpm').fill('137');page.locator('#bpm').dispatch_event('change')
 choose(0);page.locator('#length').select_option('1');page.locator('#length').select_option('4');assert any(n['step']==255 for n in project()['patterns'][0]['notes'])
 # Pattern growth cannot invalidate arrangement clips.
 choose(1);page.locator('#length').select_option('4');expect(page.locator('#length')).to_have_value('2')
 print('PASS: actual full loop, 64th scheduling, start/stop/reset',flush=True)
 # MIDI downloads have proper header and separate lane tracks.
 with page.expect_download() as dl:page.locator('#export').tap()
 data=Path(dl.value.path()).read_bytes();assert data[:4]==b'MThd' and int.from_bytes(data[10:12],'big')==2
 page.locator('#arrangement-tab').tap()
 with page.expect_download() as dl:page.locator('#export').tap()
 data=Path(dl.value.path()).read_bytes();assert data[:4]==b'MThd' and int.from_bytes(data[10:12],'big')==5
 # Full editable JSON export/load roundtrip; explicit replacement confirmation.
 saved=project();page.locator('#settings').tap()
 with page.expect_download() as dl:page.locator('#save-project').tap()
 path=dl.value.path();assert json.loads(Path(path).read_text())==saved
 page.once('dialog',lambda d:d.dismiss());page.locator('#new-project').tap();assert project()==saved
 page.once('dialog',lambda d:d.accept());page.locator('#new-project').tap();assert project()['patterns'][0]['notes']==[]
 page.locator('#settings').tap();page.once('dialog',lambda d:d.accept());page.locator('#project-file').set_input_files(path)
 expect(page.locator('#project-dialog')).to_be_hidden();assert project()==saved
 page.reload();assert project()==saved;expect(page.locator('.drum-row')).to_have_count(10);expect(page.locator('#bpm')).to_have_value('137')
 # Invalid import does not destroy existing data, including incompatible versions.
 page.locator('#settings').tap();page.locator('#project-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{"format":"drumidi","version":3}'})
 expect(page.locator('#storage-status')).to_contain_text('Unsupported project');assert project()==saved
 page.get_by_label('Close project settings').tap()
 # Responsive layouts, fixed transport, usable cells, scrollable grid, visible subdivision editor.
 for width,height in [(320,740),(360,800),(393,851),(412,915),(768,1024),(1440,1000)]:
  page.set_viewport_size({'width':width,'height':height});page.evaluate('window.scrollTo(0,0)')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  assert page.locator('.cell').first.bounding_box()['width']>=23,width
  box=page.locator('.transport').bounding_box();assert abs(box['y']+box['height']-height)<2
  assert page.locator('.subdivision').bounding_box()['y']+page.locator('.subdivision').bounding_box()['height']<=box['y'],width
  grid=page.locator('#drum-grid');before=page.locator('.subdivision').bounding_box();grid.evaluate('e=>e.scrollTop=e.scrollHeight');assert page.locator('.subdivision').bounding_box()==before
  grid.evaluate('e=>e.scrollTop=0');page.screenshot(path=f'/tmp/drumidi-{width}.png',full_page=True)
 # Desktop drag copies from library and moves existing clips, at both hosting roots.
 desktop=context(viewport={'width':1280,'height':1000});d=desktop.new_page()
 for prefix in ['/','/small-apps/']:
  d.goto('https://app-lab.test'+prefix);d.get_by_role('link',name='Launch DruMidi').click();expect(d).to_have_url('https://app-lab.test'+prefix+'drumidi/')
  d.locator('#arrangement-tab').click();d.locator('.library-pattern').first.drag_to(d.locator('.lane').first.locator('.bar-slot').first)
  expect(d.locator('.clip')).to_have_count(1);d.locator('.clip').first.drag_to(d.locator('.lane').nth(1).locator('.bar-slot').nth(2));expect(d.locator('.lane-b .clip')).to_have_count(1)
  d.evaluate('localStorage.clear()')
 d.locator('.library-pattern[aria-pressed=true]').focus();d.keyboard.press('Shift+F10');expect(d.locator('#pattern-dialog')).to_be_visible();d.keyboard.press('Escape');expect(d.locator('.library-pattern[aria-pressed=true]')).to_be_focused()
 d.screenshot(path='/tmp/drumidi-arrangement-desktop.png')
 page.set_viewport_size({'width':412,'height':915});page.locator('#arrangement-tab').tap();page.screenshot(path='/tmp/drumidi-arrangement-mobile.png')
 # Decode every additional GM instrument too.
 d.evaluate('''async()=>{const a=new DrumAudio();await a.init(DruMidi.catalog);window.decoded=a.buffers.size;}''');assert d.evaluate('decoded')==47
 bad=context();bad.add_init_script("window.AudioContext=class {constructor(){throw new Error('Unavailable test audio')}}")
 failure=bad.new_page();failure.goto(url);failure.locator('#play').click();expect(failure.locator('#status')).to_contain_text('Could not start audio');expect(failure.locator('#play')).to_be_enabled()
 blocked=context();blocked.add_init_script("Storage.prototype.setItem=function(){throw new Error('Storage full')}")
 storage=blocked.new_page();storage.goto(url);storage.locator('#length').select_option('2');expect(storage.locator('#status')).to_contain_text('Use Save Project')
 storage.locator('#settings').click()
 with storage.expect_download() as dl:storage.locator('#save-project').click()
 assert json.loads(Path(dl.value.path()).read_text())['patterns'][0]['bars']==2

 # Pattern management: all sixteen selectors, copy snapshots, destination colors and destructive confirmations.
 page.locator('#pattern-tab').tap()
 for i in range(16):
  choose(i);expect(page.locator('#pattern')).to_have_text(f'P{i+1} ▾')
 choose(0);page.locator('#pattern').click(button='right');page.locator('#change-color').tap();page.get_by_role('button',name='Blue',exact=True).tap();page.locator('#copy-pattern').tap();page.get_by_label('Close pattern actions').tap()
 choose(15);page.locator('#length').select_option('3');page.locator('#pattern').click(button='right');page.locator('#change-color').tap();page.get_by_role('button',name='Purple',exact=True).tap();page.get_by_label('Close pattern actions').tap()
 page.locator('#pattern').click(button='right');page.once('dialog',lambda d:d.dismiss());page.locator('#paste-pattern').tap();assert project()['patterns'][15]['notes']==[]
 page.once('dialog',lambda d:d.accept());page.locator('#paste-pattern').tap();assert project()['patterns'][15]['notes']==project()['patterns'][0]['notes'];assert project()['patterns'][15]['bars']==4;assert project()['patterns'][15]['color']=='blue'
 assert page.locator('#pattern').evaluate("e=>getComputedStyle(e).getPropertyValue('--pattern-color').trim()")=='#229bea'
 page.locator('#pattern').click(button='right');expect(page.locator('#paste-pattern')).to_be_disabled();expect(page.locator('#paste-explanation')).to_contain_text('zero notes');page.locator('#copy-pattern').tap();expect(page.locator('#paste-pattern')).to_be_disabled();page.once('dialog',lambda d:d.dismiss());page.locator('#delete-pattern').tap();assert project()['patterns'][15]['notes']
 page.once('dialog',lambda d:d.accept());page.locator('#delete-pattern').tap();assert project()['patterns'][15]['notes']==[];assert project()['patterns'][15]['bars']==1;assert project()['patterns'][15]['color']=='gray'
 # Empty unreferenced patterns reset without confirmation, regardless of length.
 page.locator('#length').select_option('3');page.locator('#pattern').click(button='right');page.locator('#delete-pattern').tap();assert project()['patterns'][15]['bars']==1
 # Paste cannot expand a referenced pattern into a collision or beyond the arrangement.
 choose(0);page.locator('#pattern').click(button='right');page.locator('#copy-pattern').tap();page.get_by_label('Close pattern actions').tap();choose(1);page.locator('#pattern').click(button='right');expect(page.locator('#paste-pattern')).to_be_disabled();refs=project()['arrangement'];before=project();page.once('dialog',lambda d:d.dismiss());page.locator('#delete-pattern').tap();assert project()==before;page.once('dialog',lambda d:d.accept());page.locator('#delete-pattern').tap();assert project()['arrangement']==refs;assert project()['patterns'][1]['bars']==1;page.locator('#pattern').click(button='right');expect(page.locator('#paste-pattern')).to_be_enabled();before=project();page.locator('#paste-pattern').tap();expect(page.locator('#pattern-message')).to_contain_text('Cannot paste');assert project()==before;page.get_by_label('Close pattern actions').tap()
 choose(15);page.locator('#pattern').click(button='right');page.locator('#change-color').tap();page.get_by_role('button',name='Purple',exact=True).tap();page.get_by_label('Close pattern actions').tap()
 # Touch long press on the selector, selection-dialog entries and library blocks; movement cancels.
 def hold(target):
  target.scroll_into_view_if_needed();box=target.bounding_box();cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':box['x']+box['width']/2,'y':box['y']+box['height']/2,'id':1}]});page.wait_for_timeout(650)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});expect(page.locator('#pattern-dialog')).to_be_visible()
 hold(page.locator('#pattern'));page.get_by_label('Close pattern actions').tap()
 target=page.locator('#pattern');box=target.bounding_box();x=box['x']+10;y=box['y']+10
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+40,'y':y,'id':1}]});page.wait_for_timeout(650);cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});expect(page.locator('#pattern-dialog')).to_be_hidden()
 if page.locator('#pattern-picker').is_visible():page.get_by_label('Close pattern selector').tap()
 page.locator('#pattern').tap();hold(page.locator('#pattern-options button').nth(15));expect(page.locator('#pattern-title')).to_contain_text('P16');page.get_by_label('Close pattern actions').tap()
 page.locator('#arrangement-tab').tap();expect(page.locator('.library-pattern')).to_have_count(16);hold(page.locator('.library-pattern').nth(15));page.get_by_label('Close pattern actions').tap()
 place('P16','C',5);clip=page.locator('.lane-c .clip').last;assert clip.evaluate("e=>getComputedStyle(e).getPropertyValue('--pattern-color').trim()")=='#ac83ed'
 page.locator('.library-pattern[aria-pressed=true]').click(button='right');expect(page.locator('#pattern-title')).to_contain_text('P16');refs=project()['arrangement'];page.once('dialog',lambda d:d.dismiss());page.locator('#delete-pattern').tap();expect(page.locator('#pattern-dialog')).to_be_visible();page.once('dialog',lambda d:d.accept());page.locator('#delete-pattern').tap();assert project()['arrangement']==refs;assert project()['patterns'][15]['bars']==1;assert project()['patterns'][15]['color']=='gray'
 page.locator('.library-pattern[aria-pressed=true]').click(button='right');page.locator('#change-color').tap();page.get_by_role('button',name='Purple',exact=True).tap();page.get_by_label('Close pattern actions').tap()
 page.locator('.library-pattern[aria-pressed=true]').click(button='right');page.once('dialog',lambda d:d.accept());page.locator('#paste-pattern').tap();assert project()['arrangement']==refs;assert project()['patterns'][15]['bars']==4;assert project()['patterns'][15]['color']=='blue'
 # Global live mutes preserve playback, silence scheduled/active sources and are excluded from MIDI.
 page.evaluate("() => {const original=DrumAudio.prototype.hit;DrumAudio.prototype.hit=function(n,t){window.currentDrum=n.drum;return original.call(this,n,t);};}")
 page.locator('#pattern-tab').tap();choose(0);notes_before=project()['patterns'][0]['notes'];page.get_by_role('button',name='Start',exact=True).tap();page.wait_for_function('probe.hits.some(h=>h.drum===35)')
 mute=page.get_by_role('button',name='Mute Acoustic Kick',exact=True);mute.tap();expect(page.get_by_role('button',name='Stop',exact=True)).to_be_visible();expect(mute).to_have_attribute('aria-pressed','true');assert project()['patterns'][0]['notes']==notes_before
 assert page.evaluate('probe.hits.filter(h=>h.drum===35).every(h=>h.stopped||h.ended)')
 mark=page.evaluate('probe.hits.length');page.wait_for_timeout(450);assert page.evaluate(f'probe.hits.slice({mark}).every(h=>h.drum!==35)')
 page.get_by_role('button',name='Stop',exact=True).tap();assert page.evaluate("DruMidi.events(JSON.parse(localStorage.getItem('app-lab-drumidi-v1')),'pattern',0).every(n=>n.drum!==35)")
 # Muted project roundtrip, refresh and global three-lane sound filtering.
 muted=project();page.reload();assert project()==muted;expect(page.get_by_role('button',name='Mute Acoustic Kick',exact=True)).to_have_attribute('aria-pressed','true')
 page.evaluate("() => {const original=DrumAudio.prototype.hit;DrumAudio.prototype.hit=function(n,t){window.currentDrum=n.drum;return original.call(this,n,t);};}")
 page.locator('#arrangement-tab').tap();page.get_by_role('button',name='Start',exact=True).tap();page.wait_for_function('probe.hits.length>4');assert page.evaluate('probe.hits.every(h=>h.drum!==35)');page.get_by_role('button',name='Stop',exact=True).tap()
 page.locator('#pattern-tab').tap();page.get_by_role('button',name='Mute Acoustic Kick',exact=True).tap();page.get_by_role('button',name='Start',exact=True).tap();page.wait_for_function('probe.hits.some(h=>h.drum===35)');page.get_by_role('button',name='Stop',exact=True).tap()
 # Complete colored/muted v2 JSON file download and reload.
 page.get_by_role('button',name='Mute Snare',exact=True).tap();colored=project();page.locator('#settings').tap()
 with page.expect_download() as dl:page.locator('#save-project').tap()
 color_path=dl.value.path();assert json.loads(Path(color_path).read_text())==colored
 page.once('dialog',lambda d:d.accept());page.locator('#new-project').tap();page.locator('#settings').tap();page.once('dialog',lambda d:d.accept());page.locator('#project-file').set_input_files(color_path);expect(page.locator('#project-dialog')).to_be_hidden();assert project()==colored
 # Automatic v1 migration preserves every original note/clip; new patterns and lane start empty.
 legacy=json.loads(json.dumps(saved));legacy['version']=1;legacy['patterns']=legacy['patterns'][:8];legacy['arrangement']['lanes']=legacy['arrangement']['lanes'][:2]
 for ptn in legacy['patterns']:ptn.pop('color')
 for drum in legacy['drums']:drum.pop('muted')
 page.evaluate("p=>localStorage.setItem('app-lab-drumidi-v1',JSON.stringify(p))",legacy);page.reload();migrated=project();assert migrated['version']==2 and len(migrated['patterns'])==16 and len(migrated['arrangement']['lanes'])==4;assert migrated['arrangement']['lanes'][:2]==legacy['arrangement']['lanes'];assert migrated['patterns'][0]['notes']==legacy['patterns'][0]['notes'];assert not any(d['muted'] for d in migrated['drums'])
 page.locator('#settings').tap();page.once('dialog',lambda d:d.accept());page.locator('#project-file').set_input_files({'name':'legacy.json','mimeType':'application/json','buffer':json.dumps(legacy).encode()});expect(page.locator('#project-dialog')).to_be_hidden();assert project()==migrated
 print('PASS: all 16 selectors; colors; empty-only paste/delete/reset/confirmation; blocked paste; mobile pattern long press; live global mutes; v2 JSON; v1 storage/import migration',flush=True)

 assert not errors,errors;assert not missing,missing
 print('PASS: 4-bar editing/64ths; mixed lengths; three independent lanes; overlap/bounds; clip touch/copy/move/delete/long-press/desktop drag; real acoustic samples; start/stop/page reset; MIDI downloads; JSON roundtrip/invalid import/confirmation; auto persistence; six layouts; both hosting roots; all 47 sample decodes.')
 browser.close()
