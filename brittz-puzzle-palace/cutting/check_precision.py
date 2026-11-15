"""Standalone Phase 1B mouse and emulated-touch browser acceptance."""
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote,urlsplit
from playwright.sync_api import sync_playwright
from precision_checks import exercise_controls
ROOT=Path(__file__).resolve().parents[2]
ORIGIN='http://precision.test'

def serve(route):
    path=unquote(urlsplit(route.request.url).path)
    if path.startswith('/small-apps/'):path=path[len('/small-apps'):]
    file=(ROOT/path.lstrip('/')).resolve()
    if not file.is_relative_to(ROOT):return route.fulfill(status=403)
    if file.is_dir():file/='index.html'
    if not file.is_file():return route.fulfill(status=404)
    route.fulfill(path=str(file),content_type=mimetypes.guess_type(file)[0] or 'text/plain')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
    for mobile,width in ((False,1100),(True,320),(True,360),(True,390)):
        context=browser.new_context(viewport={'width':width,'height':800 if mobile else 1100},has_touch=mobile,is_mobile=mobile)
        context.route(ORIGIN+'/**',serve)
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(ORIGIN+'/small-apps/brittz-puzzle-palace/cutting/')
        exercise_controls(page,context,mobile,complete=width in (1100,360))
        assert not errors,errors
        context.close()
    browser.close()
