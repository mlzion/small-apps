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


def start(page,count=50,outlines=False):
    page.locator('#master-count').select_option(str(count))
    page.locator('#image-outlines').set_checked(outlines)
    page.locator('#start-lab').click()
    expect(page.locator('#game-screen')).to_be_visible()
    expect(page.locator('.piece-slot')).to_have_count(count)


with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
    context=browser.new_context(viewport={'width':1100,'height':1100},device_scale_factor=1)
    context.route(ORIGIN+'/**',serve)
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    for fmt in (() if os.environ.get('CUTTING_SKIP_PIXELS') else ('PNG','JPEG')):
        page.goto(ORIGIN+'/small-apps/brittz-puzzle-palace/cutting/')
        expect(page.locator('#start-lab')).to_be_enabled()
        if page.locator('#game-screen').is_visible():page.locator('#back-gallery').click()
        choose_source(page,fmt);start(page)
        url=page.locator('.piece-slot image').first.get_attribute('href')
        original=page.evaluate('async url=>Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer()))',url)
        assert bytes(original)==image_bytes[fmt], 'Source bytes must be preserved, never traced/resampled/re-encoded'
        for count in (50,100,150,200):
            for seed in (1,2,3,4):
                # Use exactly the production image renderer in an isolated pixel canvas.
                page.evaluate('''async ({url,count,seed,mode})=>{
                    const {mosaicPuzzle}=await import('./image-puzzle.js');const {generateMosaic}=await import('./mosaic.js');
                    const {imagePiece,completedImage,sourceImage}=await import('./render.js');
                    const puzzle=mosaicPuzzle(generateMosaic(count,seed),{url,name:'Original'},{outlines:false});
                    document.getElementById('pixel-test')?.remove();
                    const holder=document.createElement('div');holder.id='pixel-test';holder.style='position:fixed;left:0;top:0;width:512px;height:512px;z-index:10000;background:white';
                    const root=document.createElementNS('http://www.w3.org/2000/svg','svg');root.setAttribute('viewBox','0 0 1000 1000');root.setAttribute('width','512');root.setAttribute('height','512');
                    if(mode==='pieces')for(const piece of puzzle.pieces)root.append(imagePiece(puzzle,piece));
                    else root.append(mode==='complete'?completedImage(puzzle):sourceImage(puzzle));
                    holder.append(root);document.body.append(holder);
                    await Promise.all(Array.from(root.querySelectorAll('image')).map(el=>new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=reject;image.src=el.getAttribute('href');})));
                }''',{'url':url,'count':count,'seed':seed,'mode':'source'})
                expected=Image.open(io.BytesIO(page.locator('#pixel-test').screenshot())).convert('RGB')
                # Swap in the actual clipped pieces, each retaining the full image's origin.
                page.evaluate('''async ({url,count,seed})=>{
                    const {mosaicPuzzle}=await import('./image-puzzle.js');const {generateMosaic}=await import('./mosaic.js');const {imagePiece}=await import('./render.js');
                    const puzzle=mosaicPuzzle(generateMosaic(count,seed),{url,name:'Original'},{outlines:false});
                    const root=document.querySelector('#pixel-test svg');root.replaceChildren(...puzzle.pieces.map(piece=>imagePiece(puzzle,piece)));
                    window.pixelGeometry=puzzle.pieces.map(p=>p.points);
                }''',{'url':url,'count':count,'seed':seed})
                page.wait_for_timeout(35)
                actual=Image.open(io.BytesIO(page.locator('#pixel-test').screenshot())).convert('RGB')
                mask=Image.new('L',(512,512),255);draw=ImageDraw.Draw(mask)
                for points in page.evaluate('window.pixelGeometry'):
                    scaled=[(x*512/1000,y*512/1000) for x,y in points]
                    draw.line(scaled+[scaled[0]],fill=0,width=5)
                diff=ImageChops.difference(actual,expected)
                assert all(high<=1 for low,high in Image.composite(diff,Image.new('RGB',diff.size),mask).getextrema()),(fmt,count,seed,'Clipped interiors changed source pixels')
                page.evaluate('''async ({url,count,seed})=>{
                    const {mosaicPuzzle}=await import('./image-puzzle.js');const {generateMosaic}=await import('./mosaic.js');const {completedImage}=await import('./render.js');
                    document.querySelector('#pixel-test svg').replaceChildren(completedImage(mosaicPuzzle(generateMosaic(count,seed),{url,name:'Original'},{outlines:false})));
                }''',{'url':url,'count':count,'seed':seed})
                complete=Image.open(io.BytesIO(page.locator('#pixel-test').screenshot())).convert('RGB')
                assert ImageChops.difference(complete,expected).getbbox() is None, 'Complete assembly must reproduce every source pixel, including seams'
                page.evaluate('document.getElementById("pixel-test").remove()')
            print(f'PASS {fmt} / {count}: four seeded mosaics preserve bytes, clipped pixels and exact complete image.',flush=True)
        page.locator('#back-gallery').click()
    assert not errors,errors
    context.close()
    # The Phase 1B protocol replaces the former on-canvas handle/line protocol.
    from precision_checks import exercise_controls
    for mobile in (False,True):
        context=browser.new_context(viewport={'width':360 if mobile else 1100,'height':800 if mobile else 1100},has_touch=mobile,is_mobile=mobile)
        context.route(ORIGIN+'/**',serve)
        page=context.new_page();page.goto(ORIGIN+'/small-apps/brittz-puzzle-palace/cutting/')
        exercise_controls(page,context,mobile)
        context.close()
    # Input validation is visible and leaves setup usable.
    context=browser.new_context();context.route(ORIGIN+'/**',serve);page=context.new_page();page.goto(ORIGIN+'/small-apps/brittz-puzzle-palace/cutting/')
    b=io.BytesIO();Image.new('RGB',(100,80)).save(b,'PNG')
    page.locator('#source-file').set_input_files({'name':'rectangle.png','mimeType':'image/png','buffer':b.getvalue()})
    expect(page.locator('#gallery-message')).to_contain_text('square image')
    page.locator('#source-file').set_input_files({'name':'invalid.jpg','mimeType':'image/jpeg','buffer':b'not an image'})
    expect(page.locator('#gallery-message')).to_contain_text('JPG or PNG')
    context.close();browser.close()
print('PASS: mosaic image clipping/reconstruction, shared mouse/touch controls, two-row workspace, zoom targets, return, stable restart geometry, isolated saves, and invalid inputs.')
