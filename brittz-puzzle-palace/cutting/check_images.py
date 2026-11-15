"""Raster clipping/reconstruction and shared-controller browser acceptance.
Uses the existing Playwright routing approach; no server or external requests.
Python Playwright, Pillow, Chromium are development-only dependencies.
"""
import io
import json
import math
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote,urlsplit
from PIL import Image,ImageDraw,ImageChops
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
ORIGIN='http://cutting.test'
fixture=Image.new('RGB',(512,512))
pixels=fixture.load()
for y in range(512):
    for x in range(512):
        pixels[x,y]=((x*13+y*7)%256,(x*3+y*11)%256,(x*5+y*17)%256)
image_bytes={}
for fmt in ('PNG','JPEG'):
    buffer=io.BytesIO();fixture.save(buffer,fmt,quality=96);image_bytes[fmt]=buffer.getvalue()


def serve(route):
    path=unquote(urlsplit(route.request.url).path)
    if path.startswith('/small-apps/'):
        path=path[len('/small-apps'):]
    file=(ROOT/path.lstrip('/')).resolve()
    if not file.is_relative_to(ROOT):
        return route.fulfill(status=403)
    if file.is_dir():
        file/='index.html'
    if not file.is_file():
        return route.fulfill(status=404)
    route.fulfill(path=str(file),content_type=mimetypes.guess_type(file)[0] or 'text/plain')


def choose_source(page,fmt='PNG'):
    page.locator('#source-file').set_input_files({'name':f'Original.{"jpg" if fmt=="JPEG" else "png"}','mimeType':'image/jpeg' if fmt=='JPEG' else 'image/png','buffer':image_bytes[fmt]})
    expect(page.locator('#gallery-message')).to_contain_text('Ready to shuffle')


def start(page,count=50,rotation=0,outlines=False):
    page.locator('#master-count').select_option(str(count))
    page.locator('#master-rotation').select_option(str(rotation))
    page.locator('#image-outlines').set_checked(outlines)
    page.locator('#start-lab').click()
    expect(page.locator('.piece-slot')).to_have_count(count)


with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
    context=browser.new_context(viewport={'width':1100,'height':1100},device_scale_factor=1)
    context.route(ORIGIN+'/**',serve)
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    for fmt in (() if os.environ.get('CUTTING_SKIP_PIXELS') else ('PNG','JPEG')):
        page.goto(ORIGIN+'/small-apps/brittz-puzzle-palace/cutting/')
        choose_source(page,fmt);start(page)
        url=page.locator('.piece-slot image').first.get_attribute('href')
        original=page.evaluate('async url=>Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer()))',url)
        assert bytes(original)==image_bytes[fmt], 'Source bytes must be preserved, never traced/resampled/re-encoded'
        for count in (50,100,150,200):
            for rotation in (0,90,180,270):
                # Use exactly the production image renderer in an isolated pixel canvas.
                page.evaluate('''async ({url,count,rotation,mode})=>{
                    const {loadMaster,imagePuzzle}=await import('./image-puzzle.js');
                    const {imagePiece,completedImage,sourceImage}=await import('./render.js');
                    const puzzle=imagePuzzle(await loadMaster(count),{url,name:'Original'},rotation,{outlines:false});
                    document.getElementById('pixel-test')?.remove();
                    const holder=document.createElement('div');holder.id='pixel-test';holder.style='position:fixed;left:0;top:0;width:512px;height:512px;z-index:10000;background:white';
                    const root=document.createElementNS('http://www.w3.org/2000/svg','svg');root.setAttribute('viewBox','0 0 1000 1000');root.setAttribute('width','512');root.setAttribute('height','512');
                    if(mode==='pieces')for(const piece of puzzle.pieces)root.append(imagePiece(puzzle,piece));
                    else root.append(mode==='complete'?completedImage(puzzle):sourceImage(puzzle));
                    holder.append(root);document.body.append(holder);
                    await Promise.all(Array.from(root.querySelectorAll('image')).map(el=>new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=reject;image.src=el.getAttribute('href');})));
                }''',{'url':url,'count':count,'rotation':rotation,'mode':'source'})
                expected=Image.open(io.BytesIO(page.locator('#pixel-test').screenshot())).convert('RGB')
                # Swap in the actual clipped pieces, each retaining the full image's origin.
                page.evaluate('''async ({url,count,rotation})=>{
                    const {loadMaster,imagePuzzle}=await import('./image-puzzle.js');const {imagePiece}=await import('./render.js');
                    const puzzle=imagePuzzle(await loadMaster(count),{url,name:'Original'},rotation,{outlines:false});
                    const root=document.querySelector('#pixel-test svg');root.replaceChildren(...puzzle.pieces.map(piece=>imagePiece(puzzle,piece)));
                    window.pixelGeometry=puzzle.pieces.map(p=>p.points);
                }''',{'url':url,'count':count,'rotation':rotation})
                page.wait_for_timeout(35)
                actual=Image.open(io.BytesIO(page.locator('#pixel-test').screenshot())).convert('RGB')
                mask=Image.new('L',(512,512),255);draw=ImageDraw.Draw(mask)
                for points in page.evaluate('window.pixelGeometry'):
                    scaled=[(x*512/1000,y*512/1000) for x,y in points]
                    draw.line(scaled+[scaled[0]],fill=0,width=5)
                diff=ImageChops.difference(actual,expected)
                assert all(high<=1 for low,high in Image.composite(diff,Image.new('RGB',diff.size),mask).getextrema()),(fmt,count,rotation,'Clipped interiors changed source pixels')
                page.evaluate('''async ({url,count,rotation})=>{
                    const {loadMaster,imagePuzzle}=await import('./image-puzzle.js');const {completedImage}=await import('./render.js');
                    document.querySelector('#pixel-test svg').replaceChildren(completedImage(imagePuzzle(await loadMaster(count),{url,name:'Original'},rotation,{outlines:false})));
                }''',{'url':url,'count':count,'rotation':rotation})
                complete=Image.open(io.BytesIO(page.locator('#pixel-test').screenshot())).convert('RGB')
                assert ImageChops.difference(complete,expected).getbbox() is None, 'Complete assembly must reproduce every source pixel, including seams'
                page.evaluate('document.getElementById("pixel-test").remove()')
            print(f'PASS {fmt} / {count}: all four cut rotations preserve bytes, clipped pixels and exact complete image.',flush=True)
        page.locator('#back-gallery').click()
    assert not errors,errors
    context.close()
    # Shared gameplay controls on desktop and emulated touch, including 3-row trays.
    for mobile in (False,True):
        context=browser.new_context(viewport={'width':390 if mobile else 1100,'height':1000},has_touch=mobile,is_mobile=mobile)
        context.route(ORIGIN+'/**',serve)
        page=context.new_page();page.goto(ORIGIN+'/small-apps/brittz-puzzle-palace/cutting/')
        page.evaluate('localStorage.setItem("existing-save","do not touch")')
        choose_source(page);start(page,200,270)
        assert page.locator('#tray').evaluate('el=>getComputedStyle(el).gridTemplateRows.split(" ").length')==3
        geometry=page.locator('.piece-slot .glass').evaluate_all('els=>els.map(el=>el.getAttribute("d")).sort()')
        # Select a corner, far from its destination, to isolate movement/rotation.
        page.locator('.piece-slot[data-piece=piece-001]').click()
        page.locator('#board').scroll_into_view_if_needed()
        selected=page.locator('#art .selected')
        before=selected.get_attribute('transform')
        def pose():
            return selected.evaluate('el=>{const t=el.transform.baseVal;return [t.getItem(0).matrix.e,t.getItem(0).matrix.f,t.getItem(1).angle]}')
        start_pose=pose()
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
        box=page.locator('.move-handle').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
        drag([(x,y)]+[(x+16*i/8,y+8*i/8) for i in range(1,9)])
        moved=pose();assert moved[0]>start_pose[0] and moved[1]>start_pose[1] and abs(moved[2]-start_pose[2])<.01
        a=page.locator('.rotation-hit').evaluate('(e)=>Object.fromEntries(["x1","y1","x2","y2"].map(k=>[k,+e.getAttribute(k)]))')
        b=page.locator('#board').bounding_box();k=b['width']/1000;cx=b['x']+a['x1']*k;cy=b['y']+a['y1']*k;sx=b['x']+(a['x1']+a['x2'])/2*k;sy=b['y']+(a['y1']+a['y2'])/2*k
        points=[(sx,sy)]
        for i in range(1,9):
            r=math.radians(25*i/8);points.append((cx+(sx-cx)*math.cos(r)-(sy-cy)*math.sin(r),cy+(sx-cx)*math.sin(r)+(sy-cy)*math.cos(r)))
        drag(points);turned=pose();assert abs(turned[2]-moved[2]-25)<.1 and abs(turned[0]-moved[0])<.1 and abs(turned[1]-moved[1])<.1
        page.locator('#reference-view').click();page.locator('#zoom-in').click();page.locator('#puzzle-view').click();assert pose()==turned
        page.locator('#zoom-in').click();assert abs(float(page.locator('.move-handle').get_attribute('r'))*2*page.locator('#board').bounding_box()['width']/1000-44)<.1
        page.locator('#return').click();expect(page.locator('.piece-slot')).to_have_count(200)
        page.locator('#restart').click();page.locator('#restart-dialog [value=restart]').click()
        assert page.locator('.piece-slot .glass').evaluate_all('els=>els.map(el=>el.getAttribute("d")).sort()')==geometry
        assert page.evaluate('localStorage.getItem("existing-save")')=='do not touch'
        assert page.evaluate('localStorage.length')==1,'Lab must not modify published progress/preferences'
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=f'/tmp/cutting-lab-{"mobile" if mobile else "desktop"}.png',full_page=True)
        # Complete a 50-piece image via the real controls, without state injection.
        page.locator('#back-gallery').click();start(page,50,90)
        targets=page.evaluate('''async()=>{const {loadMaster,imagePuzzle}=await import('./image-puzzle.js');return imagePuzzle(await loadMaster(50),{url:'unused',name:'Test'},90).pieces.map(p=>({id:p.id,x:p.cx,y:p.cy}));}''')
        for done,piece in enumerate(targets,1):
            page.locator(f'.piece-slot[data-piece="{piece["id"]}"]').click();page.locator('#board').scroll_into_view_if_needed()
            current=pose();angle=(current[2]+180)%360-180
            if abs(angle)>.01:
                a=page.locator('.rotation-hit').evaluate('(e)=>Object.fromEntries(["x1","y1","x2","y2"].map(k=>[k,+e.getAttribute(k)]))')
                b=page.locator('#board').bounding_box();k=b['width']/1000;cx=b['x']+a['x1']*k;cy=b['y']+a['y1']*k;sx=b['x']+(a['x1']+a['x2'])/2*k;sy=b['y']+(a['y1']+a['y2'])/2*k
                points=[(sx,sy)]
                for i in range(1,17):
                    r=math.radians(-angle*i/16);points.append((cx+(sx-cx)*math.cos(r)-(sy-cy)*math.sin(r),cy+(sx-cx)*math.sin(r)+(sy-cy)*math.cos(r)))
                drag(points)
            if selected.count():
                current=pose();handle=page.locator('.move-handle').bounding_box();x=handle['x']+handle['width']/2;y=handle['y']+handle['height']/2
                k=page.locator('#board').bounding_box()['width']/1000;dx=(piece['x']-current[0])*k;dy=(piece['y']-current[1])*k
                drag([(x,y)]+[(x+dx*i/12,y+dy*i/12) for i in range(1,13)])
            expect(page.locator('#counter')).to_have_text(f'{done} / 50 pieces placed')
        expect(page.locator('#complete')).to_be_visible();expect(page.locator('#art image')).to_have_count(1)
        expect(page.locator('#export-certificate')).to_be_disabled()
        page.locator('#replay').click();expect(page.locator('.piece-slot')).to_have_count(50)
        print(f'PASS full 50-piece image assembly/replay with {"emulated touch" if mobile else "mouse"}.',flush=True)
        context.close()
    # Input validation is visible and leaves setup usable.
    context=browser.new_context();context.route(ORIGIN+'/**',serve);page=context.new_page();page.goto(ORIGIN+'/small-apps/brittz-puzzle-palace/cutting/')
    b=io.BytesIO();Image.new('RGB',(100,80)).save(b,'PNG')
    page.locator('#source-file').set_input_files({'name':'rectangle.png','mimeType':'image/png','buffer':b.getvalue()})
    expect(page.locator('#gallery-message')).to_contain_text('square image')
    page.locator('#source-file').set_input_files({'name':'invalid.jpg','mimeType':'image/jpeg','buffer':b'not an image'})
    expect(page.locator('#gallery-message')).to_contain_text('JPG or PNG')
    context.close();browser.close()
print('PASS: master image clipping/reconstruction, shared mouse/touch controls, 3-row tray, zoom targets, return, fixed restart geometry, isolated saves, and invalid inputs.')
