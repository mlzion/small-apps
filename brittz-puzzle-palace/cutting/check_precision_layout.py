"""Rendered panel geometry and real HTTP-cache regression (no Playwright routes).
Requires the same development-only Playwright/Pillow/Chromium as other checks.
"""
import io
import mimetypes
import os
import re
import threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote,urlsplit
from PIL import Image
from playwright.sync_api import sync_playwright,expect
from precision_checks import assert_precision_layout

ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'brittz-puzzle-palace'
CURRENT=(APP/'style.css').read_bytes()
LEGACY=CURRENT.split(b'/* Phase 1B:')[0]
HTML=(APP/'cutting/index.html').read_text()
# Reproduce the reported state: current markup + cached shared CSS without panel rules.
PROBE=re.sub(r'<script\b[^>]*>.*?</script>','',HTML)
PROBE=re.sub(r'<link[^>]*href="precision-controls.css[^\"]*"[^>]*>','',PROBE)
PROBE=re.sub(r'href="\.\./style.css[^\"]*"','href="../style.css"',PROBE).encode()
buffer=io.BytesIO();Image.new('RGB',(64,64),'turquoise').save(buffer,'PNG');IMAGE=buffer.getvalue()
state={'legacy':False,'requests':[]}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed=urlsplit(self.path);path=unquote(parsed.path)
        state['requests'].append(self.path)
        if path.endswith('/cache-probe.html'):
            data,mime=PROBE,'text/html'
        elif path.endswith('/brittz-puzzle-palace/style.css'):
            data,mime=(LEGACY if state['legacy'] else CURRENT),'text/css'
        else:
            if path.startswith('/small-apps/'):
                path=path[len('/small-apps'):]
            file=(ROOT/path.lstrip('/')).resolve()
            if not file.is_relative_to(ROOT):self.send_error(403);return
            if file.is_dir():file/='index.html'
            if not file.is_file():self.send_error(404);return
            data=file.read_bytes();mime=mimetypes.guess_type(file)[0] or 'text/plain'
        self.send_response(200);self.send_header('Content-Type',mime)
        self.send_header('Cache-Control','public, max-age=31536000, immutable' if mime=='text/css' else 'no-store')
        self.end_headers();self.wfile.write(data)
    def log_message(self,*args):pass

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
        for width in (320,360,390):
            for cached in (False,True):
                context=browser.new_context(viewport={'width':width,'height':800},device_scale_factor=2.75,has_touch=True,is_mobile=True)
                page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                state['requests']=[]
                if cached:
                    state['legacy']=True
                    page.goto(origin+'/small-apps/brittz-puzzle-palace/cutting/cache-probe.html')
                    page.locator('#gallery-screen').evaluate('e=>e.hidden=true')
                    page.locator('#game-screen').evaluate('e=>e.hidden=false')
                    page.locator('#select-panel').evaluate('e=>e.hidden=true');page.locator('#move-panel').evaluate('e=>e.hidden=false')
                    old=page.locator('#move-pad,#rotation-wheel').evaluate_all('es=>es.map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,y:r.y};})')
                    assert old[0]['width']<80 and old[1]['y']>old[0]['y'],old
                state['legacy']=False
                page.goto(origin+'/small-apps/brittz-puzzle-palace/cutting/')
                page.locator('#source-file').set_input_files({'name':'Layout.png','mimeType':'image/png','buffer':IMAGE})
                expect(page.locator('#gallery-message')).to_contain_text('Ready to shuffle')
                page.locator('#start-lab').click()
                expect(page.locator('.piece-slot')).to_have_count(50)
                # Disabled, selected/enabled, Reference/disabled, and returned/disabled.
                assert_precision_layout(page);page.locator('#workspace-move').click()
                disabled=assert_precision_layout(page)
                expect(page.locator('#move-pad')).to_be_disabled()
                page.locator('#workspace-select').click();page.locator('.piece-slot').first.click();page.locator('#workspace-move').click()
                expect(page.locator('#move-pad')).to_be_enabled()
                enabled=assert_precision_layout(page)
                for key in ('move','wheel'):
                    assert enabled[key]['width']==disabled[key]['width'] and enabled[key]['height']==disabled[key]['height']
                page.locator('#reference-view').click();expect(page.locator('#rotation-wheel')).to_be_disabled();assert_precision_layout(page)
                page.locator('#puzzle-view').click();assert_precision_layout(page)
                page.locator('#return').click();expect(page.locator('#move-pad')).to_be_disabled();assert_precision_layout(page)
                # Later generic container/button themes must not shrink/stack the controls.
                page.add_style_tag(content='.precision-panel button{width:32px;max-width:40px;height:28px;min-height:0;padding:2px 6px}.precision-panel button:disabled{width:28px;height:24px}.precision-pair{display:flex;flex-direction:column}')
                assert_precision_layout(page)
                page.locator('#workspace-select').click();page.locator('.piece-slot').first.click();page.locator('#workspace-move').click();assert_precision_layout(page)
                page.screenshot(path=f'/tmp/precision-layout-{width}-{"cached" if cached else "fresh"}.png',full_page=True)
                if cached:
                    # The old URL was fetched once, during warmup. New HTML must use
                    # fresh versioned URLs without relying on a hard refresh/cache clear.
                    assert state['requests'].count('/small-apps/brittz-puzzle-palace/style.css')==1,state['requests']
                assert any('/style.css?v=precision-layout-1' in path for path in state['requests']),state['requests']
                assert any('/precision-controls.css?v=compact-2' in path for path in state['requests']),state['requests']
                assert not errors,errors
                context.close()
                print(f'PASS {width}px / {"cached pre-1B CSS" if cached else "fresh"}: 120×120 enabled/disabled controls, horizontal row, labels/zoom/tray bounds, no overflow; generic button conflicts resisted.',flush=True)
        browser.close()
finally:
    server.shutdown();server.server_close()
