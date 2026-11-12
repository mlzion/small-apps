"""Phase 1.3 playback snapshot, compact portrait layout, colors and render checks."""
import json,os
from pathlib import Path
from urllib.parse import unquote,urlsplit
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
URL='https://app-lab.test/small-apps/drumidi/'
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
 context=browser.new_context(viewport={'width':393,'height':851},is_mobile=True,has_touch=True,device_scale_factor=2)
 context.route('https://app-lab.test/**',serve);context.on('weberror',lambda e:errors.append(str(e)))
 context.add_init_script('''window.drawCounts={};const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){drawCounts[this.canvas.id]=(drawCounts[this.canvas.id]||0)+1;return clear.apply(this,args);};''')
 page=context.new_page();page.goto(URL)
 fixture=page.evaluate('''()=>{const p=DruMidi.fresh();p.bpm=300;
 p.patterns[0].notes=Array.from({length:8},(_,i)=>({drum:38,step:i*8,velocity:60}));p.patterns[0].notes.push({drum:35,step:0,velocity:110});
 p.patterns[1].bars=2;p.patterns[1].color='orange';p.patterns[1].notes=[{drum:42,step:0,velocity:90}];
 p.patterns[15].color='purple';p.patterns[15].notes=[{drum:49,step:0,velocity:95}];p.patterns[14].color='blue';
 p.arrangement.lanes=[[{id:'a',pattern:'P1',start:0},{id:'a2',pattern:'P16',start:4}],[{id:'b',pattern:'P2',start:1}],[{id:'c',pattern:'P16',start:0}]];
 localStorage.setItem('app-lab-drumidi-v1',JSON.stringify(p));return p;}''')
 page.reload();page.evaluate('''()=>{const start=DrumAudio.prototype.start,hit=DrumAudio.prototype.hit;window.hitLog=[];DrumAudio.prototype.start=function(...args){const value=start.apply(this,args);window.currentAudio=this;return value;};DrumAudio.prototype.hit=function(n,t){hitLog.push({...n,time:t});return hit.call(this,n,t);};}''')
 def project():return page.evaluate("JSON.parse(localStorage.getItem('app-lab-drumidi-v1'))")
 def choose(index):page.locator('#pattern').tap();page.locator('#pattern-options button').nth(index).tap()
 def assigned(locator):return locator.evaluate("e=>getComputedStyle(e).getPropertyValue('--pattern-color').trim()")
 # A fresh/unassigned pattern is gray; historical stored colors are retained, even on empty patterns.
 assert assigned(page.locator('#pattern'))=='#c7cdd5'
 choose(14);assert assigned(page.locator('#pattern'))=='#229bea';choose(15);assert assigned(page.locator('#pattern'))=='#ac83ed'
 page.locator('#arrangement-tab').tap();strip=page.locator('#library');buttons=page.locator('.library-pattern')
 expect(buttons).to_have_count(16)
 assert len({round(b.bounding_box()['y']) for b in buttons.all()})==1
 assert strip.evaluate('e=>e.scrollWidth>e.clientWidth')
 # A real horizontal Android-sized swipe reaches the far end without long-pressing a pattern.
 cdp=context.new_cdp_session(page);box=strip.bounding_box();y=box['y']+24
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':box['x']+box['width']-15,'y':y,'id':1}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':box['x']+20,'y':y,'id':1}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(200)
 assert strip.evaluate('e=>e.scrollLeft')>30
 buttons.last.scroll_into_view_if_needed();buttons.last.tap();scroll=strip.evaluate('e=>e.scrollLeft');assert scroll>0
 expect(page.locator('#pattern-dialog')).to_be_hidden();assert buttons.last.evaluate('e=>getComputedStyle(e).borderTopColor')=='rgb(172, 131, 237)';assert assigned(buttons.last)=='#ac83ed';assert assigned(page.locator('.lane-c .clip'))=='#ac83ed'
 # Selecting the library pattern does not rebuild the timeline or lose strip position/focus.
 assert strip.evaluate('e=>e.scrollLeft')==scroll
 # All lanes fit vertically on typical portrait phone sizes; musical bar spans stay unchanged.
 for width,height in [(360,800),(393,851),(412,915),(768,1024),(1440,1000)]:
  page.set_viewport_size(dict(width=width,height=height));page.locator('main').evaluate('e=>e.scrollTop=0');page.wait_for_timeout(50)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  main=page.locator('main');assert main.evaluate('e=>e.scrollHeight<=e.clientHeight+2'),(width,height,main.evaluate('e=>[e.scrollHeight,e.clientHeight]'))
  footer=page.locator('.transport').bounding_box();lane=page.locator('.lane-d').bounding_box();assert lane['y']+lane['height']<=footer['y']
  for clip in page.locator('.clip').all():assert 44<=clip.bounding_box()['height']<=60
  a=page.locator('.lane-a .clip').first;assert a.evaluate('e=>e.style.gridColumn')=='2 / span 1'
  b=page.locator('.lane-b .clip').first;assert b.evaluate('e=>e.style.gridColumn')=='3 / span 2'
  page.screenshot(path=f'/tmp/drumidi-layout-{width}.png')
 page.set_viewport_size(dict(width=393,height=851))
 # Compact clips retain accurate touch move/copy/delete controls and IDs.
 page.locator('.lane-c .clip').tap();page.locator('#clip-start').select_option('2');page.locator('#move-clip').tap();assert project()['arrangement']['lanes'][2][0]['id']=='c';assert project()['arrangement']['lanes'][2][0]['start']==2
 # Deleting a referenced pattern retains clips and resets every selector/clip to gray.
 refs=project()['arrangement'];page.locator('#pattern-tab').tap();choose(15);page.locator('#pattern').click(button='right');page.once('dialog',lambda d:d.accept());page.locator('#delete-pattern').tap();assert project()['patterns'][15]['color']=='gray';assert project()['arrangement']==refs
 assert assigned(page.locator('#pattern'))=='#c7cdd5';page.locator('#arrangement-tab').tap();assert assigned(page.locator('.lane-c .clip'))=='#c7cdd5'
 # Light gray is an explicit palette option and assigned colors remain consistent.
 page.locator('#pattern-tab').tap();choose(1);page.locator('#pattern').click(button='right');page.locator('#change-color').tap();expect(page.get_by_role('button',name='Light Gray',exact=True)).to_be_visible();page.get_by_role('button',name='Green',exact=True).tap();page.get_by_label('Close pattern actions').tap();assert assigned(page.locator('#pattern'))=='#46b96d'
 page.locator('#arrangement-tab').tap();assert assigned(page.locator('.lane-b .clip'))=='#46b96d'
 # Project and MIDI exports remain immediately authoritative while the loop is frozen.
 page.locator('#velocity-tab').tap();page.locator('#velocity-pattern').select_option('0');page.locator('#velocity-drum').select_option('38');page.wait_for_function('window.currentAudio?.running')
 anchor=page.evaluate('currentAudio.anchor');point=page.locator('.velocity-point[data-point="0"]');point.focus();page.keyboard.press('End');assert project()['patterns'][0]['notes'][0]['velocity']==127
 page.locator('#velocity-reset').tap();assert all(n['velocity']==100 for n in project()['patterns'][0]['notes'] if n['drum']==38)
 assert page.evaluate('currentAudio.byStep.get(0).find(n=>n.drum===38).velocity')==60
 page.wait_for_timeout(1800);assert page.evaluate('currentAudio.anchor')==anchor
 assert page.evaluate('hitLog.filter(n=>n.drum===38).every(n=>n.velocity===60)')
 assert page.evaluate('[...currentAudio.sources].filter(n=>n.drum===38).every(n=>Math.abs(n.gain.gain.value-Math.pow(60/127,1.35))<1e-6)')
 # Static graph stays cached while only the playhead moves; footer animation is bounded.
 first=page.evaluate('({...drawCounts})');x=page.locator('.velocity-playhead').evaluate('e=>e.style.left');page.wait_for_timeout(600);last=page.evaluate('({...drawCounts})')
 assert last['velocity-canvas']==first['velocity-canvas'];assert 3<=last['rhythm']-first['rhythm']<=22
 assert page.locator('.velocity-playhead').evaluate('e=>e.style.left')!=x
 with page.expect_download() as dl:page.locator('#export').tap()
 raw=Path(dl.value.path()).read_bytes();assert b'\x99\x26\x64' in raw # channel 10 / snare / velocity 100
 page.get_by_role('button',name='Stop',exact=True).tap();page.wait_for_timeout(100);idle=page.evaluate('({...drawCounts})');page.wait_for_timeout(200);assert page.evaluate('({...drawCounts})')==idle
 page.get_by_role('button',name='Start',exact=True).tap();page.wait_for_function('currentAudio.running && currentAudio.byStep.get(0).find(n=>n.drum===38).velocity===100');page.get_by_role('button',name='Stop',exact=True).tap()
 saved=project();page.locator('#settings').tap()
 with page.expect_download() as dl:page.locator('#save-project').tap()
 path=dl.value.path();assert json.loads(Path(path).read_text())==saved
 page.once('dialog',lambda d:d.accept());page.locator('#new-project').tap();assert all(p['color']=='gray' for p in project()['patterns'])
 page.locator('#settings').tap();page.once('dialog',lambda d:d.accept());page.locator('#project-file').set_input_files(path);expect(page.locator('#project-dialog')).to_be_hidden();assert project()==saved
 page.reload();assert project()==saved
 assert not errors,errors;assert not missing,missing
 print('PASS: horizontal touch strip/P16; assigned/gray/deleted colors; compact four-lane fit and unchanged bar spans; clip touch move; frozen velocities across repeat loops; restart; immediate MIDI/JSON; cached graph/bounded footer/idle rendering; persistence and imports.')
 browser.close()
