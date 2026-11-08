"""Run from the repository root: python breakout/test-browser.py."""
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium')
    context = browser.new_context()
    errors, missing = [], []
    context.on('weberror', lambda error: errors.append(str(error)))
    def serve(route):
        path = urlsplit(route.request.url).path.removeprefix('/small-apps/')
        file = ROOT / path
        if file.is_dir(): file /= 'index.html'
        if not file.is_file():
            missing.append(path); route.fulfill(status=404); return
        mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}
        route.fulfill(path=str(file), content_type=mime.get(file.suffix,'text/plain'))
    context.route('http://app-lab.test/**', serve)
    page = context.new_page()
    page.goto('http://app-lab.test/small-apps/')
    page.get_by_role('link',name='Launch Breakout').click()
    expect(page).to_have_url('http://app-lab.test/small-apps/breakout/')
    page.get_by_role('button', name='Start',exact=True).click()
    expect(page.locator('#lives')).to_have_text('3')
    page.locator('canvas').focus()
    page.keyboard.press('Space')
    expect(page.locator('#overlay')).to_be_hidden()
    page.keyboard.press('Space')
    expect(page.locator('#message')).to_have_text('Paused')
    before = page.evaluate('game.ball.x')
    page.wait_for_timeout(100)
    assert page.evaluate('game.ball.x') == before
    page.get_by_role('button',name='Resume',exact=True).click()
    page.get_by_role('button',name='Pause',exact=True).click()
    page.get_by_role('button',name='Restart',exact=True).click()
    page.locator('canvas').focus()
    for key, sign in [('ArrowLeft',-1),('ArrowRight',1),('a',-1),('d',1)]:
        before=page.evaluate('game.paddle.x')
        page.keyboard.down(key);page.wait_for_timeout(100);page.keyboard.up(key)
        assert (page.evaluate('game.paddle.x')-before)*sign>0
    box=page.locator('canvas').bounding_box()
    page.mouse.move(box['x']+box['width']*.8,box['y']+box['height']*.8)
    assert abs(page.evaluate('game.paddle.x+56')-640)<2
    page.get_by_role('button',name='Mute sound').click()
    expect(page.locator('#mute')).to_have_attribute('aria-pressed','true')
    page.get_by_role('button',name='Unmute sound').click()
    # Inject deterministic scenarios into the actual engine; frame loop renders the result.
    page.evaluate("game.state='playing';game.bricks.forEach(b=>b.alive=false)")
    expect(page.locator('#level')).to_have_text('2')
    for remaining in (2,1,0):
        page.evaluate("game.state='playing';game.ball.y=580;game.ball.vy=300")
        expect(page.locator('#lives')).to_have_text(str(remaining))
    expect(page.locator('#message')).to_have_text('Game over')
    expect(page.locator('#detail')).to_contain_text('Final score:')
    page.locator('#restart').click()
    expect(page.locator('#score')).to_have_text('0');expect(page.locator('#level')).to_have_text('1')
    for width in (320,375,768,1440):
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.evaluate('game.lives===3 && game.level===1')
    page.screenshot(path='/tmp/breakout-desktop.png',full_page=True)
    mobile=browser.new_context(viewport={'width':375,'height':812},is_mobile=True,has_touch=True,device_scale_factor=2)
    mobile.route('http://app-lab.test/**',serve)
    touch=mobile.new_page();touch.goto('http://app-lab.test/small-apps/breakout/')
    touch.locator('#start').tap();touch.locator('#start').tap()
    expect(touch.locator('#overlay')).to_be_hidden()
    client=mobile.new_cdp_session(touch);box=touch.locator('canvas').bounding_box()
    x,y=box['x']+box['width']*.2,box['y']+box['height']*.8
    client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+150,'y':y}]})
    client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert touch.evaluate('game.paddle.x')>400
    assert touch.evaluate('scrollY')==0
    touch.locator('#pause').tap();expect(touch.locator('#message')).to_have_text('Paused')
    touch.locator('#pause').tap();touch.locator('#restart').tap()
    touch.screenshot(path='/tmp/breakout-mobile.png',full_page=True)
    assert not errors,errors
    assert not missing,missing
    print('PASS: Pages navigation/assets, keyboard, mouse, touch drag, scroll prevention, responsive widths, pause/resume, lives, levels, game over, mute and restart')
    browser.close()
