"""v1.0 main/lab migration, visual feedback and raster certificate regression."""
import io
import math
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote,urlsplit
from PIL import Image
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
ORIGIN='http://release.test'
def serve(route):
    path=unquote(urlsplit(route.request.url).path)
    if path.startswith('/small-apps/'):path=path[len('/small-apps'):]
    file=(ROOT/path.lstrip('/')).resolve()
    if not file.is_relative_to(ROOT):return route.fulfill(status=403)
    if file.is_dir():file/='index.html'
    if not file.is_file():return route.fulfill(status=404)
    route.fulfill(path=str(file),content_type=mimetypes.guess_type(file)[0] or 'text/plain')
colors=[(31,131,171),(231,171,51),(91,181,101),(181,91,151)]
fixture=Image.new('RGB',(256,256));pixels=fixture.load()
for y in range(256):
    for x in range(256):pixels[x,y]=colors[(x>=128)+2*(y>=128)]
buffer=io.BytesIO();fixture.save(buffer,'PNG');source=buffer.getvalue()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
    for width,count,prefix in ((1100,50,'/'),(320,200,'/small-apps/'),(360,100,'/small-apps/'),(390,150,'/small-apps/')):
        mobile=width<500
        uploaded=source;expected_colors=colors
        if width==390:
            transparent=fixture.convert('RGBA');transparent.paste((0,0,0,0),(0,0,128,128));png=io.BytesIO();transparent.save(png,'PNG');uploaded=png.getvalue();expected_colors=[(255,255,255),*colors[1:]]
        context=browser.new_context(viewport={'width':width,'height':800 if mobile else 1100},has_touch=mobile,is_mobile=mobile,accept_downloads=True)
        context.route(ORIGIN+'/**',serve)
        context.add_init_script('''
            if(!localStorage.getItem('brittz-sea-turtle-v1'))localStorage.setItem('brittz-sea-turtle-v1','preserve v0.1 bytes');
            if(!localStorage.getItem('brittz-puzzle:sea-turtle-v1:v1'))localStorage.setItem('brittz-puzzle:sea-turtle-v1:v1','preserve v0.2 bytes');
            window.certificateText=[];window.certificateDraw=null;
            const text=CanvasRenderingContext2D.prototype.fillText;
            CanvasRenderingContext2D.prototype.fillText=function(...args){if(this.canvas.width===1600)window.certificateText.push(args[0]);return text.apply(this,args)};
            const draw=CanvasRenderingContext2D.prototype.drawImage;
            CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.width===1600)window.certificateDraw={src:args[0].src,original:[args[0].naturalWidth,args[0].naturalHeight],rect:args.slice(1)};return draw.apply(this,args)};
        ''')
        page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        entry=ORIGIN+prefix+'brittz-puzzle-palace/'
        # Stage a v0.4-format record in the lab; the main app must reuse it directly.
        page.goto(entry+'cutting/');page.locator('#source-file').set_input_files({'name':'Reef.png','mimeType':'image/png','buffer':uploaded});expect(page.locator('#gallery-message')).to_contain_text('Ready to shuffle');page.locator('#master-count').select_option(str(count));page.locator('#start-lab').click();expect(page.locator('.piece-slot')).to_have_count(count)
        engine=entry+'cutting/'
        def saved():
            return page.evaluate('''async engine=>{const {readSession}=await import(engine+'session.js');const {record,progress}=await readSession();return {record:{...record,blob:Array.from(new Uint8Array(await record.blob.arrayBuffer()))},progress};}''',engine)
        edge_id=page.evaluate('''async engine=>{const {readSession}=await import(engine+'session.js');const {mosaicPuzzle}=await import(engine+'image-puzzle.js');return mosaicPuzzle((await readSession()).record.pattern,{url:'unused',name:'Test'}).pieces.sort((a,b)=>Math.hypot(b.cx-500,b.cy-500)-Math.hypot(a.cx-500,a.cy-500))[0].id}''',engine)
        page.locator(f'.piece-slot[data-piece="{edge_id}"]').click();selected=page.locator('#art>.selected');outline=selected.locator('.image-outline');path=outline.get_attribute('d')
        def red():assert outline.evaluate("e=>{const s=getComputedStyle(e);return s.stroke==='rgb(255, 32, 32)'&&parseFloat(s.strokeWidth)>=4&&s.vectorEffect==='non-scaling-stroke'}")
        red();page.locator('#workspace-move').click()
        session=context.new_cdp_session(page) if mobile else None
        def drag(points):
            if mobile:
                session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':points[0][0],'y':points[0][1]}]})
                for x,y in points[1:]:session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y}]})
                session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            else:
                page.mouse.move(*points[0]);page.mouse.down()
                for point in points[1:]:page.mouse.move(*point)
                page.mouse.up()
        pad=page.locator('#move-pad');pad.scroll_into_view_if_needed();b=pad.bounding_box();drag([(b['x']+60,b['y']+60),(b['x']+72,b['y']+68)]);red()
        wheel=page.locator('#rotation-wheel');wheel.scroll_into_view_if_needed();b=wheel.bounding_box();drag([(b['x']+60+54*math.cos(math.radians(a)),b['y']+60+54*math.sin(math.radians(a))) for a in (15,20,25,30,35,40)]);red();assert outline.get_attribute('d')==path
        page.locator('#workspace-select').click();assert page.locator('#tray').evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(232, 232, 232)';assert page.locator('.piece-slot').first.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(232, 232, 232)'
        page.locator('.piece-slot').first.click();expect(page.locator('#art>.loose')).to_have_count(2)
        assert page.locator('#art>.loose:not(.selected) .image-outline').evaluate('e=>getComputedStyle(e).stroke')=='rgb(0, 0, 0)'
        page.locator('#sound').click();before=saved();assert before['progress']['sound'] is False
        page.goto(entry);expect(page.locator('.piece-slot')).to_have_count(count-2);assert saved()==before
        expect(page.locator('#sound')).to_have_attribute('aria-pressed','false');expect(page.locator('#master-rotation')).to_have_count(0)
        expect(page.locator('#export-certificate')).to_be_disabled();page.evaluate("document.getElementById('certificate-form').dispatchEvent(new Event('submit',{cancelable:true}))");assert not page.locator('#certificate-download').get_attribute('href')
        page.locator('#reference-view').click();expect(page.locator('#export-certificate')).to_be_disabled();page.locator('#puzzle-view').click()
        page.locator('#back-gallery').click();expect(page.locator('#legacy-notice')).to_be_visible();expect(page.locator('#legacy-notice a')).to_have_attribute('href','legacy.html')
        assert page.evaluate("localStorage.getItem('brittz-sea-turtle-v1')")=='preserve v0.1 bytes';assert page.evaluate("localStorage.getItem('brittz-puzzle:sea-turtle-v1:v1')")=='preserve v0.2 bytes'
        page.locator('a.back').click();expect(page.locator('.launch-link[href="brittz-puzzle-palace/"]')).to_be_visible();expect(page.locator('a[href="picturepaint/"]')).to_be_visible()
        # Seed completion only to isolate certificate eligibility/rendering. Native
        # all-piece completion remains covered by the shared precision protocol.
        page.evaluate('''async engine=>{
            const {mosaicPuzzle}=await import(engine+'image-puzzle.js');const {readSession}=await import(engine+'session.js');const {record,progress}=await readSession();const puzzle=mosaicPuzzle(record.pattern,{url:'unused',name:record.name});
            for(const p of puzzle.pieces)Object.assign(progress.game.states[p.id],{location:'locked',x:p.cx,y:p.cy,angle:0});
            const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('brittz-mosaic-lab',1);r.onsuccess=()=>resolve(r.result);r.onerror=reject});
            await new Promise((resolve,reject)=>{const tx=db.transaction('active','readwrite');tx.objectStore('active').put(progress,'progress');tx.oncomplete=resolve;tx.onabort=reject});db.close();
        }''',engine)
        page.locator('.launch-link[href="brittz-puzzle-palace/"]').click();expect(page.locator('#complete')).to_be_visible();expect(page.locator('#counter')).to_have_text(f'{count} / {count} pieces placed');expect(page.locator('#export-certificate')).to_be_enabled()
        assert page.locator('#art>.selected').count()==0;assert page.locator('#art .image-outline').evaluate_all("es=>es.every(e=>getComputedStyle(e).stroke!=='rgb(255, 32, 32)')")
        page.locator('#player-name').fill('Britt & Róisín')
        with page.expect_download() as pending:page.locator('#export-certificate').click()
        download=pending.value;target=f'/tmp/v1-certificate-{width}.jpg';download.save_as(target);image=Image.open(target);assert image.format=='JPEG' and image.size==(1600,1890)
        drawing=page.evaluate('window.certificateDraw');assert drawing['rect']==[100,220,1400,1400] and drawing['original']==[256,256]
        original=page.evaluate('async url=>Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer()))',drawing['src']);assert bytes(original)==uploaded,'Certificate must use the unchanged uploaded image; exporting must not revoke it'
        text=page.evaluate('window.certificateText');assert 'Brittz Puzzle Palace' in text and 'Reef.png' in text and f'{count} pieces · Every piece in its place' in text and 'Completed by Britt & Róisín' in text
        for i,color in enumerate(expected_colors):
            actual=image.getpixel((100+350+(i%2)*700,220+350+(i//2)*700));assert all(abs(a-b)<=8 for a,b in zip(actual,color)),(actual,color)
        expect(page.locator('#certificate-download')).to_be_visible();page.locator('#reference-view').click();expect(page.locator('#complete')).to_be_hidden();expect(page.locator('#certificate-download')).to_be_hidden();expect(page.locator('#export-certificate')).to_be_disabled()
        page.locator('#puzzle-view').click();page.locator('#replay').click();expect(page.locator('.piece-slot')).to_have_count(count);assert saved()['record']==before['record'];expect(page.locator('#export-certificate')).to_be_disabled()
        page.reload();expect(page.locator('#player-name')).to_have_value('Britt & Róisín');assert saved()['record']==before['record'];assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        print(f'PASS {width}px / {count} / {prefix}: lab-to-main save, red/gray visuals, gallery links, old saves retained, completed-only original-image JPG, name memory and replay.',flush=True)
        context.close()
    browser.close()
