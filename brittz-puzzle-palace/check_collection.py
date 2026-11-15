"""v0.2 collection, migration, content publishing, and actual JPG export checks.
Development only: Python Playwright, Pillow, Chromium. No server/network needed.
"""
import json
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit
from PIL import Image
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'brittz-puzzle-palace'
ORIGIN = 'http://collection.test'
TURTLE = json.loads((APP / 'puzzles/sea-turtle/puzzle.json').read_text())
GEM = json.loads((APP / 'puzzles/tropical-gem/puzzle.json').read_text())
CATALOG = json.loads((APP / 'catalog.json').read_text())
KEY = 'brittz-puzzle:sea-turtle-v1:v1'
GEM_KEY = 'brittz-puzzle:tropical-gem:v1'


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
    route.fulfill(path=str(file), content_type=mimetypes.guess_type(file)[0] or 'text/plain')


def state(puzzle, locked=False):
    return {'order': [p['id'] for p in puzzle['pieces']], 'states': {p['id']: {'location': 'locked' if locked else 'tray', 'x': p['correct']['x'], 'y': p['correct']['y'], 'angle': 0} for p in puzzle['pieces']}}


def read(page, key):
    return page.evaluate('k=>JSON.parse(localStorage.getItem(k))', key)


def write(page, key, game):
    page.evaluate('([k,game])=>localStorage.setItem(k,JSON.stringify({game,sound:false}))', [key, game])


def choose(page, id):
    page.locator(f'[data-puzzle="{id}"]').click()
    expect(page.locator('#game-screen')).to_be_visible()


def back(page):
    page.locator('#back-gallery').click()
    expect(page.locator('#gallery-screen')).to_be_visible()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'))
    for mobile in (False, True):
        context = browser.new_context(viewport={'width': 390 if mobile else 1100, 'height': 1000}, has_touch=mobile, is_mobile=mobile, accept_downloads=True)
        context.route(ORIGIN+'/**', serve)
        # Observe the actual text and image drawn to the exported canvas.
        context.add_init_script('''
            window.certificateText=[];window.certificateSVG='';
            const text=CanvasRenderingContext2D.prototype.fillText;
            CanvasRenderingContext2D.prototype.fillText=function(...args){window.certificateText.push(args[0]);return text.apply(this,args);};
            const create=URL.createObjectURL;
            URL.createObjectURL=function(blob){if(blob.type==='image/svg+xml')blob.text().then(t=>window.certificateSVG=t);return create.call(this,blob);};
        ''')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        for prefix in ('/', '/small-apps/'):
            url = ORIGIN+prefix+'brittz-puzzle-palace/'
            page.goto(url)
            expect(page.locator('.puzzle-card')).to_have_count(len(CATALOG['puzzles']))
            expect(page.locator('#game-screen')).to_be_hidden()
            for width in (320, 390, 768, 1100):
                page.set_viewport_size({'width': width, 'height': 1000})
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.set_viewport_size({'width':390 if mobile else 1100,'height':1000})
            page.evaluate('localStorage.clear()')
            legacy = state(TURTLE)
            legacy['states']['shell-center'].update(location='board',x=350,y=240,angle=35)
            legacy['states']['head']['location']='locked'
            write(page, 'brittz-sea-turtle-v1', legacy)
            page.reload()
            expect(page.locator('[data-puzzle=sea-turtle-v1] .puzzle-status')).to_contain_text('1 / 23')
            choose(page, 'sea-turtle-v1')
            assert read(page, KEY)['game']==legacy
            expect(page.locator('#counter')).to_have_text('1 / 23 pieces placed')
            expect(page.locator('#complete')).to_be_hidden()
            expect(page.locator('#export-certificate')).to_be_disabled()
            # Reference art must never unlock certificates.
            page.locator('#reference-view').click()
            expect(page.locator('#export-certificate')).to_be_disabled()
            page.evaluate('document.getElementById("certificate-form").dispatchEvent(new Event("submit",{cancelable:true}))')
            assert not page.locator('#certificate-download').get_attribute('href')
            page.locator('#puzzle-view').click()
            before = read(page, KEY)['game']
            back(page)
            choose(page,'tropical-gem')
            page.locator('.piece-slot[data-piece=sunrise]').click()
            page.locator('#board').press(']')
            gem_before = read(page,GEM_KEY)['game']
            back(page)
            choose(page,'sea-turtle-v1')
            assert read(page,KEY)['game']==before
            back(page)
            choose(page,'tropical-gem')
            assert read(page,GEM_KEY)['game']==gem_before
            page.locator('#restart').click()
            page.locator('#restart-dialog [value=cancel]').click()
            assert read(page,GEM_KEY)['game']==gem_before
            page.locator('#restart').click()
            page.locator('#restart-dialog [value=restart]').click()
            expect(page.locator('.piece-slot')).to_have_count(4)
            assert read(page,KEY)['game']==before
            # Seed completion to isolate certificate gating and file correctness;
            # check_browser.py separately exercises the final snap and replay.
            write(page, KEY, state(TURTLE,True))
            page.reload()
            choose(page,'sea-turtle-v1')
            expect(page.locator('#export-certificate')).to_be_enabled()
            page.locator('#player-name').fill('Britt & Family')
            with page.expect_download() as pending:
                page.locator('#export-certificate').click()
            download = pending.value
            assert download.suggested_filename=='brittz-sea-turtle-v1-certificate.jpg'
            target = f'/tmp/brittz-certificate-{"mobile" if mobile else "desktop"}.jpg'
            download.save_as(target)
            image = Image.open(target).convert('RGB')
            assert image.width==1600 and image.height>1200
            assert Image.open(target).format=='JPEG'
            assert 'Completed by Britt & Family' in page.evaluate('window.certificateText')
            assert 'Sea Turtle' in page.evaluate('window.certificateText')
            assert '23 pieces · Every piece in its place' in page.evaluate('window.certificateText')
            svg = page.evaluate('window.certificateSVG')
            assert svg.count('<path')==23 and 'cx="466"' in svg
            # Pixel from the shell center in the downloaded JPEG, away from seams.
            color = image.getpixel((round(100+350*1400/720),round(220+250*1400/720)))
            assert all(abs(a-b)<8 for a,b in zip(color,(243,198,106))),color
            # There is rendered name text in the lower certificate, not just artwork.
            y = round(220+1400*480/720)
            crop = image.crop((110,y+150,1490,y+205))
            pixels=crop.tobytes()
            assert sum(1 for i in range(0,len(pixels),3) if pixels[i]<100 and pixels[i+1]<120 and pixels[i+2]<130)>100
            page.locator('#reference-view').click()
            expect(page.locator('#complete')).to_be_hidden()
            expect(page.locator('#export-certificate')).to_be_disabled()
            expect(page.locator('#certificate-download')).to_be_hidden()
            page.locator('#puzzle-view').click()
            back(page)
            expect(page.locator('[data-puzzle=sea-turtle-v1] .puzzle-status')).to_have_text('Completed')
            choose(page,'sea-turtle-v1')
            expect(page.locator('#player-name')).to_have_value('Britt & Family')
            back(page)
            # Gallery Replay restarts only the chosen puzzle.
            gem_saved=read(page,GEM_KEY)
            page.locator('.puzzle-card:has([data-puzzle=sea-turtle-v1]) .gallery-replay').click()
            expect(page.locator('.piece-slot')).to_have_count(23)
            assert read(page,GEM_KEY)==gem_saved
            back(page)
            page.screenshot(path=f'/tmp/brittz-gallery-{"mobile" if mobile else "desktop"}.png',full_page=True)
            # A different completed puzzle must export its own artwork and metadata.
            write(page,GEM_KEY,state(GEM,True))
            page.reload()
            choose(page,'tropical-gem')
            page.locator('#player-name').fill('Britt')
            with page.expect_download() as pending:
                page.locator('#export-certificate').click()
            other=pending.value
            assert other.suggested_filename=='brittz-tropical-gem-certificate.jpg'
            assert page.evaluate('window.certificateSVG').count('<path')==4
            assert 'Tropical Gem' in page.evaluate('window.certificateText')
            assert '4 pieces · Every piece in its place' in page.evaluate('window.certificateText')
            assert 'Completed by Britt' in page.evaluate('window.certificateText')
            # Cancel a slow in-flight export by entering Reference; it cannot download.
            page.evaluate('''() => {
                const original=HTMLCanvasElement.prototype.toBlob;
                HTMLCanvasElement.prototype.toBlob=function(callback,...rest){original.call(this,blob=>setTimeout(()=>callback(blob),200),...rest);};
            }''')
            downloads=[]
            page.on('download',lambda download:downloads.append(download))
            page.locator('#export-certificate').click()
            page.locator('#reference-view').click()
            page.wait_for_timeout(350)
            assert not downloads
            expect(page.locator('#certificate-download')).to_be_hidden()
            back(page)
            # Root gallery navigation remains the normal relative App Lab link.
            page.locator('a.back').click()
            expect(page.locator('.launch-link[href="brittz-puzzle-palace/"]')).to_be_visible()
            assert not errors,errors
        context.close()
    # Simulate publishing an additional content-only puzzle without modifying engine JS.
    context = browser.new_context()
    context.route(ORIGIN+'/**',serve)
    demo = json.loads((APP/'examples/puzzle.template.json').read_text())
    entry = {'id':demo['id'],'version':1,'title':demo['title'],'pieceCount':4,'data':'puzzles/new/puzzle.json','thumbnail':'puzzles/tropical-gem/thumbnail.svg'}
    catalog = {**CATALOG,'puzzles':CATALOG['puzzles']+[entry]}
    context.route('**/catalog.json', lambda route:route.fulfill(json=catalog))
    context.route('**/puzzles/new/puzzle.json',lambda route:route.fulfill(json=demo))
    page = context.new_page()
    page.goto(ORIGIN+'/small-apps/brittz-puzzle-palace/')
    expect(page.locator('.puzzle-card')).to_have_count(len(catalog['puzzles']))
    choose(page,'my-puzzle')
    expect(page.locator('.piece-slot')).to_have_count(4)
    expect(page.locator('#puzzle-title')).to_have_text('My Puzzle')
    page.screenshot(path='/tmp/brittz-content-only-puzzle.png',full_page=True)
    context.close()
    # Bad content is rejected visibly rather than partially opening an invalid board.
    context=browser.new_context()
    context.route(ORIGIN+'/**',serve)
    bad=json.loads(json.dumps(GEM));bad['pieces'][0]['points'][0]=[-1,0]
    context.route('**/puzzles/tropical-gem/puzzle.json',lambda route:route.fulfill(json=bad))
    page=context.new_page();page.goto(ORIGIN+'/small-apps/brittz-puzzle-palace/')
    page.locator('[data-puzzle=tropical-gem]').click()
    expect(page.locator('#gallery-message')).to_contain_text('coordinates')
    expect(page.locator('#game-screen')).to_be_hidden()
    context.close()
    browser.close()
print('PASS: gallery layouts/paths, turtle migration, independent progress/restart/replay, content-only publishing, invalid content errors, completed-only personalized JPG with exact artwork pixels, remembered name, desktop and emulated touch.')
