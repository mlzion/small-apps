"""DruMidi Phase 1.2 workflow: python drumidi/test-velocity-browser.py."""
import json, os
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
 def context(**kw):
  ctx=browser.new_context(**kw);ctx.route('https://app-lab.test/**',serve);ctx.on('weberror',lambda e:errors.append(str(e)));return ctx
 def fixture(page):
  page.goto(URL)
  data=page.evaluate('''() => {
   const p=DruMidi.fresh();p.bpm=180;
   p.patterns[0].bars=4;
   p.patterns[0].notes=Array.from({length:256},(_,step)=>({drum:38,step,velocity:40+step%80}));
   for(let step=0;step<256;step+=32)p.patterns[0].notes.push({drum:35,step,velocity:110});
   p.patterns[0].notes.push({drum:50,step:255,velocity:91});
   for(let i=1;i<4;i++){const pat=p.patterns[i];pat.bars=i;pat.notes=[{drum:35,step:0,velocity:55},{drum:38,step:i*64-1,velocity:75}];}
   localStorage.setItem('app-lab-drumidi-v1',JSON.stringify(p));return p;
  }''')
  page.reload()
  page.evaluate('''() => {
    const original=DrumAudio.prototype.start;
    window.startCount=0;
    DrumAudio.prototype.start=function(...args){const result=original.apply(this,args);window.currentAudio=this;window.startCount++;return result;};
  }''')
  return data
 def project(page):return page.evaluate("JSON.parse(localStorage.getItem('app-lab-drumidi-v1'))")
 def knob(page,index):return page.locator(f'.velocity-point[data-point="{index}"]')
 def destination(page,x,velocity):
  b=page.locator('#velocity-canvas').bounding_box();return dict(x=b['x']+38+x*(b['width']-64),y=b['y']+28+(127-velocity)/126*(b['height']-66))
 def drag(page,index,x,v):
  b=knob(page,index).bounding_box();page.mouse.move(b['x']+b['width']/2,b['y']+b['height']/2);page.mouse.down();page.mouse.move(**destination(page,x,v),steps=8);page.mouse.up()
 ctx=context(viewport={'width':1100,'height':950});page=ctx.new_page();before=fixture(page)
 expect(page.locator('.tabs button')).to_have_text(['Pattern','Velocity','Arrangement'])
 page.locator('#velocity-tab').click();expect(page.locator('#velocity-pattern option')).to_have_count(16);expect(page.locator('#velocity-drum option')).to_have_count(3)
 page.locator('#velocity-drum').select_option('38');assert project(page)==before
 page.get_by_role('button',name='Start',exact=True).click();page.wait_for_function('window.currentAudio?.running')
 anchor=page.evaluate('currentAudio.anchor');start_count=page.evaluate('startCount');left=knob(page,0).bounding_box()['x']
 drag(page,0,.3,125);assert abs(knob(page,0).bounding_box()['x']-left)<1
 drag(page,1,.3,20);drag(page,2,.5,85)
 edited=project(page);assert len(edited['patterns'][0]['notes'])==len(before['patterns'][0]['notes'])
 assert [(n['drum'],n['step']) for n in edited['patterns'][0]['notes']]==[(n['drum'],n['step']) for n in before['patterns'][0]['notes']]
 assert [n for n in edited['patterns'][0]['notes'] if n['drum']!=38]==[n for n in before['patterns'][0]['notes'] if n['drum']!=38]
 assert edited['patterns'][1:]==before['patterns'][1:]
 assert page.evaluate('currentAudio.anchor')==anchor and page.evaluate('startCount')==start_count
 expect(page.get_by_role('button',name='Stop',exact=True)).to_be_visible()
 assert page.evaluate("currentAudio.byStep.get(0).find(n=>n.drum===38).velocity")==before['patterns'][0]['notes'][0]['velocity']
 assert page.evaluate("[...currentAudio.sources].filter(r=>r.drum===38).every(r=>r.velocity>=40 && r.velocity<=119)")
 page.wait_for_timeout(100);assert page.evaluate('currentAudio.position()')>0
 # Keyboard sliders and vertical endpoint constraints.
 knob(page,0).focus();page.keyboard.press('Home');assert project(page)['patterns'][0]['notes'][0]['velocity']==1
 page.keyboard.press('ArrowUp');assert project(page)['patterns'][0]['notes'][0]['velocity']==2
 snare=[n for n in project(page)['patterns'][0]['notes'] if n['drum']==38]
 page.locator('#velocity-drum').select_option('35');assert page.evaluate('currentAudio.anchor')==anchor
 drag(page,1,.62,44);page.locator('#velocity-reset').click()
 after_reset=project(page);assert all(n['velocity']==100 for n in after_reset['patterns'][0]['notes'] if n['drum']==35)
 assert [n for n in after_reset['patterns'][0]['notes'] if n['drum']==38]==snare
 assert after_reset['patterns'][1:]==before['patterns'][1:]
 page.locator('#velocity-drum').select_option('38');assert page.evaluate('startCount')==start_count
 # Stop/Start is the only point that captures the edited project velocities.
 snapshot=project(page)['patterns'][0]['notes'][0]['velocity'];assert snapshot==2
 assert page.evaluate("currentAudio.byStep.get(0).find(n=>n.drum===38).velocity")==40
 page.get_by_role('button',name='Stop',exact=True).click();page.get_by_role('button',name='Start',exact=True).click();page.wait_for_function("currentAudio.running && currentAudio.byStep.get(0).find(n=>n.drum===38).velocity===2")
 # Switching patterns from this page starts the new complete pattern, from the beginning.
 for index,bars in [(1,1),(2,2),(3,3),(0,4)]:
  previous=page.evaluate('startCount');page.locator('#velocity-pattern').select_option(str(index));page.wait_for_function(f'startCount>{previous}');assert page.evaluate('currentAudio.total')==bars*64
  assert page.evaluate('currentAudio.position()')<8
  expect(page.locator('#playback-label')).to_have_text(f'P{index+1}')
 page.get_by_role('button',name='Stop',exact=True).click();page.locator('#velocity-pattern').select_option('15');page.wait_for_function('currentAudio.running');expect(page.locator('#velocity-drum')).to_be_disabled();expect(page.locator('#velocity-reset')).to_be_disabled();expect(page.locator('#velocity-empty')).to_have_text('No notes yet')
 page.get_by_role('button',name='Stop',exact=True).click();page.locator('#velocity-pattern').select_option('0');page.wait_for_function('currentAudio.running');page.locator('#velocity-drum').select_option('38')
 # Independent SMF reader checks actual downloaded note velocities and loop length.
 def midi_tracks(raw):
  i=14;tracks=[]
  def var():
   nonlocal i
   value=0
   while True:
    b=raw[i];i+=1;value=value*128+(b&127)
    if b<128:return value
  for _ in range(int.from_bytes(raw[10:12],'big')):
   assert raw[i:i+4]==b'MTrk';end=i+8+int.from_bytes(raw[i+4:i+8],'big');i+=8;tick=0;events=[]
   while i<end:
    tick+=var();status=raw[i];i+=1
    if status==255:
     kind=raw[i];i+=1;length=var();i+=length
    else:
     note,velocity=raw[i:i+2];i+=2
     if status==153:events.append((tick,note,velocity))
   tracks.append((events,tick))
  return tracks
 with page.expect_download() as dl:page.locator('#export').click()
 tracks=midi_tracks(Path(dl.value.path()).read_bytes());saved=project(page)
 assert len(tracks)==2 and tracks[1][1]==4*3840
 assert sorted(tracks[1][0])==sorted((n['step']*60,n['drum'],n['velocity']) for n in saved['patterns'][0]['notes'])
 page.reload();assert project(page)==saved;page.locator('#velocity-tab').click();page.locator('#velocity-drum').select_option('38');assert project(page)==saved
 # Real touch dragging with pointer capture: no page scroll, exact scope and live playback.
 mobile=context(viewport={'width':393,'height':851},is_mobile=True,has_touch=True,device_scale_factor=2)
 touch=mobile.new_page();original=fixture(touch);touch.locator('#velocity-tab').tap();touch.locator('#velocity-drum').select_option('38');touch.get_by_role('button',name='Start',exact=True).tap();touch.wait_for_function('window.currentAudio?.running')
 cdp=mobile.new_cdp_session(touch);box=knob(touch,1).bounding_box();position_before=touch.locator('main').evaluate('e=>e.scrollTop');anchor=touch.evaluate('currentAudio.anchor')
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[dict(x=box['x']+22,y=box['y']+22,id=1)]})
 target=destination(touch,.68,118);cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[dict(**target,id=1)]});cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 expect(knob(touch,1)).to_have_attribute('aria-valuenow','118')
 assert touch.locator('main').evaluate('e=>e.scrollTop')==position_before and touch.evaluate('currentAudio.anchor')==anchor
 changed=project(touch);assert changed['patterns'][1:]==original['patterns'][1:];assert any(n['velocity']!=old['velocity'] for n,old in zip(changed['patterns'][0]['notes'],original['patterns'][0]['notes']) if n['drum']==38)
 assert touch.locator('#velocity-graph').evaluate("e=>getComputedStyle(e).touchAction")=='none'
 # Pointer cancellation releases the editor for another drag.
 box=knob(touch,0).bounding_box();cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[dict(x=box['x']+22,y=box['y']+22,id=1)]});cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
 for width,height in [(320,740),(360,800),(393,851),(412,915),(768,1024),(1440,1000)]:
  touch.set_viewport_size(dict(width=width,height=height));touch.locator('main').evaluate('e=>e.scrollTop=0')
  assert touch.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  controls=touch.locator('.transport').bounding_box();assert abs(controls['y']+controls['height']-height)<2
  assert all(k.bounding_box()['width']>=44 and k.bounding_box()['height']>=44 for k in touch.locator('.velocity-point').all())
  touch.screenshot(path=f'/tmp/drumidi-velocity-{width}.png')
 assert not errors,errors;assert not missing,missing
 print('PASS: independent pattern/drum selectors; smooth curve mouse/touch/keyboard; 64th note/time/count isolation; fixed playback snapshot and uninterrupted clock; restart hears edits; pattern restarts; empty patterns; reset 100; reload; independent MIDI velocities/length; six widths; pointer cancel/no scroll; no missing files/JS errors.')
 browser.close()
