"""Crop/page handoff + fullscreen compatibility on Chromium and optional WebKit.
Set PLAYWRIGHT_BROWSERS_PATH to an installed browser location for WebKit.
"""
import io
import json
import math
import os
import threading
import tempfile
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from PIL import Image,ImageOps
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def do_GET(self):
        if self.path.startswith('/small-apps/'):self.path=self.path[len('/small-apps'):]
        super().do_GET()
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
ORIGIN=f'http://127.0.0.1:{server.server_port}'
fixtures={}
for kind,size,fmt in [('landscape',(600,300),'PNG'),('portrait',(300,600),'JPEG'),('square',(400,400),'WEBP')]:
    image=Image.new('RGB',size);pixels=image.load()
    for y in range(size[1]):
        for x in range(size[0]):pixels[x,y]=(30+(x//100)*30,40+(y//100)*30,100+((x//100+y//100)%3)*40)
    buffer=io.BytesIO();image.save(buffer,fmt,quality=98);fixtures[kind]=(image,buffer.getvalue(),fmt.lower())
exif=Image.Exif();exif[274]=6;encoded=io.BytesIO();fixtures['landscape'][0].save(encoded,'JPEG',quality=98,exif=exif);tagged=encoded.getvalue();fixtures['exif']=(ImageOps.exif_transpose(Image.open(io.BytesIO(tagged))).convert('RGB'),tagged,'jpeg')
alpha=fixtures['square'][0].convert('RGBA');alpha.paste((0,0,0,0),(0,0,200,200));encoded=io.BytesIO();alpha.save(encoded,'PNG');white=Image.new('RGBA',alpha.size,'white');white.alpha_composite(alpha);fixtures['transparent']=(white.convert('RGB'),encoded.getvalue(),'png')
def read_save(page):
    return page.evaluate("async()=>{const {readSession}=await import('./cutting/session.js');const s=await readSession();if(!s)return null;return {record:{...s.record,blob:Array.from(new Uint8Array(await s.record.blob.arrayBuffer()))},progress:s.progress}}")
def preview(page):
    return page.evaluate('''()=>{const canvas=document.getElementById('crop-canvas'),c=canvas.getContext('2d'),square=document.getElementById('crop-square').getBoundingClientRect(),r=canvas.getBoundingClientRect(),k=canvas.width/r.width;return [[.2,.2],[.8,.2],[.2,.8],[.8,.8]].map(([x,y])=>Array.from(c.getImageData(Math.floor((square.x-r.x+square.width*x)*k),Math.floor((square.y-r.y+square.height*y)*k),1,1).data).slice(0,3));}''')
def drag(page,context,points,mobile,engine):
    if mobile and engine=='chromium':
        c=context.new_cdp_session(page);c.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':points[0][0],'y':points[0][1]}]})
        for x,y in points[1:]:c.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y}]})
        c.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});c.detach()
    else:
        page.mouse.move(*points[0]);page.mouse.down()
        for point in points[1:]:page.mouse.move(*point)
        page.mouse.up()
try:
    with sync_playwright() as p:
        cases=[('chromium',1100,False),('chromium',320,True),('chromium',360,True),('chromium',390,True)]
        if os.environ.get('CROP_WEBKIT')=='1':cases += [('webkit',390,True),('webkit',768,True)]
        if os.environ.get('CROP_ENGINE'):cases=[case for case in cases if case[0]==os.environ['CROP_ENGINE']]
        browsers={};profiles=[]
        def make_context(engine,options):
            if engine=='webkit':
                profile=tempfile.TemporaryDirectory(prefix='brittz-webkit-');profiles.append(profile)
                return p.webkit.launch_persistent_context(profile.name,**options)
            return browsers[engine].new_context(**options)
        for engine,width,mobile in cases:
            if engine not in browsers:browsers[engine]=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium')) if engine=='chromium' else None
            browser=browsers[engine];options={'viewport':{'width':width,'height':900 if width==768 else 800},'has_touch':mobile,'is_mobile':mobile,'accept_downloads':True}
            if engine=='webkit':options['user_agent']='Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' if width==768 else 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
            context=make_context(engine,options);page=context.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
            page.goto(ORIGIN+'/small-apps/brittz-puzzle-palace/')
            # With no prior selection, auto-crop cancel leaves setup empty and no save.
            portrait,photo_bytes,photo_fmt=fixtures['portrait']
            page.locator('#source-file').set_input_files({'name':'First.jpeg','mimeType':'image/jpeg','buffer':photo_bytes});expect(page.locator('#photo-cropper')).to_be_visible();expect(page.locator('#crop-source')).to_contain_text('First.jpeg · 300 × 600');expect(page.locator('#crop-start')).to_be_hidden()
            page.locator('#close-crop').click();expect(page.locator('#gallery-screen')).to_be_visible();assert page.locator('#source-file').evaluate('e=>e.files.length')==0;assert read_save(page) is None
            # Preserve a real saved puzzle throughout opening/editing/downloading.
            image,data,fmt=fixtures['square'];page.locator('#source-file').set_input_files({'name':'Old.png','mimeType':'image/webp','buffer':data})
            # The ordinary setup correctly rejects WebP; seed its valid square PNG instead.
            expect(page.locator('#gallery-message')).to_contain_text('JPG or PNG');b=io.BytesIO();image.save(b,'PNG');page.locator('#source-file').set_input_files({'name':'Old.png','mimeType':'image/png','buffer':b.getvalue()});expect(page.locator('#gallery-message')).to_contain_text('Ready to shuffle');page.locator('#start-lab').click();expect(page.locator('.piece-slot')).to_have_count(50);page.locator('.piece-slot').first.click();page.locator('#back-gallery').click();old=read_save(page)
            # A square is ready directly. Canceling a later non-square candidate
            # restores this unsaved selection as well as preserving the saved game.
            candidate=io.BytesIO();Image.new('RGB',(128,128),'orange').save(candidate,'PNG');square_bytes=candidate.getvalue()
            page.locator('#source-file').set_input_files({'name':'Selected-square.png','mimeType':'image/png','buffer':square_bytes});expect(page.locator('#gallery-message')).to_contain_text('Selected-square.png · 128 × 128. Ready to shuffle.');expect(page.locator('#photo-cropper')).to_be_hidden();assert read_save(page)==old
            for cancel in ('button','back'):
                page.locator('#source-file').set_input_files({'name':'Canceled.jpeg','mimeType':'image/jpeg','buffer':photo_bytes});expect(page.locator('#photo-cropper')).to_be_visible();expect(page.locator('#crop-source')).to_contain_text('Canceled.jpeg · 300 × 600');assert read_save(page)==old
                if cancel=='button':page.locator('#close-crop').click()
                else:page.go_back()
                expect(page.locator('#gallery-screen')).to_be_visible();expect(page.locator('#gallery-message')).to_contain_text('Selected-square.png · 128 × 128. Ready to shuffle.');assert page.locator('#source-file').evaluate('e=>e.files[0].name')=='Selected-square.png';assert read_save(page)==old
            # The real Shuffle path proves cancellation retained the internal source.
            page.locator('#start-lab').click();expect(page.locator('#game-screen')).to_be_visible();expect(page.locator('.piece-slot')).to_have_count(50);assert bytes(read_save(page)['record']['blob'])==square_bytes;page.locator('.piece-slot').first.click();page.locator('#back-gallery').click();old=read_save(page)
            fs=page.locator('#fullscreen');assert fs.is_visible();boxes=page.locator('.title-row h1,#fullscreen').evaluate_all('es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,w:r.width,h:r.height}})');assert boxes[0]['right']<=boxes[1]['x'] and boxes[1]['w']>=44 and boxes[1]['h']>=44;assert boxes[1]['right']<=width
            def activate(selector):
                target=page.locator(selector)
                target.tap() if mobile else target.click()
            workers=sum('mosaic-worker.js' in url for url in requests)
            for kind,(original,data,fmt) in fixtures.items():
                if original.width!=original.height:
                    page.locator('#source-file').set_input_files({'name':f'{kind}.{fmt}','mimeType':f'image/{fmt}','buffer':data})
                    expect(page.locator('#photo-cropper')).to_be_visible();expect(page.locator('#crop-source')).to_contain_text(f'{kind}.{fmt} · {original.width} × {original.height}')
                else:
                    activate('#open-crop');expect(page.locator('#photo-cropper')).to_be_visible()
                    page.locator('#crop-file').set_input_files({'name':f'{kind}.{fmt}','mimeType':f'image/{fmt}','buffer':data})
                assert page.url.endswith('#crop-photo');expect(page.locator('#crop-save')).to_be_enabled();expect(page.locator('#crop-start')).to_be_hidden();expect(page.locator('#crop-start')).to_have_text('Continue to Puzzle')
                assert bytes(page.locator('#crop-file').evaluate('async e=>Array.from(new Uint8Array(await e.files[0].arrayBuffer()))'))==data
                if kind=='landscape':
                    page.go_back();expect(page.locator('#gallery-screen')).to_be_visible();activate('#open-crop');expect(page.locator('#crop-save')).to_be_enabled()
                    page.reload();expect(page.locator('#photo-cropper')).to_be_visible();page.locator('#crop-file').set_input_files({'name':f'{kind}.{fmt}','mimeType':f'image/{fmt}','buffer':data});expect(page.locator('#crop-save')).to_be_enabled()
                if mobile and engine=='webkit':
                    box=page.locator('#crop-frame').bounding_box();page.touchscreen.tap(box['x']+box['width']/2,box['y']+box['height']/2)
                # Independent center-framing expectation for this known block photo.
                samples=preview(page);w,h=original.size;side=min(w,h)
                for (u,v),sample in zip([(.2,.2),(.8,.2),(.2,.8),(.8,.8)],samples):
                    expected=original.getpixel((int((w-side)/2+side*u),int((h-side)/2+side*v)));assert max(abs(a-b) for a,b in zip(sample,expected))<12,(engine,kind,sample,expected)
                # Drags clamp at each extreme; zoom is a real range-key gesture.
                page.locator('#crop-frame').scroll_into_view_if_needed();r=page.locator('#crop-frame').bounding_box()
                for _ in range(3):drag(page,context,[(r['x']+r['width']*.25,r['y']+r['height']*.25),(r['x']+r['width']*.75,r['y']+r['height']*.75)],mobile,engine)
                if kind!='transparent':assert all(sample[0]>=20 and sample[1]>=25 and sample[2]>=80 for sample in preview(page)),'No blank crop corners'
                page.locator('#crop-zoom').press('End');assert page.locator('#crop-zoom').input_value()=='5'
                if kind=='portrait':
                    with page.expect_download() as edge:activate('#crop-save')
                    edgefile=f'/tmp/crop-edge-{engine}-{width}.jpg';edge.value.save_as(edgefile);edgeimage=Image.open(edgefile).convert('RGB')
                    assert all(20<=c[0]<=210 and 25<=c[1]<=210 and 80<=c[2]<=200 for c in [edgeimage.getpixel(pt) for pt in [(0,0),(1023,0),(0,1023),(1023,1023)]])
                activate('#crop-left');activate('#crop-right');activate('#crop-reset');assert page.locator('#crop-zoom').input_value()=='1'
                activate('#crop-right');turned=preview(page)
                for (u,v),sample in zip([(.2,.2),(.8,.2),(.2,.8),(.8,.8)],turned):
                    expected=original.getpixel((int(w/2+(v-.5)*side),int(h/2-(u-.5)*side)));assert max(abs(a-b) for a,b in zip(sample,expected))<12,(engine,kind,'rotation',sample,expected)
                page.locator('#crop-name').fill(f'My {kind}.jpg');pixels=preview(page)
                page.locator('#crop-save').scroll_into_view_if_needed()
                with page.expect_download() as pending:activate('#crop-save')
                download=pending.value;target=f'/tmp/crop-{engine}-{width}-{kind}.jpg';download.save_as(target);jpg=Image.open(target).convert('RGB');assert jpg.size==(1024,1024);assert download.suggested_filename==f'My {kind}.jpg'
                for (u,v),sample in zip([(.2,.2),(.8,.2),(.2,.8),(.8,.8)],pixels):assert max(abs(a-b) for a,b in zip(jpg.getpixel((int(u*1024),int(v*1024))),sample))<12
                expect(page.locator('#crop-status')).to_contain_text('cannot confirm');expect(page.locator('#crop-download')).to_be_visible();expect(page.locator('#crop-start')).to_be_visible();assert read_save(page)==old
                # Current framing must have been downloaded again after any edit.
                if kind=='landscape':
                    activate('#crop-reset');expect(page.locator('#crop-start')).to_be_hidden()
                    with page.expect_download() as retry:activate('#crop-save')
                    retry.value.cancel();expect(page.locator('#crop-start')).to_be_visible();expect(page.locator('#crop-status')).to_contain_text('cannot confirm')
                    with page.expect_download() as again:activate('#crop-download')
                    assert again.value.suggested_filename==f'My {kind}.jpg'
                if kind=='portrait':page.screenshot(path=f'/tmp/v11-cropper-{engine}-{width}.png',full_page=True)
                activate('#crop-start');expect(page.locator('#gallery-screen')).to_be_visible();expect(page.locator('#game-screen')).to_be_hidden();expect(page.locator('#gallery-message')).to_contain_text('1024 × 1024. Ready to shuffle.');assert read_save(page)==old
                assert sum('mosaic-worker.js' in url for url in requests)==workers,'Handoff must not generate geometry'
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            # Each difficulty uses the transferred in-memory JPG with normal Shuffle.
            for count in (50,100,150,200):
                page.locator('#master-count').select_option(str(count));page.locator('#start-lab').click();expect(page.locator('#game-screen')).to_be_visible();expect(page.locator('.piece-slot')).to_have_count(count);saved=read_save(page);assert bytes(saved['record']['blob'])==Path(target).read_bytes();page.reload();expect(page.locator('.piece-slot')).to_have_count(count);assert read_save(page)==saved;page.locator('#back-gallery').click()
            # Invalid files and failed canvas export remain recoverable.
            page.goto(ORIGIN+'/small-apps/brittz-puzzle-palace/#crop-photo');expect(page.locator('#photo-cropper')).to_be_visible();page.locator('#crop-file').set_input_files({'name':'bad.png','mimeType':'image/png','buffer':b'not a photo'});expect(page.locator('#crop-status')).to_contain_text('could not be opened');expect(page.locator('#crop-start')).to_be_hidden()
            page.locator('#crop-file').set_input_files({'name':'square.png','mimeType':'image/png','buffer':b.getvalue()});expect(page.locator('#crop-save')).to_be_enabled();page.evaluate("()=>{window.originalCropToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb){cb(null)}}");activate('#crop-save');expect(page.locator('#crop-status')).to_contain_text('Could not export');expect(page.locator('#crop-start')).to_be_hidden();page.evaluate('()=>{HTMLCanvasElement.prototype.toBlob=window.originalCropToBlob}');activate('#close-crop');expect(page.locator('#gallery-screen')).to_be_visible()
            # Supported native fullscreen or a visible rejection (never hidden button).
            fs.click();page.wait_for_timeout(200)
            entered=page.evaluate('!!(document.fullscreenElement||document.webkitFullscreenElement)')
            if engine=='chromium' and width==1100:assert entered,'Native Chromium fullscreen must enter from the title button'
            if entered:
                expect(fs).to_have_attribute('aria-pressed','true');fs.click();page.wait_for_function('!(document.fullscreenElement||document.webkitFullscreenElement)')
            else:expect(page.locator('#fullscreen-status')).to_be_visible()
            assert not errors,errors
            print(f'PASS {engine} {width}px: portrait/landscape/square/EXIF/alpha, preview/JPG pixels, no blank edges, original bytes, square/automatic routing, cancel protection, memory handoff, all counts, fullscreen/fallback.',flush=True)
            context.close()
        # Explicit iPhone/iPad capability/rejection branches, independent of host API.
        for engine,browser in browsers.items():
            for mode in ('unavailable','prefixed','rejected'):
                context=make_context(engine,{'viewport':{'width':390,'height':800},'has_touch':True,'is_mobile':True,'user_agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'})
                mock="window.fsCalls=0;Object.defineProperty(document,'fullscreenEnabled',{value:false,configurable:true});Object.defineProperty(document,'webkitFullscreenEnabled',{value:false,configurable:true});"
                if mode=='prefixed':mock+="Object.defineProperty(document,'webkitFullscreenEnabled',{value:true});Element.prototype.webkitRequestFullscreen=function(){window.fsCalls++;Object.defineProperty(document,'webkitFullscreenElement',{value:this,configurable:true});document.dispatchEvent(new Event('webkitfullscreenchange'))};document.webkitExitFullscreen=function(){window.fsCalls++;Object.defineProperty(document,'webkitFullscreenElement',{value:null,configurable:true});document.dispatchEvent(new Event('webkitfullscreenchange'))}"
                if mode=='rejected':mock+="Object.defineProperty(document,'fullscreenEnabled',{value:true});Element.prototype.requestFullscreen=function(){window.fsCalls++;return Promise.reject(Error('blocked for test'))};document.exitFullscreen=function(){}"
                context.add_init_script(mock)
                page=context.new_page();page.goto(ORIGIN+'/small-apps/brittz-puzzle-palace/');page.locator('#fullscreen').click()
                if mode=='prefixed':expect(page.locator('#fullscreen')).to_have_attribute('aria-pressed','true');page.locator('#fullscreen').click();expect(page.locator('#fullscreen')).to_have_attribute('aria-pressed','false');assert page.evaluate('fsCalls')==2,(engine,mode,page.evaluate('fsCalls'))
                else:
                    expect(page.locator('#fullscreen-status')).to_be_visible();expect(page.locator('#fullscreen-status')).to_contain_text('Home Screen');assert page.evaluate('fsCalls')==(1 if mode=='rejected' else 0)
                if mode=='unavailable':page.screenshot(path=f'/tmp/v11-apple-fullscreen-{engine}.png',full_page=True)
                context.close()
        for browser in browsers.values():
            if browser:browser.close()
        for profile in profiles:profile.cleanup()
finally:server.shutdown();server.server_close()
