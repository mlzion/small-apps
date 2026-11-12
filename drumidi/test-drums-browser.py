"""Phase 1.5: four lanes, ordered drum insertion/removal, palette and persistence."""
import json, os
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
ORIGIN='https://app-lab.test'
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
 c=browser.new_context(viewport={'width':393,'height':851},is_mobile=True,has_touch=True,device_scale_factor=2)
 c.route(ORIGIN+'/**',serve);c.on('weberror',lambda e:errors.append(str(e)))
 # Observe the real audio scheduler without replacing its Web Audio behavior.
 c.add_init_script('''window.hitLog=[];window.badges=[];const text=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(s,...args){if(this.canvas.id==='rhythm')badges.push(s);return text.call(this,s,...args)};''')
 page=c.new_page()
 def project():return page.evaluate("JSON.parse(localStorage.getItem('app-lab-drumidi-v1'))")
 def order():return page.locator('.drum-name').evaluate_all('es=>es.map(e=>Number(e.dataset.midi))')
 def select(midi):page.locator(f'.cell[data-drum="{midi}"][data-position="0"]').tap()
 def choose(i):page.locator('#pattern').tap();page.locator('#pattern-options button').nth(i).tap()
 def add(midi):
  page.locator('#add-drum').tap();assert page.locator(f'#drum-choice option[value="{midi}"]').count()==1
  page.locator('#drum-choice').select_option(str(midi));page.locator('#confirm-drum').tap()
 def menu(midi):
  page.locator(f'.drum-name[data-midi="{midi}"]').click(button='right');expect(page.locator('#drum-actions')).to_be_visible()
 def hold(midi):
  label=page.locator(f'.drum-name[data-midi="{midi}"]');label.scroll_into_view_if_needed();box=label.bounding_box();cdp=c.new_cdp_session(page)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':box['x']+box['width']/2,'y':box['y']+box['height']/2,'id':1}]});page.wait_for_timeout(650)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});cdp.detach();expect(page.locator('#drum-actions')).to_be_visible()
 for prefix in ['/','/small-apps/']:
  page.goto(ORIGIN+prefix+'drumidi/')
  fixture=page.evaluate('''()=>{const p=DruMidi.fresh();p.name='Four Lane Test';p.bpm=300;p.arrangement.bars=1;
   [35,38,42,49].forEach((drum,i)=>{p.patterns[i].notes=[{drum,step:0,velocity:70+i},{drum,step:1,velocity:90+i},{drum,step:63,velocity:110+i}];p.arrangement.lanes[i]=[{id:'lane-'+i,pattern:'P'+(i+1),start:0}]});
   p.patterns[15].notes=[{drum:38,step:255,velocity:11},{drum:35,step:91,velocity:123}];localStorage.setItem('app-lab-drumidi-v1',JSON.stringify(p));return p;}''');page.reload()
  page.evaluate('''()=>{const start=DrumAudio.prototype.start,hit=DrumAudio.prototype.hit;DrumAudio.prototype.start=function(...a){window.currentAudio=this;return start.apply(this,a)};DrumAudio.prototype.hit=function(n,t){hitLog.push({...n,time:t});return hit.call(this,n,t)};}''')
  page.locator('#arrangement-tab').tap();expect(page.locator('.lane')).to_have_count(4)
  expect(page.locator('.lane-d')).to_have_attribute('aria-label','Lane D — Percussion')
  expect(page.locator('#clip-lane option')).to_have_count(4)
  assert page.locator('.lane-a-text').evaluate('e=>getComputedStyle(e).color')==page.locator('.lane-a .lane-label').evaluate('e=>getComputedStyle(e).color')
  for lane in 'bcd':assert page.locator(f'.lane-{lane}-text').evaluate('e=>getComputedStyle(e).color')==page.locator(f'.lane-{lane} .lane-label').evaluate('e=>getComputedStyle(e).color')
  # Fullscreen remains native; all lanes, legend and transport fit common portrait sizes.
  page.locator('#fullscreen').tap();page.wait_for_function('document.fullscreenElement!==null')
  for width,height in [(320,740),(360,740),(360,800),(393,851),(412,915)]:
   page.set_viewport_size(dict(width=width,height=height));page.locator('main').evaluate('e=>e.scrollTop=0');page.wait_for_timeout(50)
   main=page.locator('main');assert main.evaluate('e=>e.scrollHeight<=e.clientHeight+2'),(width,height,main.evaluate('e=>[e.scrollHeight,e.clientHeight]'))
   lane=page.locator('.lane-d').bounding_box();footer=page.locator('.transport').bounding_box();assert lane['y']+lane['height']<=footer['y']
   slot=page.locator('.bar-slot').first.bounding_box();assert slot['width']==slot['height']==56
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=f'/tmp/drumidi-four-lanes-{width}-{height}.png')
  page.set_viewport_size(dict(width=393,height=851))
  page.locator('#play').tap();page.wait_for_function('window.currentAudio?.running');page.wait_for_timeout(1100)
  assert page.evaluate('new Set(hitLog.map(n=>n.lane)).size')==4
  assert page.evaluate('currentAudio.byStep.get(0).length')==4
  assert page.evaluate('[...new Set(hitLog.filter(n=>n.lane===3).map(n=>n.step))].sort((a,b)=>a-b)')==[0,1,63]
  assert page.evaluate("badges.includes('D')")
  page.locator('#play').tap();assert page.evaluate('!currentAudio.running && currentAudio.sources.size===0 && currentAudio.position()===0')
  # Each lane retains independent hit positions, velocities and audio-clock times.
  for i in range(4):
   assert page.evaluate('(i)=>[...new Set(hitLog.filter(n=>n.lane===i).map(n=>n.step))].sort((a,b)=>a-b)',i)==[0,1,63]
   assert page.evaluate('(i)=>hitLog.filter(n=>n.lane===i).every(n=>n.drum===[35,38,42,49][i] && n.velocity===({0:70+i,1:90+i,63:110+i})[n.step] && Math.abs(((n.time-currentAudio.anchor)/currentAudio.stepSeconds-n.step)/64-Math.round(((n.time-currentAudio.anchor)/currentAudio.stepSeconds-n.step)/64))<0.001)',i)
   assert page.evaluate('(i)=>DruMidi.events(JSON.parse(localStorage.getItem("app-lab-drumidi-v1")),"arrangement").filter(n=>n.lane===i).length',i)==3
  with page.expect_download() as dl:page.locator('#export').tap()
  assert dl.value.suggested_filename=='Four Lane Test.mid'
  raw=Path(dl.value.path()).read_bytes();assert int.from_bytes(raw[10:12],'big')==5
  for label in [b'Lane A - Backbone',b'Lane B - Cymbals',b'Lane C - Fills',b'Lane D - Percussion']:assert label in raw
  # Lane D supports existing actions and prevents same-lane overlaps/boundary overflow.
  page.locator('.lane-d .clip').tap();page.locator('#clip-lane').select_option('0');page.locator('#move-clip').tap();expect(page.locator('#clip-error')).not_to_be_empty()
  page.locator('#clip-lane').select_option('3');page.locator('#delete-clip').tap();assert project()['arrangement']['lanes'][3]==[]
  page.locator('.library-pattern').nth(3).tap();page.locator('.lane-d .bar-slot').tap();assert project()['arrangement']['lanes'][3][0]['pattern']=='P4'
  page.locator('.lane-d .clip').tap();page.locator('#clip-lane').select_option('2');page.locator('#copy-clip').tap();expect(page.locator('#clip-error')).not_to_be_empty();page.get_by_label('Close clip actions').tap()
  # Successful D copying/moving/deleting uses whole-bar snapping and retains IDs.
  page.locator('#arrangement-length').select_option('3')
  page.locator('.lane-d .clip').tap();page.locator('#clip-start').select_option('1');page.locator('#copy-clip').tap();assert len(project()['arrangement']['lanes'][3])==2
  copied_id=project()['arrangement']['lanes'][3][1]['id'];page.locator('.lane-d .clip').last.tap();page.locator('#clip-start').select_option('2');page.locator('#move-clip').tap()
  assert project()['arrangement']['lanes'][3][1]=={'id':copied_id,'pattern':'P4','start':2}
  page.locator('.lane-d .clip').last.tap();page.locator('#delete-clip').tap();assert len(project()['arrangement']['lanes'][3])==1
  # Insert directly below selected cell, retain selection across patterns, no duplicates.
  page.locator('#pattern-tab').tap();select(38);add(36);assert order()[:4]==[35,38,36,42]
  choose(7);expect(page.locator('.cell.selected')).to_have_attribute('data-drum','36');add(81);assert order()[:5]==[35,38,36,81,42]
  page.locator('#add-drum').tap();assert page.locator('#drum-choice option[value="36"]').count()==0;page.get_by_label('Close Add Drum').tap()
  # Long press does not mute. Cancel/accept count every note, including hidden P16.
  before=project();hold(38);assert project()==before;expect(page.locator('#drum-removal-info')).to_contain_text('4 notes')
  messages=[]
  def dismiss(d):messages.append(d.message);d.dismiss()
  page.once('dialog',dismiss);page.locator('#remove-drum').tap();assert project()==before and '4 notes' in messages[0]
  page.once('dialog',lambda d:d.accept());page.locator('#remove-drum').tap();after=project()
  assert all(n['drum']!=38 for p in after['patterns'] for n in p['notes'])
  for old,new in zip(before['patterns'],after['patterns']):assert new['notes']==[n for n in old['notes'] if n['drum']!=38]
  assert after['arrangement']==before['arrangement'];assert order()[:4]==[35,36,81,42]
  # Empty instruments remove without a confirmation; selected removal chooses adjacent row.
  select(36);menu(36);unexpected=[]
  def unexpected_dialog(d):unexpected.append(d.message);d.dismiss()
  page.on('dialog',unexpected_dialog)
  page.locator('#remove-drum').tap();assert not unexpected;expect(page.locator('.cell.selected')).to_have_attribute('data-drum','81')
  # Normal tap still mutes/unmutes; the context-menu key remains available.
  page.locator('.drum-name[data-midi="81"]').tap();assert next(d for d in project()['drums'] if d['midi']==81)['muted']
  page.locator('.drum-name[data-midi="81"]').tap();assert not next(d for d in project()['drums'] if d['midi']==81)['muted']
  page.locator('.drum-name[data-midi="81"]').focus();page.keyboard.press('Shift+F10');expect(page.locator('#drum-actions')).to_be_visible();page.get_by_label('Close drum actions').tap()
  # Exactly eight unchanged colors in a 4x2 palette; copied colors still work in regression suites.
  page.locator('#pattern').click(button='right');page.locator('#change-color').tap();expect(page.locator('.color-choice')).to_have_count(8);expect(page.locator('.color-choice[data-color="pink"]')).to_have_count(0)
  assert page.locator('#color-palette').evaluate('e=>getComputedStyle(e).gridTemplateColumns.split(" ").length')==4
  page.get_by_label('Close pattern actions').tap()
  saved=project();saved_order=order();page.reload();assert order()==saved_order and project()==saved
  # Both selector lists follow shared order, with Velocity limited to used drums.
  choose(15);page.locator('#velocity-tab').tap();assert page.locator('#velocity-drum option').evaluate_all('es=>es.map(e=>Number(e.value))')==[35]
  page.locator('#settings').tap()
  with page.expect_download() as dl:page.locator('#save-project').tap()
  data=Path(dl.value.path()).read_bytes();assert json.loads(data)==saved
  # Remove prior dialog listener before imports; these require explicit replacement acceptance.
  page.remove_listener('dialog',unexpected_dialog);page.once('dialog',lambda d:d.accept());page.locator('#project-file').set_input_files({'name':'Reload.json','mimeType':'application/json','buffer':data});expect(page.locator('#project-dialog')).to_be_hidden();assert order()==saved_order and project()==saved
  print('PASS:',prefix,'four-lane actual looping/audio, fullscreen portrait fit, named five-track MIDI, D clip actions, ordered insertion, long-press/cancel/count/removal isolation, selection/mute, palette, JSON/reload/Velocity order',flush=True)
 # Empty list restore/import/edit/play/export/re-add must all remain usable.
 page.evaluate('''()=>{let p=DruMidi.fresh();for(const d of p.drums)p=DruMidi.removeDrum(p,d.midi);localStorage.setItem('app-lab-drumidi-v1',JSON.stringify(p))}''');page.reload();page.evaluate('''()=>{const start=DrumAudio.prototype.start;DrumAudio.prototype.start=function(...a){window.currentAudio=this;return start.apply(this,a)}}''')
 expect(page.locator('.cell')).to_have_count(0);expect(page.locator('#subdivisions button')).to_have_count(0);expect(page.locator('#selection-title')).to_contain_text('Add a drum')
 page.locator('#velocity-tab').tap();expect(page.locator('#velocity-drum')).to_be_disabled();page.locator('#arrangement-tab').tap();page.locator('#play').tap();page.wait_for_function('currentAudio.running');page.locator('#play').tap()
 page.locator('#pattern-tab').tap();add(38);assert order()==[38];select(38);menu(38);page.locator('#remove-drum').tap();assert order()==[];page.reload();add(81);assert order()==[81]
 assert not errors,errors;assert not missing,missing
 print('PASS: empty list restore/edit/Velocity/silent playback/remove-last/re-add; both roots; no JS or asset errors')
 browser.close()
