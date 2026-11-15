"""Content-only Clownfish acceptance: assemble all 45 real tray pieces with the
existing circle/line controls, on desktop and emulated touch. No engine test hooks.
Requires Python Playwright and Chromium, like the existing browser suites.
"""
import json
import math
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
ART=json.loads((ROOT/'brittz-puzzle-palace/puzzles/clownfish/puzzle.json').read_text())
ORIGIN='http://clownfish.test'
KEY='brittz-puzzle:clownfish:v1'


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


def state(page):
    return page.evaluate('k=>JSON.parse(localStorage.getItem(k)).game',KEY)


def move(page,session,point,first=False,last=False):
    if session:
        session.send('Input.dispatchTouchEvent',{'type':'touchStart' if first else 'touchEnd' if last else 'touchMove','touchPoints':[] if last else [{'x':point[0],'y':point[1]}]})
    else:
        if not last:
            page.mouse.move(*point)
        if first:
            page.mouse.down()
        if last:
            page.mouse.up()


with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
    for mobile in (False,True):
        context=browser.new_context(viewport={'width':390 if mobile else 1100,'height':1100},has_touch=mobile,is_mobile=mobile,accept_downloads=True)
        context.route(ORIGIN+'/**',serve)
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        session=context.new_cdp_session(page) if mobile else None
        page.goto(ORIGIN+'/small-apps/brittz-puzzle-palace/legacy.html')
        expect(page.locator('[data-puzzle=clownfish]')).to_contain_text('45 pieces')
        page.locator('[data-puzzle=clownfish]').click()
        expect(page.locator('.piece-slot')).to_have_count(45)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.locator('#sound').click()
        # Reference and pieces must contain the same paths and attached decorations.
        page.locator('#reference-view').click()
        expected_details=sum(len(p.get('details',[])) for p in ART['pieces'])
        expect(page.locator('#art > g')).to_have_count(45)
        expect(page.locator('#art circle')).to_have_count(expected_details)
        reference=page.locator('#art > g').evaluate_all('(els)=>Object.fromEntries(els.map(el=>[el.dataset.piece,el.innerHTML]))')
        page.screenshot(path=f'/tmp/clownfish-reference-{"mobile" if mobile else "desktop"}.png',full_page=True)
        page.locator('#puzzle-view').click()
        for count,piece in enumerate(ART['pieces'],1):
            page.locator(f'.piece-slot[data-piece="{piece["id"]}"]').click()
            page.locator('#board').scroll_into_view_if_needed()
            active=state(page)['states'][piece['id']]
            # Rotate by an arc around the selected piece's actual center.
            angle=(active['angle']+180)%360-180
            if abs(angle)>0.1:
                line=page.locator('.rotation-hit')
                a=line.evaluate('(el)=>Object.fromEntries(["x1","x2","y1","y2"].map(k=>[k,+el.getAttribute(k)]))')
                box=page.locator('#board').bounding_box()
                scale=box['width']/ART['width']
                cx=box['x']+a['x1']*scale
                cy=box['y']+a['y1']*scale
                sx=box['x']+(a['x1']+a['x2'])/2*scale
                sy=box['y']+(a['y1']+a['y2'])/2*scale
                move(page,session,(sx,sy),first=True)
                steps=max(1,math.ceil(abs(angle)/12))
                end=(sx,sy)
                for i in range(1,steps+1):
                    r=math.radians(-angle*i/steps)
                    end=(cx+(sx-cx)*math.cos(r)-(sy-cy)*math.sin(r),cy+(sx-cx)*math.sin(r)+(sy-cy)*math.cos(r))
                    move(page,session,end)
                move(page,session,end,last=True)
            active=state(page)['states'][piece['id']]
            if active['location']!='locked':
                handle=page.locator('.move-handle').bounding_box()
                start=(handle['x']+handle['width']/2,handle['y']+handle['height']/2)
                scale=page.locator('#board').bounding_box()['width']/ART['width']
                dx=(piece['correct']['x']-active['x'])*scale
                dy=(piece['correct']['y']-active['y'])*scale
                move(page,session,start,first=True)
                end=start
                for i in range(1,13):
                    end=(start[0]+dx*i/12,start[1]+dy*i/12)
                    move(page,session,end)
                move(page,session,end,last=True)
            expect(page.locator('#counter')).to_have_text(f'{count} / 45 pieces placed')
            expect(page.locator('.piece-slot')).to_have_count(45-count)
        completed=page.locator('#art > g').evaluate_all('(els)=>Object.fromEntries(els.map(el=>[el.dataset.piece,el.innerHTML]))')
        assert completed==reference, 'Reference and completed piece geometry/decorations must be identical'
        expect(page.locator('#complete')).to_be_visible()
        expect(page.locator('#art > g')).to_have_count(45)
        expect(page.locator('#art circle')).to_have_count(expected_details)
        page.screenshot(path=f'/tmp/clownfish-complete-{"mobile" if mobile else "desktop"}.png',full_page=True)
        page.locator('#player-name').fill('Reef Explorer')
        with page.expect_download() as pending:
            page.locator('#export-certificate').click()
        download=pending.value
        assert download.suggested_filename=='brittz-clownfish-certificate.jpg'
        download.save_as(f'/tmp/clownfish-certificate-{"mobile" if mobile else "desktop"}.jpg')
        page.locator('#back-gallery').click()
        expect(page.locator('[data-puzzle=clownfish] .puzzle-status')).to_have_text('Completed')
        page.reload()
        page.locator('[data-puzzle=clownfish]').click()
        expect(page.locator('#counter')).to_have_text('45 / 45 pieces placed')
        expect(page.locator('#player-name')).to_have_value('Reef Explorer')
        assert not errors,errors
        context.close()
        print(f'PASS: all 45 Clownfish pieces rotated, moved and snapped with {"emulated touch" if mobile else "mouse"}; details/reference, certificate and saved completion preserved.',flush=True)
    browser.close()
