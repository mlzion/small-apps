"""Local Chromium integration checks; no network or runtime dependencies."""
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium')
    errors, missing = [], []
    def serve(route):
        path = urlsplit(route.request.url).path
        if path.startswith('/small-apps/'): path = path[len('/small-apps'):]
        file = ROOT / path.lstrip('/')
        if file.is_dir(): file /= 'index.html'
        if not file.is_file():
            missing.append(path); route.fulfill(status=404); return
        mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}
        route.fulfill(path=str(file), content_type=mime.get(file.suffix,'text/plain'))
    def context(**kwargs):
        ctx = browser.new_context(**kwargs)
        ctx.route('http://app-lab.test/**', serve)
        ctx.on('weberror', lambda e: errors.append(str(e)))
        return ctx
    desktop = context()
    page = desktop.new_page()
    for prefix in ('/', '/small-apps/'):
        page.goto('http://app-lab.test'+prefix)
        page.get_by_role('link',name='Launch Falling Blocks').click()
        expect(page).to_have_url('http://app-lab.test'+prefix+'falling-blocks/')
        page.locator('#start').click()
        expect(page.locator('#overlay')).to_be_hidden()
        for key, sign in [('ArrowLeft',-1),('ArrowRight',1),('a',-1),('d',1)]:
            before = page.evaluate('game.piece.x'); page.keyboard.press(key)
            assert page.evaluate('game.piece.x') == before+sign
        before = page.evaluate('JSON.stringify(game.piece.matrix)')
        page.keyboard.press('x'); page.keyboard.press('z')
        assert page.evaluate('JSON.stringify(game.piece.matrix)') == before
        score = page.evaluate('game.score');page.keyboard.press('ArrowDown')
        assert page.evaluate('game.score') == score+1
        page.keyboard.press('Space');assert page.evaluate('game.board.flat().some(Boolean)')
        page.keyboard.press('p');assert page.evaluate('game.state') == 'paused'
        before = page.evaluate('JSON.stringify(game.piece)');page.keyboard.press('ArrowLeft');page.wait_for_timeout(900)
        assert page.evaluate('JSON.stringify(game.piece)') == before
        page.locator('#start').click();page.keyboard.press('Escape');assert page.evaluate('game.state') == 'paused'
        page.locator('#pause').click();assert page.evaluate('game.state') == 'playing'
        page.locator('#mute').click();expect(page.locator('#mute')).to_have_attribute('aria-pressed','false')
        assert page.evaluate('audio.state') == 'running'
        page.locator('#mute').click();expect(page.locator('#mute')).to_have_attribute('aria-pressed','true')
        page.evaluate("game.board[19]=Array(10).fill(1);game.board[19][4]=0;game.piece={type:0,matrix:[[1]],x:4,y:19}")
        page.locator('[data-action=hard]').click();expect(page.locator('#lines')).to_have_text('1')
        page.evaluate("game.board=Array.from({length:20},()=>Array(10).fill(1));game.spawn()")
        expect(page.locator('#message')).to_have_text('Stack complete.')
        expect(page.locator('#detail')).to_contain_text('Game over')
        page.locator('#restart').click();expect(page.locator('#score')).to_have_text('0')
        for width in (320,375,640,768,1024,1440):
            page.set_viewport_size({'width':width,'height':900})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            for b in page.locator('button').all():
                if b.is_visible(): assert b.bounding_box()['height']>=44
        page.screenshot(path='/tmp/falling-blocks-desktop.png',full_page=True)
        page.get_by_role('link',name='← The collection').click()
        expect(page).to_have_url('http://app-lab.test'+prefix+'#apps')
    mobile = context(viewport={'width':375,'height':812},is_mobile=True,has_touch=True,device_scale_factor=2)
    touch = mobile.new_page();touch.goto('http://app-lab.test/small-apps/falling-blocks/')
    touch.locator('#start').tap()
    before = touch.evaluate('game.piece.x');touch.locator('[data-action=left]').tap()
    assert touch.evaluate('game.piece.x') == before-1
    touch.locator('[data-action=right]').tap();assert touch.evaluate('game.piece.x') == before
    touch.evaluate('game.piece={type:2,matrix:FallingBlocks.SHAPES[2].map(r=>r.slice()),x:3,y:0}')
    before = touch.evaluate('JSON.stringify(game.piece.matrix)');touch.locator('[data-action=rotate]').tap()
    assert touch.evaluate('JSON.stringify(game.piece.matrix)') != before
    touch.locator('[data-action=down]').tap();assert touch.evaluate('game.score') == 1
    # Hold a real touchscreen contact to verify repeat and release, including no page drag.
    client = mobile.new_cdp_session(touch);button=touch.locator('[data-action=left]');button.scroll_into_view_if_needed();box=button.bounding_box()
    x,y=box['x']+box['width']/2,box['y']+box['height']/2
    scroll=touch.evaluate('scrollY'); before=touch.evaluate('game.piece.x')
    client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    touch.wait_for_timeout(500)
    client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert touch.evaluate('game.piece.x') < before-1
    stopped=touch.evaluate('game.piece.x');touch.wait_for_timeout(200);assert touch.evaluate('game.piece.x')==stopped
    assert touch.evaluate('scrollY')==scroll
    touch.locator('[data-action=hard]').tap();assert touch.evaluate('game.board.flat().some(Boolean)')
    touch.locator('#pause').tap();assert touch.evaluate('game.state')=='paused'
    touch.locator('#pause').tap();assert touch.evaluate('game.state')=='playing'
    touch.evaluate("window.dispatchEvent(new Event('blur'))");assert touch.evaluate('game.state')=='paused'
    touch.locator('#restart').tap();expect(touch.locator('#score')).to_have_text('0')
    touch.screenshot(path='/tmp/falling-blocks-mobile.png',full_page=True)
    assert not errors, errors
    assert not missing, missing
    print('PASS: root/Pages gallery navigation and assets; keyboard, touch tap/hold/release, rotation, drops, pause, blur, restart, generated audio/mute, scoring, game over, six responsive widths, 44px controls')
    browser.close()
