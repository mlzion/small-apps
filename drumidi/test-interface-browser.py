"""Phase 1.4: fullscreen, naming/exports, color paste, gesture actions and square bars."""
import json,os
from pathlib import Path
from urllib.parse import unquote,urlsplit
from playwright.sync_api import sync_playwright,expect
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
 def context(**options):
  c=browser.new_context(**options);c.route(ORIGIN+'/**',serve);c.on('weberror',lambda e:errors.append(str(e)));return c
 def project(page):return page.evaluate("JSON.parse(localStorage.getItem('app-lab-drumidi-v1'))")
 c=context(viewport={'width':1000,'height':900});page=c.new_page()
 # Real Fullscreen API at both deployment roots; fullscreen document contains dialogs.
 for prefix in ['/','/small-apps/']:
  page.goto(ORIGIN+prefix+'drumidi/');assert page.evaluate('document.fullscreenElement===null')
  expect(page.locator('#pattern-menu, #library-menu')).to_have_count(0)
  page.get_by_role('button',name='Enter fullscreen',exact=True).click();page.wait_for_function('document.fullscreenElement===document.documentElement')
  for name in ['velocity','arrangement','pattern']:
   page.locator('#'+name+'-tab').click();assert page.evaluate('document.fullscreenElement===document.documentElement')
  page.locator('#settings').click();expect(page.locator('#project-name')).to_be_visible();assert page.evaluate('document.fullscreenElement!==null');page.get_by_label('Close project settings').click()
  page.get_by_role('button',name='Exit fullscreen',exact=True).click();page.wait_for_function('document.fullscreenElement===null');expect(page.locator('#fullscreen')).to_have_attribute('aria-pressed','false')
  page.locator('#fullscreen').click();page.wait_for_function('document.fullscreenElement!==null');page.evaluate('document.exitFullscreen()');page.wait_for_function('document.fullscreenElement===null');expect(page.locator('#fullscreen')).to_have_attribute('aria-label','Enter fullscreen')
  page.locator('#fullscreen').click();page.wait_for_function('document.fullscreenElement!==null')
  page.evaluate('''()=>{const exit=document.exitFullscreen.bind(document);document.exitFullscreen=async()=>{sessionStorage.setItem('fullscreenExitRequested','yes');await exit();sessionStorage.setItem('fullscreenAfterExit',String(!!document.fullscreenElement));};}''')
  page.get_by_role('link',name='Back to App Lab',exact=True).click();expect(page).to_have_url(ORIGIN+prefix)
  assert page.evaluate('document.fullscreenElement===null');assert page.evaluate("sessionStorage.getItem('fullscreenExitRequested')")=='yes';assert page.evaluate("sessionStorage.getItem('fullscreenAfterExit')")=='false'
  page.get_by_role('link',name='Launch DruMidi',exact=True).click();expect(page).to_have_url(ORIGIN+prefix+'drumidi/')
 print('PASS: real fullscreen enter/exit/external exit, tab/modal persistence and gallery exit at both roots',flush=True)
 # Explicit unsupported/rejected API paths are graceful.
 no=context();no.add_init_script("Object.defineProperty(document,'fullscreenEnabled',{value:false})");p=no.new_page();p.goto(ORIGIN+'/drumidi/');expect(p.locator('#fullscreen')).to_be_disabled();expect(p.locator('#fullscreen')).to_have_attribute('aria-label','Fullscreen unavailable in this browser')
 denied=context();denied.add_init_script("Element.prototype.requestFullscreen=()=>Promise.reject(new Error('test denial'))");p=denied.new_page();p.goto(ORIGIN+'/drumidi/');p.locator('#fullscreen').click();expect(p.locator('#status')).to_contain_text('Fullscreen could not be changed');assert p.evaluate('document.fullscreenElement===null')
 # Settings name persists immediately and filenames follow the examples.
 page.locator('#settings').click();expect(page.locator('#project-name')).to_have_value('DruMidi Project');page.locator('#project-name').fill('Rock Beat 1');assert project(page)['name']=='Rock Beat 1'
 with page.expect_download() as dl:page.locator('#save-project').click()
 assert dl.value.suggested_filename=='Rock Beat 1.json';assert json.loads(Path(dl.value.path()).read_text())['name']=='Rock Beat 1'
 page.get_by_label('Close project settings').click();page.locator('#pattern').click();page.locator('#pattern-options button').nth(2).click()
 with page.expect_download() as dl:page.locator('#export').click()
 assert dl.value.suggested_filename=='Rock Beat 1-P3.mid'
 page.locator('#velocity-tab').click()
 with page.expect_download() as dl:page.locator('#export').click()
 assert dl.value.suggested_filename=='Rock Beat 1-P3.mid'
 page.locator('#arrangement-tab').click()
 with page.expect_download() as dl:page.locator('#export').click()
 assert dl.value.suggested_filename=='Rock Beat 1.mid'
 page.locator('#settings').click();page.locator('#project-name').fill('CON');
 with page.expect_download() as dl:page.locator('#save-project').click()
 assert dl.value.suggested_filename=='_CON.json'
 page.locator('#project-name').fill('Rock: Beat/1?');
 with page.expect_download() as dl:page.locator('#save-project').click()
 assert dl.value.suggested_filename=='Rock_ Beat_1_.json'
 # Legacy file import uses its filename; stored names take priority. Legacy local storage uses default.
 legacy=project(page);legacy.pop('name')
 page.once('dialog',lambda d:d.accept());page.locator('#project-file').set_input_files({'name':'Legacy Session.JSON','mimeType':'application/json','buffer':json.dumps(legacy).encode()});expect(page.locator('#project-dialog')).to_be_hidden();assert project(page)['name']=='Legacy Session'
 page.locator('#settings').click();stored=project(page);stored['name']='Stored Beat';page.once('dialog',lambda d:d.accept());page.locator('#project-file').set_input_files({'name':'Different.json','mimeType':'application/json','buffer':json.dumps(stored).encode()});expect(page.locator('#project-dialog')).to_be_hidden();assert project(page)['name']=='Stored Beat'
 page.evaluate("p=>localStorage.setItem('app-lab-drumidi-v1',JSON.stringify(p))",legacy);page.reload();assert project(page)['name']=='DruMidi Project'
 page.locator('#settings').click();page.locator('#project-name').fill('Keep me');page.once('dialog',lambda d:d.accept());page.locator('#new-project').click();assert project(page)['name']=='DruMidi Project'
 # Gesture-only actions and a colored source copied into a differently colored referenced destination.
 mobile=context(viewport={'width':393,'height':851},is_mobile=True,has_touch=True,device_scale_factor=2);touch=mobile.new_page();touch.goto(ORIGIN+'/small-apps/drumidi/')
 fixture=touch.evaluate('''()=>{const p=DruMidi.fresh();p.patterns[0]={id:'P1',bars:2,color:'orange',notes:[{drum:35,step:0,velocity:82},{drum:38,step:127,velocity:68}]};p.patterns[1].color='green';p.patterns[2].notes=[{drum:42,step:0,velocity:90}];p.arrangement.lanes=[[{id:'a',pattern:'P1',start:0}],[{id:'b',pattern:'P3',start:2}],[{id:'c',pattern:'P2',start:4}]];localStorage.setItem('app-lab-drumidi-v1',JSON.stringify(p));return p;}''');touch.reload()
 def color(target):return target.evaluate("e=>getComputedStyle(e).getPropertyValue('--pattern-color').trim()")
 touch.locator('#pattern').click(button='right');touch.locator('#copy-pattern').tap();touch.get_by_label('Close pattern actions').tap();touch.locator('#pattern').tap();touch.locator('#pattern-options button').nth(1).tap();assert color(touch.locator('#pattern'))=='#46b96d'
 touch.locator('#pattern').click(button='right');touch.once('dialog',lambda d:d.accept());touch.locator('#paste-pattern').tap();actual=project(touch);assert actual['patterns'][1]['color']=='orange' and actual['patterns'][1]['notes']==fixture['patterns'][0]['notes'];assert actual['arrangement']==fixture['arrangement'];assert color(touch.locator('#pattern'))=='#e99a38'
 touch.locator('#pattern').tap();assert color(touch.locator('#pattern-options button').nth(1))=='#e99a38';touch.get_by_label('Close pattern selector').tap()
 cdp=mobile.new_cdp_session(touch)
 def hold(target):
  target.scroll_into_view_if_needed();b=target.bounding_box();cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[dict(x=b['x']+b['width']/2,y=b['y']+b['height']/2,id=1)]});touch.wait_for_timeout(650);cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});expect(touch.locator('#pattern-dialog')).to_be_visible()
 hold(touch.locator('#pattern'));touch.get_by_label('Close pattern actions').tap();touch.locator('#pattern').tap();hold(touch.locator('#pattern-options button').first);touch.get_by_label('Close pattern actions').tap()
 touch.locator('#arrangement-tab').tap();hold(touch.locator('.library-pattern').nth(1));touch.get_by_label('Close pattern actions').tap()
 expect(touch.locator('.lane').nth(0)).to_have_attribute('aria-label','Lane A — Backbone');expect(touch.locator('.lane').nth(1)).to_have_attribute('aria-label','Lane B — Cymbals');expect(touch.locator('.lane').nth(2)).to_have_attribute('aria-label','Lane C — Fills')
 assert color(touch.locator('.library-pattern').nth(1))=='#e99a38';assert color(touch.locator('.lane-c .clip'))=='#e99a38'
 with touch.expect_download() as dl:touch.locator('#export').tap()
 midi=Path(dl.value.path()).read_bytes();assert b'Lane A - Backbone' in midi and b'Lane B - Cymbals' in midi and b'Lane C - Fills' in midi
 assert midi.index(b'Lane A - Backbone')<midi.index(b'Lane B - Cymbals')<midi.index(b'Lane C - Fills')
 for width,height in [(320,740),(360,800),(393,851),(412,915),(768,1024),(1440,1000)]:
  touch.set_viewport_size(dict(width=width,height=height));touch.locator('main').evaluate('e=>e.scrollTop=0');touch.wait_for_timeout(50)
  assert touch.evaluate('document.documentElement.scrollWidth<=innerWidth')
  touch.screenshot(path=f'/tmp/drumidi-interface-{width}.png')
  assert touch.locator('main').evaluate('e=>e.scrollHeight<=e.clientHeight+2'), (width,height,touch.locator('main').evaluate('e=>[e.scrollHeight,e.clientHeight]'))
  drop=touch.locator('.bar-slot').first.bounding_box();assert 54<=drop['width']<=60 and abs(drop['width']-drop['height'])<1
  bar2=touch.locator('.lane-c .clip').bounding_box();assert abs(bar2['width']-(2*drop['width']+3))<1
  touch.screenshot(path=f'/tmp/drumidi-interface-{width}.png')
 assert project(touch)['arrangement']==fixture['arrangement']
 assert not errors,errors;assert not missing,missing
 print('PASS: project names/defaults/legacy file and local migration; Windows filenames; source color paste across selectors/clips; unchanged lane arrays/MIDI order with new labels; right-click/long-press without ellipses; square 56 px bars and all three lanes at six sizes; both hosting roots; no errors/missing assets.')
 browser.close()
