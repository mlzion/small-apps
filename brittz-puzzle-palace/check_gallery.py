"""v1.2 real HTTP /small-apps/ gallery, original bytes, persistence and phone layout."""
import hashlib,json,os,tempfile,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from PIL import Image
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];APP=ROOT/'brittz-puzzle-palace'
manifest=json.loads((APP/'gallery.json').read_text());pictures=manifest['collections'][0]['images']
assert len(pictures)==12 and len({p['id'] for p in pictures})==12
for p in pictures:
    original=APP/p['image'];thumb=APP/p['thumbnail']
    assert hashlib.sha256(original.read_bytes()).hexdigest()==p['sha256']
    assert Image.open(original).size==(p['width'],p['height'])==(1280,1280)
    assert Image.open(thumb).size==(256,256) and thumb.stat().st_size<original.stat().st_size
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
    def do_GET(self):
        if self.path.startswith('/small-apps/'):self.path=self.path[len('/small-apps'):]
        super().do_GET()
    def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
entry=f'http://127.0.0.1:{server.server_port}/small-apps/brittz-puzzle-palace/'
def saved(page):
    return page.evaluate('''async()=>{const {readSession}=await import('./cutting/session.js');const s=await readSession();if(!s)return null;const bytes=await s.record.blob.arrayBuffer();return {record:{...s.record,blob:null},hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join(''),progress:s.progress};}''')
try:
 with sync_playwright() as pw:
  for engine in ['chromium','webkit']:
   for width in [320,360,390]:
    with tempfile.TemporaryDirectory(prefix='gallery-browser-') as profile:
     options=dict(viewport={'width':width,'height':800},is_mobile=True,has_touch=True,accept_downloads=True)
     if engine=='chromium':options['executable_path']=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium')
     context=getattr(pw,engine).launch_persistent_context(profile,**options);page=context.new_page();errors=[];bad=[];requests=[]
     page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:bad.append(r.url) if r.status>=400 else None);page.on('request',lambda r:requests.append(r.url))
     page.goto(entry);expect(page.locator('#open-picture-gallery')).to_be_enabled();expect(page.locator('#sample-image')).to_have_count(0)
     page.locator('#open-picture-gallery').tap();expect(page.locator('.picture-choice')).to_have_count(12)
     expect(page.locator('#picture-collections h3')).to_have_text('Ocean & Islands — Volume 1')
     for card in page.locator('.picture-choice').all():
      card.scroll_into_view_if_needed();expect(card.locator('img')).to_have_js_property('naturalWidth',256)
     assert not any('/ocean-islands/' in u and '/thumbnails/' not in u for u in requests),'Gallery must not fetch full originals before selection'
     if engine=='chromium' and width==360:
      page.locator('#picture-gallery').evaluate('e=>e.scrollTop=0');(APP/'docs/v1.2').mkdir(parents=True,exist_ok=True);page.screenshot(path=str(APP/'docs/v1.2/gallery-360.png'))
     page.locator('#close-picture-gallery').tap();assert saved(page) is None
     # All twelve actual pictures generate; rotate across all four difficulties.
     # Do this in both engines; other widths still check selection/layout/save.
     subset=pictures if width==360 else pictures[:1]
     previous=None
     for i,picture in enumerate(subset):
      page.locator('#open-picture-gallery').tap();page.locator(f'[data-picture="{picture["id"]}"]').tap();expect(page.locator('#picture-gallery')).not_to_be_visible()
      expect(page.locator('#setup-preview')).to_have_js_property('naturalWidth',1280);expect(page.locator('#photo-cropper')).to_be_hidden()
      expect(page.locator('#gallery-message')).to_contain_text(picture['title']+'.jpg');assert saved(page)==previous,'Selection must not write the save'
      if previous:
       boxes=page.locator('#start-lab,#resume-lab').evaluate_all('es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,w:r.width,h:r.height}})')
       assert abs(boxes[0]['y']-boxes[1]['y'])<1 and boxes[0]['right']<=boxes[1]['x'] and all(b['h']>=44 and b['w']>=100 for b in boxes)
       if engine=='chromium' and width==360 and i==1:page.screenshot(path=str(APP/'docs/v1.2/setup-360.png'),full_page=True)
      count=[50,100,150,200][i%4];page.locator('#master-count').select_option(str(count));page.locator('#start-lab').tap();expect(page.locator('.piece-slot')).to_have_count(count)
      current=saved(page);assert current['hash']==picture['sha256'] and current['record']['pattern']['pieceCount']==count
      page.locator('.piece-slot').first.tap();expect(page.locator('#art>.loose')).to_have_count(1);page.locator('#back-gallery').tap();previous=saved(page)
     # Both actions must render side by side at every phone width.
     boxes=page.locator('#start-lab,#resume-lab').evaluate_all('es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,w:r.width,h:r.height}})')
     assert abs(boxes[0]['y']-boxes[1]['y'])<1 and boxes[0]['right']<=boxes[1]['x'] and all(b['h']>=44 and b['w']>=100 for b in boxes)
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
     page.locator('#open-picture-gallery').tap();page.locator('#close-picture-gallery').tap();assert saved(page)==previous
     # Candidate gallery image, reload, then resume the prior exact save.
     page.locator('#open-picture-gallery').tap();page.locator('[data-picture="hawaiian-sunset"]').tap();assert saved(page)==previous
     page.reload();expect(page.locator('#game-screen')).to_be_visible();assert saved(page)==previous
     page.locator('#back-gallery').tap();page.locator('#resume-lab').tap();expect(page.locator('#game-screen')).to_be_visible();assert saved(page)==previous
     # Completed built-in artwork can export, unfinished cannot.
     expect(page.locator('#export-certificate')).to_be_disabled()
     page.evaluate('''async()=>{const {readSession}=await import('./cutting/session.js');const {mosaicPuzzle}=await import('./cutting/image-puzzle.js');const {record,progress}=await readSession();const p=mosaicPuzzle(record.pattern,{url:'unused',name:record.name});for(const piece of p.pieces)Object.assign(progress.game.states[piece.id],{location:'locked',x:piece.cx,y:piece.cy,angle:0});const db=await new Promise(resolve=>{const r=indexedDB.open('brittz-mosaic-lab',1);r.onsuccess=()=>resolve(r.result)});await new Promise(resolve=>{const t=db.transaction('active','readwrite');t.objectStore('active').put(progress,'progress');t.oncomplete=resolve});db.close();}''')
     page.reload();expect(page.locator('#complete')).to_be_visible();page.locator('#player-name').fill('Ocean Explorer')
     with page.expect_download() as download:page.locator('#export-certificate').tap()
     image=Image.open(download.value.path());assert image.format=='JPEG' and image.size==(1600,1890)
     # Compare certificate artwork samples to unchanged original JPG (lossy tolerance).
     original=Image.open(APP/subset[-1]['image'])
     for x,y in [(0.25,0.25),(0.5,0.5),(0.75,0.75)]:
      # Resize exactly as certificate canvas does, compare small patches to avoid edge interpolation differences.
      import PIL.ImageStat
      a=image.crop((100+int(x*1400)-3,220+int(y*1400)-3,100+int(x*1400)+4,220+int(y*1400)+4));b=original.resize((1400,1400)).crop((int(x*1400)-3,int(y*1400)-3,int(x*1400)+4,int(y*1400)+4))
      assert max(abs(u-v) for u,v in zip(PIL.ImageStat.Stat(a).mean,PIL.ImageStat.Stat(b).mean))<20
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors;assert not bad,bad
     print(f'PASS {engine} {width}px: thumbnails, original bytes, generation, selection save safety, reload/resume, certificate, horizontal actions, no overflow.',flush=True)
     context.close()
finally:server.shutdown()
