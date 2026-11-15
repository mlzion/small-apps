"""Actual IndexedDB reloads and original image bytes, using native pointer controls."""
import io
import math
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote,urlsplit
from PIL import Image
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
ORIGIN='http://mosaic.test'
def serve(route):
    path=unquote(urlsplit(route.request.url).path)
    if path.startswith('/small-apps/'):path=path[len('/small-apps'):]
    file=(ROOT/path.lstrip('/')).resolve()
    if not file.is_relative_to(ROOT):return route.fulfill(status=403)
    if file.is_dir():file/='index.html'
    if not file.is_file():return route.fulfill(status=404)
    route.fulfill(path=str(file),content_type=mimetypes.guess_type(file)[0] or 'text/plain')
image=Image.new('RGB',(128,128),'turquoise');buffer=io.BytesIO();image.save(buffer,'PNG');blob=buffer.getvalue()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
    for width in (320,360,390):
        context=browser.new_context(viewport={'width':width,'height':800},has_touch=True,is_mobile=True)
        context.route(ORIGIN+'/**',serve);page=context.new_page();errors=[];requests=[];page.on('request',lambda request:requests.append(request.url));page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(ORIGIN+os.environ.get('MOSAIC_ENTRY','/small-apps/brittz-puzzle-palace/cutting/'))
        page.locator('#source-file').set_input_files({'name':'Saved.png','mimeType':'image/png','buffer':blob})
        expect(page.locator('#gallery-message')).to_contain_text('Ready to shuffle')
        page.locator('#image-outlines').uncheck();page.locator('#start-lab').click();expect(page.locator('.piece-slot')).to_have_count(50)
        def saved():
            return page.evaluate("async()=>{const {readSession}=await import(new URL('session.js',new URL(document.querySelector('script[type=module]').src,location.href)));const s=await readSession();return {record:{...s.record,blob:Array.from(new Uint8Array(await s.record.blob.arrayBuffer()))},progress:s.progress};}")
        initial=saved();angles=[s['angle'] for s in initial['progress']['game']['states'].values()]
        assert all(0<=a<360 for a in angles) and sum(abs(a/30-round(a/30))>.0001 for a in angles)>45
        targets=page.evaluate("async()=>{const {readSession}=await import(new URL('session.js',new URL(document.querySelector('script[type=module]').src,location.href)));const {mosaicPuzzle}=await import(new URL('image-puzzle.js',new URL(document.querySelector('script[type=module]').src,location.href)));return mosaicPuzzle((await readSession()).record.pattern,{url:'unused',name:'Saved'}).pieces.map(p=>({id:p.id,x:p.cx,y:p.cy}));}")
        session=context.new_cdp_session(page)
        def drag(points):
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':points[0][0],'y':points[0][1]}]})
            for x,y in points[1:]:session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y}]})
            session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        def pose():return page.locator('#art>.selected').evaluate('e=>{const t=e.transform.baseVal;return [t.getItem(0).matrix.e,t.getItem(0).matrix.f,t.getItem(1).angle]}')
        def rotate(degrees):
            wheel=page.locator('#rotation-wheel');wheel.scroll_into_view_if_needed();b=wheel.bounding_box();cx=b['x']+60;cy=b['y']+60
            steps=max(2,math.ceil(abs(degrees)/8));drag([(cx+54*math.cos(math.radians(15+degrees*i/steps)),cy+54*math.sin(math.radians(15+degrees*i/steps))) for i in range(steps+1)])
        def move(dx,dy):
            pad=page.locator('#move-pad');pad.scroll_into_view_if_needed();b=pad.bounding_box();x=b['x']+60;y=b['y']+60;steps=max(1,math.ceil(max(abs(dx),abs(dy))/40))
            for _ in range(steps):drag([(x,y)]+[(x+dx/steps*i/5,y+dy/steps*i/5) for i in range(1,6)])
        # Lock a real piece through the production wheel/pad, then keep two loose.
        for target in targets[:1]:
            page.locator(f'.piece-slot[data-piece="{target["id"]}"]').click();page.locator('#workspace-move').click();angle=(pose()[2]+180)%360-180;rotate(-angle)
            if page.locator('#art>.selected').count():
                current=pose();scale=page.locator('#board').bounding_box()['width']/1000;move((target['x']-current[0])*scale,(target['y']-current[1])*scale)
        expect(page.locator('#counter')).to_have_text('1 / 50 pieces placed')
        for target in targets[1:3]:
            page.locator('#workspace-select').click();page.locator(f'.piece-slot[data-piece="{target["id"]}"]').click();page.locator('#workspace-move').click();rotate(23.417);move(12,-8)
        before=saved();assert len([s for s in before['progress']['game']['states'].values() if s['location']=='board'])==2
        page.reload();expect(page.locator('.piece-slot')).to_have_count(47)
        after=saved();assert after==before,'Reload must retain original bytes, exact cuts and all poses/locked states'
        expect(page.locator('#counter')).to_have_text('1 / 50 pieces placed')
        expect(page.locator('#art>.loose')).to_have_count(2)
        assert page.locator('#master-rotation').count()==0
        assert bytes(after['record']['blob'])==blob
        # New games with the same image/count must replace, rather than reuse, cuts.
        page.locator('#back-gallery').click();page.locator('#start-lab').click();expect(page.locator('.piece-slot')).to_have_count(50)
        fresh=saved()
        page.evaluate("async()=>{const {readSession,writeProgress}=await import(new URL('session.js',new URL(document.querySelector('script[type=module]').src,location.href)));const s=await readSession();await writeProgress('older-tab',s.progress.game,false)}")
        assert saved()==fresh,'An older tab must not overwrite the active session'
        assert fresh['record']['pattern']['seed']!=before['record']['pattern']['seed'];assert fresh['record']['pattern']['pieces']!=before['record']['pattern']['pieces']
        for count in (100,150,200):
            page.locator('#back-gallery').click();page.locator('#master-count').select_option(str(count));page.locator('#start-lab').click();expect(page.locator('.piece-slot')).to_have_count(count)
            page.locator('.piece-slot').first.click();state=saved();page.reload();expect(page.locator('.piece-slot')).to_have_count(count-1);assert saved()==state;assert page.locator('#master-count').input_value()==str(count);assert not page.locator('#image-outlines').is_checked()
        # Corruption is reported without regenerating or overwriting the saved mesh.
        page.evaluate("async()=>{const db=await new Promise(r=>{const q=indexedDB.open('brittz-mosaic-lab',1);q.onsuccess=()=>r(q.result)});await new Promise(r=>{const tx=db.transaction('active','readwrite'),s=tx.objectStore('active'),q=s.get('source');q.onsuccess=()=>{q.result.pattern.pieces.pop();s.put(q.result,'source')};tx.oncomplete=r});db.close();}")
        page.reload();expect(page.locator('#gallery-message')).to_contain_text('Saved mosaic could not be restored');expect(page.locator('#game-screen')).to_be_hidden()
        assert not any('/patterns/' in url for url in requests),requests
        assert not errors,errors
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        print(f'PASS {width}px touch: continuous angles, locked/loose pose reloads, all counts, fresh same-image cuts, original bytes, corrupt-save rejection.',flush=True)
        context.close()
    # Storage denial must be visible; do not silently start an unsavable puzzle.
    context=browser.new_context();context.route(ORIGIN+'/**',serve);context.add_init_script("Object.defineProperty(window,'indexedDB',{value:{open(){throw Error('Storage denied for test')}}})")
    page=context.new_page();page.goto(ORIGIN+os.environ.get('MOSAIC_ENTRY','/small-apps/brittz-puzzle-palace/cutting/'));page.locator('#source-file').set_input_files({'name':'Saved.png','mimeType':'image/png','buffer':blob});expect(page.locator('#gallery-message')).to_contain_text('Ready to shuffle');page.locator('#start-lab').click();expect(page.locator('#gallery-message')).to_contain_text('Unable to create the puzzle: Storage denied');expect(page.locator('#game-screen')).to_be_hidden();context.close()
    context=browser.new_context();context.route(ORIGIN+'/**',serve);page=context.new_page();page.goto(ORIGIN+os.environ.get('MOSAIC_ENTRY','/small-apps/brittz-puzzle-palace/cutting/'));page.locator('#source-file').set_input_files({'name':'Saved.png','mimeType':'image/png','buffer':blob});expect(page.locator('#gallery-message')).to_contain_text('Ready to shuffle');page.locator('#start-lab').click();expect(page.locator('.piece-slot')).to_have_count(50)
    page.evaluate("()=>{const transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(names,mode,...args){if(mode==='readwrite')throw Error('Storage full for test');return transaction.call(this,names,mode,...args)};}")
    page.locator('.piece-slot').first.click();expect(page.locator('#lab-save-status')).to_be_visible();expect(page.locator('#lab-save-status')).to_contain_text('Progress could not be saved');expect(page.locator('#art>.loose')).to_have_count(1);context.close();browser.close()
print('PASS storage denial before play, later progress-write warnings, and older-tab protection.')
