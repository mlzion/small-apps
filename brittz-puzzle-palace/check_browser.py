"""Browser acceptance checks. Development only: Python Playwright + Chromium.
Run from any directory: python brittz-puzzle-palace/check_browser.py
Touch emulation checks event handling, not physical Android ergonomics.
"""
import json
import math
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'http://puzzle.test'
KEY = 'brittz-puzzle:sea-turtle-v1:v1'


def serve(route):
    path = unquote(urlsplit(route.request.url).path)
    if path.startswith('/small-apps/'):
        path = path[len('/small-apps'):]
    file = (ROOT / path.lstrip('/')).resolve()
    if not file.is_relative_to(ROOT):
        return route.fulfill(status=403)
    if file.is_dir():
        file /= 'index.html'
    if not file.is_file():
        return route.fulfill(status=404)
    return route.fulfill(path=str(file), content_type=mimetypes.guess_type(file)[0] or 'text/plain')


def saved(page):
    return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)['game']


def point(page, selector):
    box = page.locator(selector).bounding_box()
    return (box['x'] + box['width']/2, box['y'] + box['height']/2)


def drag(page, session, start, end):
    if session:
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': start[0], 'y': start[1]}]})
        for i in range(1, 13):
            session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': start[0]+(end[0]-start[0])*i/12, 'y': start[1]+(end[1]-start[1])*i/12}]})
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    else:
        page.mouse.move(*start)
        page.mouse.down()
        page.mouse.move(*end, steps=12)
        page.mouse.up()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'))
    for mobile in (False, True):
        context = browser.new_context(viewport={'width': 390 if mobile else 1100, 'height': 1000}, has_touch=mobile, is_mobile=mobile)
        context.route(ORIGIN+'/**', serve)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        session = context.new_cdp_session(page) if mobile else None
        for prefix in ('/', '/small-apps/'):
            url = ORIGIN+prefix+'brittz-puzzle-palace/'
            page.goto(url)
            page.evaluate('localStorage.clear()')
            page.reload()
            page.locator('[data-puzzle=sea-turtle-v1]').click()
            expect(page.locator('.piece-slot')).to_have_count(23)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            if mobile:
                box = page.locator('#tray').bounding_box()
                drag(page, session, (box['x']+box['width']-25,box['y']+50), (box['x']+25,box['y']+50))
                page.wait_for_function('document.getElementById("tray").scrollLeft > 20')
                expect(page.locator('.piece-slot')).to_have_count(23)
                expect(page.locator('#art > g')).to_have_count(0)
                page.locator('#tray').evaluate('(el)=>el.scrollLeft=0')
            # Seed one loose piece in neutral space to isolate each manipulation mode.
            page.locator('.piece-slot[data-piece=\"shell-center\"]').click()
            data = saved(page)
            selected = next(k for k,v in data['states'].items() if v['location']=='board')
            data['states'][selected].update(x=360, y=240, angle=30)
            page.evaluate('([key,game]) => localStorage.setItem(key, JSON.stringify({game,sound:false}))', [KEY,data])
            page.reload()
            page.locator('[data-puzzle=sea-turtle-v1]').click()
            page.locator(f'#art [data-piece="{selected}"] path').click()
            start = point(page, '.move-handle')
            drag(page,session,start,(start[0]+16,start[1]+8))
            moved = saved(page)['states'][selected]
            assert moved['x']>360 and moved['y']>240
            assert abs(moved['angle']-30)<.01, 'Moving handle must not rotate'
            # Drag the middle of the line 25 degrees around the piece center.
            line = page.locator('.rotation-hit')
            attrs = line.evaluate('(e) => Object.fromEntries(["x1","y1","x2","y2"].map(k=>[k,+e.getAttribute(k)]))')
            box = page.locator('#board').bounding_box()
            k = box['width']/720
            cx,cy = box['x']+attrs['x1']*k,box['y']+attrs['y1']*k
            sx,sy = box['x']+(attrs['x1']+attrs['x2'])/2*k,box['y']+(attrs['y1']+attrs['y2'])/2*k
            r = math.radians(25)
            end = (cx+(sx-cx)*math.cos(r)-(sy-cy)*math.sin(r),cy+(sx-cx)*math.sin(r)+(sy-cy)*math.cos(r))
            drag(page,session,(sx,sy),end)
            rotated = saved(page)['states'][selected]
            assert abs(rotated['angle']-55)<1
            assert abs(rotated['x']-moved['x'])<.1 and abs(rotated['y']-moved['y'])<.1
            before = saved(page)
            page.locator('#reference-view').click()
            expect(page.locator('#art > g')).to_have_count(23)
            page.locator('#zoom-in').click()
            page.locator('#puzzle-view').click()
            assert saved(page)==before
            expect(page.locator('.move-handle')).to_have_count(1)
            page.locator('#return').click()
            expect(page.locator('.piece-slot')).to_have_count(23)
            expect(page.locator('.move-handle')).to_have_count(0)
            assert saved(page)['order']==data['order']
            # Completing the last piece uses the normal handle-release snap path.
            geometry = page.evaluate('async()=> (await import("./content.js")).preparePuzzle(await (await fetch("puzzles/sea-turtle/puzzle.json")).json()).pieces.map(p=>({id:p.id,cx:p.cx,cy:p.cy}))')
            data = saved(page)
            last = next(p for p in geometry if p['id']=='shell-center')
            for piece in geometry:
                data['states'][piece['id']].update(location='locked',x=piece['cx'],y=piece['cy'],angle=0)
            data['states'][last['id']].update(location='board',x=last['cx']+10)
            for zoom in (1, 2, 3):
                page.evaluate('([key,game])=>localStorage.setItem(key,JSON.stringify({game,sound:false}))',[KEY,data])
                page.reload()
                page.locator('[data-puzzle=sea-turtle-v1]').click()
                page.locator('#art [data-piece="shell-center"] path').click()
                for _ in range(zoom-1):
                    page.locator('#zoom-in').click()
                start = point(page,'.move-handle')
                drag(page,session,start,(start[0]-1,start[1]))
                expect(page.locator('#counter')).to_have_text('23 / 23 pieces placed')
                expect(page.locator('#complete')).to_be_visible()
                expect(page.locator('.move-handle')).to_have_count(0)
                expect(page.locator('#return')).to_be_disabled()
            page.locator('#replay').click()
            expect(page.locator('.piece-slot')).to_have_count(23)
            page.screenshot(path=f'/tmp/brittz-{"mobile" if mobile else "desktop"}.png',full_page=True)
            assert not errors, errors
        context.close()
    browser.close()
print('PASS: desktop mouse and emulated touch, movement vs rotation, return, reference, persistence, completion, replay, both deployment roots.')
