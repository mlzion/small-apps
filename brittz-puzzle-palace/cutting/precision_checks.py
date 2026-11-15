"""Shared browser checks for the Phase 1C workspace; no game-state injection."""
import re
import math
import io
from PIL import Image
from playwright.sync_api import expect


def assert_precision_layout(page):
    """Measure the shared slot and whichever panel is actually visible."""
    geometry=page.locator('.precision-panel').evaluate('''panel=>{
        const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
        return {move:rect(panel.querySelector('#move-pad')),wheel:rect(panel.querySelector('#rotation-wheel')),
          face:rect(panel.querySelector('.wheel-face')),labels:[...panel.querySelectorAll('.precision-unit>span')].map(rect),
          zoom:[...panel.querySelectorAll('.precision-zoom button')].map(rect),actions:[...panel.querySelectorAll('.precision-zoom button')].map(e=>e.id),counter:rect(document.getElementById('counter')),viewToggle:rect(document.querySelector('.view-summary .toggle')),panel:rect(panel),slot:rect(panel.querySelector('#workspace-slot')),
          select:rect(panel.querySelector('#select-panel')),movePanel:rect(panel.querySelector('#move-panel')),
          selecting:panel.querySelector('#workspace-select').getAttribute('aria-pressed')==='true',
          rows:getComputedStyle(document.getElementById('tray')).gridTemplateRows.split(' ').length,
          canvas:rect(document.getElementById('board')),tray:rect(document.getElementById('tray')),
          viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};
    }''')
    assert len(geometry['labels'])==2 and len(geometry['zoom'])==4,geometry
    assert geometry['actions']==['fit','zoom-out','zoom-in','return'],geometry
    assert geometry['zoom'][3]['x']-geometry['zoom'][2]['right']>=18-.5,geometry
    assert geometry['counter']['y']>=geometry['viewToggle']['bottom'],geometry
    assert geometry['counter']['bottom']<=geometry['canvas']['y'],geometry
    assert abs(geometry['counter']['x']+geometry['counter']['width']/2-geometry['viewToggle']['x']-geometry['viewToggle']['width']/2)<.5,geometry
    assert page.locator('.statusbar,#rotation-value,.wheel-face svg').count()==0
    if geometry['viewport']<=390:
        assert geometry['canvas']['width']>=geometry['viewport']-48,geometry
        assert page.locator('#board').evaluate('e=>e.getBoundingClientRect().top+scrollY')<210
    assert abs(geometry['slot']['height']-188)<.5,geometry
    if geometry['selecting']:
        assert geometry['select']['height']==geometry['slot']['height'] and geometry['movePanel']['height']==0,geometry
        assert geometry['rows']==2 and geometry['tray']['height']==188,geometry
        assert geometry['tray']['x']>=0 and geometry['tray']['right']<=geometry['viewport']+.5,geometry
    else:
        assert geometry['movePanel']['height']==geometry['slot']['height'] and geometry['select']['height']==0,geometry
        move,wheel=geometry['move'],geometry['wheel']
        for control in (move,wheel):
            assert abs(control['width']-120)<.5 and abs(control['height']-120)<.5,geometry
            assert control['x']>=0 and control['right']<=geometry['viewport']+.5,geometry
        assert abs(move['y']-wheel['y'])<.5 and move['right']<wheel['x'],geometry
        for label,control in zip(geometry['labels'],(move,wheel)):
            assert label['bottom']<=control['y'] and abs(label['x']+label['width']/2-control['x']-60)<.5,geometry
        assert abs(geometry['face']['width']-96)<.5 and abs(geometry['face']['height']-96)<.5,geometry
    for zoom in geometry['zoom']:
        assert zoom['y']>=geometry['slot']['bottom'] and zoom['width']>=44 and zoom['height']>=44,geometry
        assert zoom['x']>=0 and zoom['right']<=geometry['viewport']+.5,geometry
    assert all(a['right']<=b['x'] for a,b in zip(geometry['zoom'],geometry['zoom'][1:])),geometry
    assert max(z['y'] for z in geometry['zoom'])-min(z['y'] for z in geometry['zoom'])<.5,geometry
    assert geometry['panel']['y']>=geometry['canvas']['bottom']-.5,geometry
    assert not geometry['overflow'],geometry
    return geometry

def exercise_controls(page,context,mobile,complete=True):
    page.evaluate('localStorage.setItem("existing-save","do not touch")')
    image=Image.new('RGB',(128,128));pixels=image.load()
    for y in range(128):
        for x in range(128):pixels[x,y]=(x*2,y*2,(x+y)%256)
    buffer=io.BytesIO();image.save(buffer,'PNG')
    page.locator('#source-file').set_input_files({'name':'Precision-fixture.png','mimeType':'image/png','buffer':buffer.getvalue()})
    expect(page.locator('#gallery-message')).to_contain_text('Ready to shuffle')
    page.locator('#master-count').select_option('200')
    page.locator('#master-rotation').select_option('270')
    page.locator('#image-outlines').uncheck()
    page.locator('#start-lab').click()
    expect(page.locator('.piece-slot')).to_have_count(200)
    assert page.locator('#tray').evaluate('e=>getComputedStyle(e).gridTemplateRows.split(" ").length')==2
    expect(page.locator('#move-pad')).to_be_disabled();expect(page.locator('#rotation-wheel')).to_be_disabled();assert_precision_layout(page)
    expect(page.locator('#board .move-handle,#board .rotation-hit,.viewport .zoom')).to_have_count(0)
    original_order=page.locator('.piece-slot').evaluate_all('es=>es.map(e=>e.dataset.piece)')
    geometry=page.locator('.piece-slot .glass').evaluate_all('els=>els.map(e=>e.getAttribute("d")).sort()')
    selected=page.locator('#art .selected')
    session=context.new_cdp_session(page) if mobile else None

    def camera():
        return page.locator('#camera').evaluate('e=>{const t=e.transform.baseVal;return {x:t.getItem(0).matrix.e,y:t.getItem(0).matrix.f,zoom:t.getItem(1).matrix.a}}')

    def pose():
        return selected.evaluate('e=>{const t=e.transform.baseVal;return [t.getItem(0).matrix.e,t.getItem(0).matrix.f,t.getItem(1).angle]}')

    def tap_piece(id):
        page.locator('#board').scroll_into_view_if_needed()
        target=page.locator(f'#art [data-piece="{id}"]')
        pixel=target.evaluate('''e=>{const b=e.querySelector('.glass').getBoundingClientRect(),board=document.getElementById('board').getBoundingClientRect();for(let y=Math.max(1,b.top,board.top)+3;y<Math.min(innerHeight,b.bottom,board.bottom);y+=2)for(let x=Math.max(1,b.left,board.left)+3;x<Math.min(innerWidth,b.right,board.right);x+=2)if([-4,0,4].every(dy=>[-4,0,4].every(dx=>document.elementFromPoint(x+dx,y+dy)?.closest('[data-piece]')===e)))return [x,y];throw Error('No visible piece pixel');}''')
        if mobile:page.touchscreen.tap(*pixel)
        else:page.mouse.click(*pixel)

    def screen_center():
        s=pose();v=camera()
        return (v['x']+s[0]*v['zoom'],v['y']+s[1]*v['zoom'])

    def drag(points,cancel=False):
        if mobile:
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':points[0][0],'y':points[0][1]}]})
            for x,y in points[1:]:session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y}]})
            session.send('Input.dispatchTouchEvent',{'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]})
        else:
            page.mouse.move(*points[0]);page.mouse.down()
            for point in points[1:]:page.mouse.move(*point)
            if cancel:page.evaluate('window.dispatchEvent(new Event("blur"))')
            page.mouse.up()

    def mode(name):
        before=camera()
        pieces=page.locator('#art>[data-piece]').evaluate_all('es=>es.map(e=>[e.dataset.piece,e.getAttribute("transform"),e.getAttribute("class")])')
        slot=page.locator('#workspace-slot').evaluate('e=>{const r=e.getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]}')
        page.locator(f'#workspace-{name}').click()
        assert page.locator(f'#workspace-{name}').get_attribute('aria-pressed')=='true'
        assert camera()==before
        assert page.locator('#art>[data-piece]').evaluate_all('es=>es.map(e=>[e.dataset.piece,e.getAttribute("transform"),e.getAttribute("class")])')==pieces
        assert page.locator('#workspace-slot').evaluate('e=>{const r=e.getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]}')==slot
        assert_precision_layout(page)

    def move(dx,dy):
        pad=page.locator('#move-pad');pad.scroll_into_view_if_needed();box=pad.bounding_box()
        # Lift/reposition between strokes, as on a laptop trackpad.
        strokes=max(1,math.ceil(max(abs(dx),abs(dy))/42))
        for _ in range(strokes):
            x=box['x']+box['width']/2;y=box['y']+box['height']/2
            drag([(x,y)]+[(x+dx/strokes*i/6,y+dy/strokes*i/6) for i in range(1,7)])

    def rotate(delta,start=15):
        wheel=page.locator('#rotation-wheel');wheel.scroll_into_view_if_needed();b=wheel.bounding_box()
        cx=b['x']+b['width']/2;cy=b['y']+b['height']/2;r=b['width']*.47
        steps=max(2,math.ceil(abs(delta)/8))
        points=[]
        for i in range(steps+1):
            a=math.radians(start+delta*i/steps);points.append((cx+r*math.cos(a),cy+r*math.sin(a)))
        wheel_markup=wheel.inner_html()
        drag(points)
        assert wheel.inner_html()==wheel_markup
        assert wheel.locator('.wheel-face').inner_html()==''
        assert wheel.evaluate("e=>[e,...e.querySelectorAll('*')].every(n=>getComputedStyle(n).transform==='none')")
        assert wheel.get_attribute('style') is None
        assert wheel.aria_snapshot().replace(' [disabled]','')=='- button "Rotate selected piece clockwise or counterclockwise"'
        assert not re.search(r'\d|°|degrees|angle',page.locator('#selection-status').inner_text(),re.I)

    # The two rows scroll together; every remaining identity can reach the window.
    tray=page.locator('#tray');tray.scroll_into_view_if_needed();box=tray.bounding_box()
    if mobile:
        x=box['x']+box['width']-20;y=box['y']+38
        drag([(x,y)]+[(x-(box['width']-40)*i/8,y) for i in range(1,9)])
    else:
        tray.hover();page.mouse.wheel(350,0)
    page.wait_for_function('document.getElementById("tray").scrollLeft>10')
    expect(page.locator('#art>[data-piece]')).to_have_count(0)
    expect(page.locator('#counter')).to_have_text('0 / 200 pieces placed')
    seen=tray.evaluate('''e=>{const seen=new Set();for(let x=0;x<=e.scrollWidth+e.clientWidth;x+=e.clientWidth*.8){e.scrollLeft=x;const r=e.getBoundingClientRect();for(const b of e.children){const t=b.getBoundingClientRect();if(t.right>r.left+2&&t.left<r.right-2)seen.add(b.dataset.piece);}}e.scrollLeft=0;return [...seen];}''')
    assert len(seen)==200 and len(set(seen))==200
    assert page.locator('#workspace-select').get_attribute('aria-pressed')=='true'

    # Selection does not move the camera, even after an explicit pan.
    page.locator('.piece-slot[data-piece=piece-001]').click()
    assert page.locator('#workspace-select').get_attribute('aria-pressed')=='true'
    mode('move');v=camera();expect(page.locator('#move-pad')).to_be_enabled();assert_precision_layout(page)
    for button in ['#zoom-in','#zoom-in','#zoom-in','#zoom-out','#fit']:
        page.locator('.precision-panel').scroll_into_view_if_needed()
        anchor=screen_center();page.locator(button).click()
        if button!='#fit' and camera()['zoom']>1:assert max(abs(a-b) for a,b in zip(anchor,screen_center()))<.01
        else:assert camera()=={'x':0,'y':0,'zoom':1}
    # Relative motion remains one screen pixel per finger pixel at every zoom.
    for zoom_step in range(4):
        if zoom_step:page.locator('#zoom-in').click()
        old=pose();v=camera();scale=page.locator('#board').bounding_box()['width']/1000*v['zoom']
        move(6,3);new=pose()
        assert abs((new[0]-old[0])*scale-6)<.2 and abs((new[1]-old[1])*scale-3)<.2
        assert abs(new[2]-old[2])<.01 and camera()==v
        move(-6,-3);assert max(abs(a-b) for a,b in zip(old,pose()))<.7
    # Multiple disjoint wheel strokes, both directions, and the atan2 seam.
    for delta,start in [(25.4,20),(-13.7,120),(30,170),(-30,-170)]:
        old=pose();v=camera();rotate(delta,start);new=pose()
        assert abs(new[2]-old[2]-delta)<.2 and new[:2]==old[:2] and camera()==v
    # Move near a board edge and rotate: never clamp the center or recenter camera.
    page.locator('#fit').click();current=pose();zero=(current[2]+180)%360-180
    if abs(zero)>.01:rotate(-zero)
    old=pose();scale=page.locator('#board').bounding_box()['width']/1000
    move(-old[0]*scale,-old[1]*scale)
    edge=pose();v=camera();rotate(45,100);assert pose()[:2]==edge[:2] and camera()==v
    for button in ['#zoom-in','#zoom-in','#zoom-out','#zoom-out']:
        anchor=screen_center();page.locator(button).click();assert camera()['zoom']==1 or max(abs(a-b) for a,b in zip(anchor,screen_center()))<.01
    # Canvas dragging on a loose piece cannot manipulate or pan it.
    page.locator('#fit').click();page.locator('#board').scroll_into_view_if_needed()
    before=pose();v=camera();b=selected.locator('.glass').bounding_box()
    # Pick an actual interior point using the SVG hit-test, not an irregular bbox midpoint.
    point=selected.evaluate('e=>{const b=e.querySelector(".glass").getBoundingClientRect();for(let y=b.top+3;y<b.bottom;y+=3)for(let x=b.left+3;x<b.right;x+=3)if(document.elementFromPoint(x,y)?.closest(".selected")===e)return [x,y];throw Error("No visible selected pixel");}')
    drag([point,(point[0]+12,point[1]+5)]);assert pose()==before and camera()==v
    page.locator('#reference-view').click();expect(page.locator('#move-pad')).to_be_disabled();assert camera()==v
    assert page.locator('#workspace-move').get_attribute('aria-pressed')=='true'
    mode('select');mode('move')
    page.locator('#puzzle-view').click();assert pose()==before and camera()==v
    # A second piece is placed, selected and returned without affecting the camera.
    page.locator('#zoom-in').click();v=camera();mode('select');page.locator('.piece-slot[data-piece=piece-002]').click();assert camera()==v
    assert page.locator('#workspace-select').get_attribute('aria-pressed')=='true'
    expect(page.locator('#art>.loose')).to_have_count(2)
    tap_piece('piece-001');assert selected.get_attribute('data-piece')=='piece-001'
    assert page.locator('#workspace-select').get_attribute('aria-pressed')=='true' and camera()==v
    tap_piece('piece-002');assert selected.get_attribute('data-piece')=='piece-002'
    mode('move')
    page.locator('#return').click();expect(page.locator('#move-pad')).to_be_disabled();assert camera()==v
    expect(page.locator('#counter')).to_have_text('0 / 200 pieces placed')
    assert page.locator('#workspace-move').get_attribute('aria-pressed')=='true'
    page.locator('#board').scroll_into_view_if_needed()
    tap_piece('piece-001')
    assert camera()==v
    # Release/cancellation stops immediately; wheel hub re-entry does not jump.
    pad=page.locator('#move-pad');pad.scroll_into_view_if_needed();box=pad.bounding_box();x=box['x']+60;y=box['y']+60
    drag([(x,y),(x+4,y+2)],cancel=True);stopped=pose();v=camera()
    pad.dispatch_event('pointermove',{'pointerId':1,'pointerType':'mouse','buttons':1,'clientX':x+35,'clientY':y+20})
    assert pose()==stopped and camera()==v
    wheel=page.locator('#rotation-wheel');box=wheel.bounding_box();cx=box['x']+60;cy=box['y']+60
    old=pose();drag([(cx+50,cy),(cx,cy),(cx-50,cy)]);assert abs(pose()[2]-old[2])<.01
    # Wheel and pinch cannot zoom; no hidden keep-in-view change on the next move.
    page.locator('#board').scroll_into_view_if_needed();v=camera();b=page.locator('#board').bounding_box()
    page.mouse.move(b['x']+b['width']/2,max(20,b['y']+b['height']/2));page.mouse.wheel(0,-500);page.wait_for_timeout(40);assert camera()==v
    if mobile:
        points=[{'x':b['x']+b['width']*.35,'y':max(30,b['y']+b['height']*.45)},{'x':b['x']+b['width']*.65,'y':max(30,b['y']+b['height']*.55)}]
        session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':points})
        points[0]['x']-=25;points[1]['x']+=25
        session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':points})
        session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});assert camera()==v
    # Fit locks panning in both views; oversized drags hit each exact image bound.
    page.locator('#return').click()
    assert page.locator('#workspace-move').get_attribute('aria-pressed')=='true'
    mode('select');assert page.locator('.piece-slot').evaluate_all('es=>es.map(e=>e.dataset.piece)')==original_order;mode('move')
    for view_button in ['#puzzle-view','#reference-view']:
        v=camera();page.locator(view_button).click();assert camera()==v
        page.locator('#fit').click();page.locator('#board').scroll_into_view_if_needed();b=page.locator('#board').bounding_box()
        lo=(b['x']+b['width']*.2,b['y']+b['height']*.2);hi=(b['x']+b['width']*.8,b['y']+b['height']*.8)
        drag([lo,hi]);assert camera()=={'x':0,'y':0,'zoom':1}
        page.locator('#zoom-in').click();page.locator('#board').scroll_into_view_if_needed();b=page.locator('#board').bounding_box()
        lo=(b['x']+b['width']*.2,b['y']+b['height']*.2);hi=(b['x']+b['width']*.8,b['y']+b['height']*.8)
        drag([lo,hi]);assert abs(camera()['x'])<.01 and abs(camera()['y'])<.01
        drag([hi,lo]);v=camera();limit=1000*(1-v['zoom']);assert abs(v['x']-limit)<.01 and abs(v['y']-limit)<.01
    v=camera();page.locator('#puzzle-view').click();assert camera()==v
    v=camera();center=((500-v['x'])/v['zoom'],(500-v['y'])/v['zoom']);page.locator('#zoom-in').click();after=camera()
    assert abs(after['x']+center[0]*after['zoom']-500)<.01 and abs(after['y']+center[1]*after['zoom']-500)<.01
    # Restart changes pieces only; camera and permanent path data are preserved.
    v=camera();page.locator('#restart').click();page.locator('#restart-dialog [value=restart]').click();assert camera()==v
    assert page.locator('#workspace-move').get_attribute('aria-pressed')=='true'
    page.screenshot(path=f'/tmp/workspace-{page.viewport_size["width"]}-move.png',full_page=True)
    mode('select')
    assert page.locator('.piece-slot .glass').evaluate_all('els=>els.map(e=>e.getAttribute("d")).sort()')==geometry
    assert page.evaluate('localStorage.getItem("existing-save")')=='do not touch' and page.evaluate('localStorage.length')==1
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert_precision_layout(page)
    page.screenshot(path=f'/tmp/precision-{"mobile" if mobile else "desktop"}.png',full_page=True)

    if not complete:return

    # Complete a 50-piece image with the new panel, without injected game state.
    page.locator('#back-gallery').click();page.locator('#master-count').select_option('50');page.locator('#master-rotation').select_option('90');page.locator('#start-lab').click()
    expect(page.locator('.piece-slot')).to_have_count(50)
    assert page.locator('#workspace-select').get_attribute('aria-pressed')=='true'
    targets=page.evaluate('''async()=>{const {loadMaster,imagePuzzle}=await import('./image-puzzle.js');return imagePuzzle(await loadMaster(50),{url:'unused',name:'Test'},90).pieces.map(p=>({id:p.id,x:p.cx,y:p.cy}));}''')
    for done,piece in enumerate(targets,1):
        mode('select');page.locator(f'.piece-slot[data-piece="{piece["id"]}"]').click();assert page.locator('#workspace-select').get_attribute('aria-pressed')=='true'
        mode('move');current=pose();v=camera();angle=(current[2]+180)%360-180
        if abs(angle)>.01:rotate(-angle)
        if selected.count():
            current=pose();scale=page.locator('#board').bounding_box()['width']/1000
            move((piece['x']-current[0])*scale,(piece['y']-current[1])*scale)
        expect(page.locator('#counter')).to_have_text(f'{done} / 50 pieces placed');assert camera()==v
        assert page.locator('#workspace-move').get_attribute('aria-pressed')=='true'
    expect(page.locator('#complete')).to_be_visible();expect(page.locator('#art image')).to_have_count(1)
    expect(page.locator('#move-pad')).to_be_disabled();expect(page.locator('#rotation-wheel')).to_be_disabled();assert_precision_layout(page)
    page.locator('#replay').click();expect(page.locator('.piece-slot')).to_have_count(50)
    assert page.locator('#workspace-move').get_attribute('aria-pressed')=='true'
    print(f'PASS precision controls / {"touch" if mobile else "mouse"}: camera stability, relative motion, continuous wheel, anchors, no pinch/wheel zoom, layout, 50-piece completion and replay.',flush=True)
