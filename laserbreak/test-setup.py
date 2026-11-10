"""Real touch scrolling/slider intent and full-screen Setup lifecycle."""
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
    errors=[]
    def serve(route):
        file=ROOT/urlsplit(route.request.url).path.lstrip('/')
        if file.is_dir():file/='index.html'
        route.fulfill(path=str(file),content_type={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}.get(file.suffix,'text/html'))
    for width,height in [(568,320),(844,390)]:
        context=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True,device_scale_factor=2)
        context.route('http://app-lab.test/**',serve);context.on('weberror',lambda e:errors.append(str(e)))
        context.add_init_script('screen.orientation.lock=async()=>{throw Error("unsupported");};')
        page=context.new_page();page.goto('http://app-lab.test/laserbreak/')
        client=context.new_cdp_session(page)
        def swipe(x1,y1,x2,y2):
            client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'id':1,'x':x1,'y':y1}]})
            for n in range(1,9):
                client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'id':1,'x':x1+(x2-x1)*n/8,'y':y1+(y2-y1)*n/8}]})
                page.wait_for_timeout(16)
            client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            page.wait_for_timeout(100)
        def values():return page.evaluate('JSON.stringify(Array.from(setup.querySelectorAll("input[type=range]"),el=>el.value))')
        for state in ['active','paused','stopped']:
            page.evaluate('world.start();world.configure("density",0);')
            if state=='paused':page.locator('#pause').tap()
            if state=='stopped':page.locator('#session').tap()
            previous=page.evaluate('[world.running,world.paused]')
            page.locator('#setup-toggle').tap();expect(page.locator('#setup')).to_be_visible()
            bounds=page.locator('#setup').bounding_box()
            assert bounds['x']==0 and bounds['y']==0 and abs(bounds['width']-width)<=12 and bounds['height']==height
            assert page.evaluate('world.settingsOpen && arena.inert && !world.ready()')
            frozen=page.evaluate('JSON.stringify([world.objects,world.effects,world.particles,world.time,world.spawnClock,world.bag])')
            page.wait_for_timeout(100)
            assert page.evaluate('JSON.stringify([world.objects,world.effects,world.particles,world.time,world.spawnClock,world.bag])')==frozen
            page.locator('#close-setup').tap()
            assert page.evaluate('[world.running,world.paused]')==previous
        page.evaluate('world.start()');page.locator('#setup-toggle').tap()
        initial=values();slider=page.locator('#cooldown').bounding_box()
        # Begin in the empty row space below the actual slider, then swipe vertically.
        x=slider['x']+slider['width']/2;y=slider['y']+slider['height']+16
        swipe(x,y,x,max(85,y-120))
        assert page.evaluate('setup.scrollTop')>20
        assert values()==initial
        assert page.evaluate('getComputedStyle(setup).overflowY')=='scroll'
        # Even a vertical swipe beginning on a range must scroll rather than adjust it.
        page.evaluate('setup.scrollTop=0');page.wait_for_timeout(100);slider=page.locator('#cooldown').bounding_box()
        swipe(slider['x']+slider['width']*.7,slider['y']+22,slider['x']+slider['width']*.7,90)
        assert values()==initial
        assert page.evaluate('setup.scrollTop')>15
        # A deliberate horizontal drag updates the live value and output.
        page.evaluate('setup.scrollTop=0');page.wait_for_timeout(100);slider=page.locator('#cooldown').bounding_box()
        thumb=slider['x']+14+(slider['width']-28)*.75/2
        swipe(thumb,slider['y']+22,slider['x']+14+(slider['width']-28)*.8,slider['y']+22)
        assert abs(page.evaluate('world.settings.cooldown')-1.6)<.01
        assert page.locator('#cooldown').input_value()=='1.6'
        # Starting outside the control and passing over it never activates the slider.
        before=values();page.evaluate('setup.scrollTop=0');page.wait_for_timeout(80)
        swipe(slider['x']-16,slider['y']+22,slider['x']+slider['width']*.4,slider['y']+22)
        assert values()==before
        # The new ratio row uses the same touch handling and preserves live objects.
        page.locator('#barPercentage').scroll_into_view_if_needed();page.wait_for_timeout(80)
        ratio=page.locator('#barPercentage').bounding_box();existing=page.evaluate('JSON.stringify(world.objects)')
        swipe(ratio['x']+14+(ratio['width']-28)*.4,ratio['y']+22,ratio['x']+14+(ratio['width']-28)*.7,ratio['y']+22)
        assert page.evaluate('world.settings.barPercentage===70 && world.bag.length===10 && world.bag.filter(t=>t==="bar").length===7')
        assert page.evaluate('JSON.stringify(world.objects)')==existing
        # Sticky upper-left close remains reachable after scrolling to the end.
        page.evaluate('setup.scrollTop=setup.scrollHeight');expect(page.locator('#close-setup')).to_be_in_viewport()
        close=page.locator('#close-setup').bounding_box();assert close['x']<40 and close['y']<40
        page.locator('#close-setup').tap()
        page.locator('#fullscreen').tap();page.wait_for_function('document.fullscreenElement!==null')
        page.locator('#setup-toggle').tap()
        assert page.evaluate('setup.getBoundingClientRect().height===innerHeight && Math.abs(setup.getBoundingClientRect().width-innerWidth)<=12 && world.settingsOpen')
        page.screenshot(path=f'/tmp/laserbreak-setup-{width}.png')
        page.locator('#close-setup').tap();assert page.evaluate('document.fullscreenElement!==null && !world.settingsOpen')
        page.locator('#setup-toggle').tap();page.set_viewport_size({'width':390,'height':844})
        expect(page.locator('#orientation-overlay')).to_be_visible();expect(page.locator('#setup')).to_be_hidden()
        assert page.evaluate('!world.settingsOpen && world.orientationBlocked && !world.ready()')
        page.evaluate('document.exitFullscreen()');page.set_viewport_size({'width':width,'height':height})
        expect(page.locator('#orientation-overlay')).to_be_hidden()
        assert page.evaluate('!world.settingsOpen && !arena.inert')
        context.close()
    assert not errors,errors
    browser.close()
    print('PASS: 568x320/844x390 real touch scroll between/on controls, no accidental range edits, deliberate slider drag, sticky X, active/paused/stopped restoration, full-screen Setup, fullscreen and portrait lifecycle')
