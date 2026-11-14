"""Run from repository root: python picturepaint/test-browser.py."""
from pathlib import Path
from urllib.parse import urlsplit
from io import BytesIO
import json
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
# Supersampling produces curved antialiased boundaries and an irregular neighbor.
im=Image.new('RGB',(800,480),'white');d=ImageDraw.Draw(im)
d.ellipse((20,20,380,440),outline='black',width=8)
d.polygon([(420,30),(760,60),(700,200),(760,420),(440,430),(480,240)],outline='black',width=8)
im=im.resize((400,240),Image.Resampling.LANCZOS);b=BytesIO();im.save(b,format='PNG');fixture=b.getvalue()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium')
 errors=[];missing=[];requests=[]
 def serve(route):
  path=urlsplit(route.request.url).path.removeprefix('/small-apps/').lstrip('/');requests.append(path)
  file=ROOT/path
  if file.is_dir():file/='index.html'
  if not file.is_file():missing.append(path);route.fulfill(status=404);return
  mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}
  route.fulfill(path=str(file),content_type=mime.get(file.suffix,'text/plain'))
 def setup(context):
  context.route('http://app-lab.test/**',serve);context.on('weberror',lambda e:errors.append(str(e)))
 ctx=browser.new_context(viewport={'width':1280,'height':1000},accept_downloads=True);setup(ctx);page=ctx.new_page()
 page.goto('http://app-lab.test/small-apps/');page.get_by_role('link',name='Launch PicturePaint').click()
 expect(page.locator('#library-dialog')).to_be_visible();assert 'picturepaint/drawings/hibiscus.png' not in requests
 page.locator('.drawing-card').click();expect(page.locator('#dimensions')).to_have_text('1280 × 1280',timeout=30000)
 expect(page.locator('#save')).to_be_enabled()
 # Real supplied JPEG-derived artwork: separated petals and a leaf fill cleanly.
 def hibiscus_pixel(x,y):return page.evaluate("([x,y])=>Array.from(document.querySelector('#surface').getContext('2d').getImageData(x,y,1,1).data)",[x,y])
 for x,y in [(500,300),(1000,600),(600,1000),(150,1000)]:
  pos=page.evaluate("([x,y])=>{const b=document.querySelector('#stage').getBoundingClientRect(),m=new DOMMatrix(getComputedStyle(document.querySelector('#surface')).transform);return {x:b.left+m.e+x*m.a,y:b.top+m.f+y*m.d}}",[x,y])
  page.mouse.click(pos['x'],pos['y']);assert all(abs(a-b)<=5 for a,b in zip(hibiscus_pixel(x,y)[:3],[255,0,0])),(x,y,hibiscus_pixel(x,y))
  assert min(hibiscus_pixel(5,5)[:3])>240
  page.locator('#undo').click();assert min(hibiscus_pixel(x,y)[:3])>240
 page.locator('#upload-file').set_input_files({'name':'shapes.png','mimeType':'image/png','buffer':fixture})
 expect(page.locator('#dimensions')).to_have_text('400 × 240');expect(page.locator('#save')).to_be_enabled()
 def point(x,y):
  # DOMMatrix is the actual CSS transform; this tests image coordinates through the UI.
  return page.evaluate('''([x,y])=>{const s=document.querySelector('#stage').getBoundingClientRect(),m=new DOMMatrix(getComputedStyle(document.querySelector('#surface')).transform);return {x:s.left+m.e+x*m.a,y:s.top+m.f+y*m.d}}''',[x,y])
 def tap(x,y):
  pos=point(x,y);page.mouse.click(pos['x'],pos['y'])
 def pixel(x,y):return page.evaluate('''([x,y])=>Array.from(document.querySelector('#surface').getContext('2d').getImageData(x,y,1,1).data)''',[x,y])
 tap(100,120);assert pixel(100,120)[:3]==[255,0,0];assert pixel(290,120)[:3]==[255]*3
 page.locator('#gradient').click();page.locator('#color1').fill('#ff0000');page.locator('#color2').fill('#0000ff')
 for angle in [0,45,90,180,270,360]:
  page.locator('#angle').fill(str(angle));tap(290,120)
  expect(page.locator('#degrees')).to_have_text(str(angle)+'°')
  mid=pixel(290,120);assert mid[0]>10 and mid[2]>10 and mid[1]==0
  # Check direction using two interior points along the requested axis.
  a,b=((260,120),(320,120)) if angle in [0,180,360] else ((290,90),(290,150))
  pa,pb=pixel(*a),pixel(*b)
  assert (pa[0]>pb[0]) == (angle not in [180,270]),(angle,pa,pb)
 page.locator('#undo').click();before=pixel(290,90);page.locator('#redo').click();assert before!=pixel(290,90)
 page.locator('#outlines').click();assert pixel(10,120)[:3]==[255]*3
 page.locator('#outlines').click();assert min(pixel(10,120)[:3])<150
 # Desktop wheel zoom and Hand drag change only the viewport.
 page.locator('#stage').hover();old_zoom=page.locator('#zoom').text_content();page.mouse.wheel(0,-150)
 expect(page.locator('#zoom')).not_to_have_text(old_zoom)
 page.locator('#hand').click();box=page.locator('#stage').bounding_box();x,y=box['x']+100,box['y']+100
 page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+30,y+20);page.mouse.up();page.locator('#hand').click()
 assert pixel(100,120)[:3]==[255,0,0]
 page.locator('#fit').click();page.locator('#zoom-in').click();tap(100,120);assert pixel(100,120)[2]>0
 page.locator('#undo').click();assert pixel(100,120)[:3]==[255,0,0]
 with page.expect_download() as event:page.locator('#save').click()
 project=Path(event.value.path()).read_text();obj=json.loads(project);assert obj['width']==400 and len(obj['fills'])==2
 assert sorted(f['style']['mode'] for f in obj['fills'])==['gradient','solid']
 assert next(f['style']['angle'] for f in obj['fills'] if f['style']['mode']=='gradient')==360
 with page.expect_download() as event:page.locator('#export').click()
 exported=Image.open(event.value.path());assert exported.size==(400,240) and exported.format=='JPEG';assert exported.getpixel((100,120))[0]>200
 page.locator('#outlines').click()
 with page.expect_download() as event:page.locator('#export').click()
 hidden=Image.open(event.value.path());assert min(hidden.getpixel((10,120)))>240;assert min(hidden.getpixel((399,239)))>240
 with page.expect_download() as event:page.locator('#save').click()
 hidden_project=Path(event.value.path()).read_text();assert json.loads(hidden_project)['outlines'] is False
 page.locator('#open-file').set_input_files({'name':'hidden.picturepaint','mimeType':'application/json','buffer':hidden_project.encode()})
 expect(page.locator('#drawing-title')).to_have_text('hidden');expect(page.locator('#outlines')).to_have_text('Show outlines')
 page.locator('#open-file').set_input_files({'name':'restored.picturepaint','mimeType':'application/json','buffer':project.encode()})
 expect(page.locator('#drawing-title')).to_have_text('restored');expect(page.locator('#save')).to_be_enabled();assert pixel(100,120)[:3]==[255,0,0];assert pixel(290,120)[2]>10;tap(100,120);page.locator('#undo').click();assert pixel(100,120)[:3]==[255,0,0]
 # Edge-connected regions can be painted; malformed projects preserve the active painting.
 tap(395,235);assert pixel(395,235)[:3] != [255]*3
 page.locator('#undo').click();assert pixel(395,235)[:3] == [255]*3
 page.locator('#open-file').set_input_files({'name':'invalid.picturepaint','mimeType':'application/json','buffer':b'{"format":"wrong"}'})
 expect(page.locator('#status')).to_contain_text('invalid');expect(page.locator('#dimensions')).to_have_text('400 × 240')
 for width,height in [(320,812),(375,812),(768,1024),(1024,768),(1440,900)]:
  page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.set_viewport_size({'width':1280,'height':1000});page.screenshot(path='/tmp/picturepaint-desktop.png',full_page=True)
 mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,accept_downloads=True);setup(mobile);touch=mobile.new_page();touch.goto('http://app-lab.test/small-apps/picturepaint/');touch.locator('#close-library').tap();touch.locator('#upload-file').set_input_files({'name':'shapes.png','mimeType':'image/png','buffer':fixture});expect(touch.locator('#save')).to_be_enabled()
 box=touch.locator('#stage').bounding_box();x,y=box['x']+box['width']/2,box['y']+box['height']/2
 client=mobile.new_cdp_session(touch)
 def gesture(kind,points):client.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':a,'y':b,'id':i} for i,(a,b) in enumerate(points)]})
 before=touch.locator('#surface').get_attribute('style');gesture('touchStart',[(x-30,y),(x+30,y)]);gesture('touchMove',[(x-60,y+10),(x+80,y+10)]);gesture('touchEnd',[])
 assert touch.locator('#surface').get_attribute('style')!=before;expect(touch.locator('#undo')).to_be_disabled();assert touch.evaluate('scrollY')==0
 touch.locator('#fit').tap();s=touch.locator('#surface').bounding_box();touch.touchscreen.tap(s['x']+s['width']*.25,s['y']+s['height']*.5);expect(touch.locator('#undo')).to_be_enabled();touch.screenshot(path='/tmp/picturepaint-mobile.png',full_page=True)
 for app in ['calculator','breakout','falling-blocks','d-fuze','celphonica','synth-lab','laserbreak','drumidi','chordmidi']:
  smoke=ctx.new_page();smoke.goto('http://app-lab.test/small-apps/'+app+'/');smoke.wait_for_timeout(150);assert smoke.locator('body').inner_text().strip();smoke.close()
 assert not errors,errors;assert not missing,missing
 browser.close();print('PASS: lazy library, worker, antialiased irregular/neighbor fills, six gradient angles, zoomed fill, history, outlines, JPG, project round trip, malformed input, edge-connected fill, five viewport sizes, mobile tap/pinch/pan and Pages paths')
