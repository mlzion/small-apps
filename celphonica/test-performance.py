"""v0.3 layout, settings, volume, orientation and fullscreen integration checks."""
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
                                args=['--autoplay-policy=document-user-activation-required'])
    ctx = browser.new_context(viewport={'width':844,'height':390}, is_mobile=True, has_touch=True)
    errors = []
    ctx.on('weberror', lambda error: errors.append(str(error)))
    def serve(route):
        path = urlsplit(route.request.url).path.removeprefix('/small-apps/')
        file = ROOT / path
        if file.is_dir(): file /= 'index.html'
        mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}
        route.fulfill(path=str(file), content_type=mime.get(file.suffix,'text/plain'))
    ctx.route('https://app-lab.test/**',serve)
    ctx.add_init_script("""
      window.audioProbe={contexts:[],voices:[],gains:[],filters:[]};
      const Native=window.AudioContext;
      window.AudioContext=class extends Native {
        constructor(options){super(options);audioProbe.contexts.push(this);}
        createOscillator(){const n=super.createOscillator(),v={node:n,stopped:false},stop=n.stop.bind(n);
          n.stop=(...args)=>{v.stopped=true;return stop(...args);};audioProbe.voices.push(v);return n;}
        createGain(){const n=super.createGain();audioProbe.gains.push(n);return n;}
        createBiquadFilter(){const n=super.createBiquadFilter();audioProbe.filters.push(n);return n;}
      };
      window.DeviceOrientationEvent=class extends Event {static requestPermission(){return Promise.resolve('granted');}};
      window.lockCase='success';window.lockCalls=[];window.unlockCalls=0;
      window.fakeLock=async mode=>{lockCalls.push(mode);
        if(lockCase==='reject')throw new DOMException('not supported','NotSupportedError');
        if(lockCase==='pending')await new Promise(resolve=>window.resolveLock=resolve);
      };
      Object.defineProperty(screen.orientation,'lock',{configurable:true,writable:true,value:fakeLock});
      Object.defineProperty(screen.orientation,'unlock',{configurable:true,value:()=>unlockCalls++});
    """)
    page=ctx.new_page();page.goto('https://app-lab.test/small-apps/celphonica/')
    def live(): return page.evaluate('audioProbe.voices.filter(v=>!v.stopped).length')
    def point(selector,index=0,x=.5,y=.5):
        r=page.locator(selector).nth(index).bounding_box()
        return {'x':r['x']+r['width']*x,'y':r['y']+r['height']*y}
    def setting(selector,value):
        page.click('#settings-open');page.select_option(selector,value);page.click('#settings-close')
    expect(page.locator('#settings')).to_be_hidden()
    expect(page.locator('#settings-open')).to_have_attribute('aria-expanded','false')
    # Modal focus, persistent values, Escape, close button and genuine outside taps.
    page.click('#settings-open')
    expect(page.locator('#settings-close')).to_be_focused()
    for _ in range(16):
        page.keyboard.press('Tab')
        assert page.evaluate('document.getElementById("settings").contains(document.activeElement)')
    page.select_option('#root','1');page.select_option('#scale','minor')
    page.keyboard.press('Escape')
    expect(page.locator('#settings')).to_be_hidden()
    expect(page.locator('#settings-open')).to_be_focused()
    expect(page.locator('.note').first).to_have_text('C♯3')
    page.click('#settings-open');expect(page.locator('#root')).to_have_value('1')
    page.mouse.click(10,100)
    expect(page.locator('#settings')).to_be_hidden()
    assert live()==0
    page.click('#settings-open');page.click('#settings-close')
    expect(page.locator('#settings')).to_be_hidden()
    # A second actual touch opens settings while another finger holds a note.
    client=ctx.new_cdp_session(page)
    def send(kind,points):client.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
    note=dict(point('.note'),id=1);gear=dict(point('#settings-open'),id=2)
    send('touchStart',[note]);page.wait_for_function('audioProbe.voices.some(v=>!v.stopped)')
    send('touchStart',[note,gear]);send('touchEnd',[gear])
    expect(page.locator('#settings')).to_be_visible()
    assert live()==0
    close=dict(point('#settings-close'),id=2)
    send('touchStart',[note,close])
    expect(page.locator('#settings')).to_be_hidden()
    assert live()==0
    send('touchEnd',[])
    # Volume slider changes expression level; pitch/filter and master remain independent.
    setting('#expression-mode','slider')
    page.mouse.move(**point('.note'));page.mouse.down()
    page.wait_for_function('audioProbe.voices.some(v=>!v.stopped)')
    before=page.evaluate('[audioProbe.voices.at(-1).node.frequency.value,audioProbe.filters[0].frequency.value]')
    page.locator('#volume-slider').fill('25')
    page.wait_for_function('Math.abs(audioProbe.gains[0].gain.value-.65*.25)<.005')
    assert page.evaluate('[audioProbe.voices.at(-1).node.frequency.value,audioProbe.filters[0].frequency.value]')==before
    page.mouse.up()
    page.click('#settings-open');page.locator('#volume').fill('50');page.click('#settings-close')
    note=dict(point('.note'),id=1);slider=dict(point('#volume-slider',y=.8),id=2)
    send('touchStart',[note]);send('touchStart',[note,slider])
    low=float(page.locator('#volume-slider').input_value())
    slider.update(point('#volume-slider',y=.2))
    send('touchMove',[note,slider])
    high=float(page.locator('#volume-slider').input_value())
    assert high>low+40,(low,high)
    assert live()==1
    send('touchEnd',[]);assert live()==0
    # Switching between pad and slider retains level instead of jumping in volume.
    level=page.locator('#volume-slider').input_value()
    setting('#expression-mode','xy');setting('#expression-mode','slider')
    expect(page.locator('#volume-slider')).to_have_value(level)
    # Genuine rotation releases held notes, closes settings, and preserves choices.
    page.mouse.move(**point('.note'));page.mouse.down()
    page.wait_for_function('audioProbe.voices.some(v=>!v.stopped)')
    page.set_viewport_size({'width':390,'height':844})
    expect(page.locator('#rotate-message')).to_be_visible()
    expect(page.locator('#keyboard')).to_be_hidden();assert live()==0
    page.mouse.up()
    page.locator('.note').first.dispatch_event('pointerdown',{'button':0,'pointerId':99})
    assert live()==0,'Portrait must reject even synthetic hidden-note input'
    page.set_viewport_size({'width':844,'height':390})
    page.click('#settings-open')
    page.set_viewport_size({'width':390,'height':844})
    expect(page.locator('#settings')).to_be_hidden()
    page.set_viewport_size({'width':844,'height':390})
    expect(page.locator('.note').first).to_have_text('C♯3')
    # Fullscreen first, then landscape lock; failure keeps fullscreen usable.
    page.click('#fullscreen');page.wait_for_function('lockCalls.length===1')
    assert page.evaluate('document.fullscreenElement!==null')
    assert page.evaluate('lockCalls')==['landscape']
    page.click('#fullscreen');page.wait_for_function('unlockCalls===1')
    page.evaluate("lockCase='reject'")
    page.click('#fullscreen');page.wait_for_function('lockCalls.length===2')
    expect(page.locator('#view-status')).to_contain_text('Landscape lock unavailable')
    assert page.evaluate('document.fullscreenElement!==null')
    page.click('#fullscreen');assert page.evaluate('unlockCalls')==1
    page.evaluate('screen.orientation.lock=undefined')
    page.click('#fullscreen');expect(page.locator('#view-status')).to_contain_text('Landscape lock unavailable')
    page.click('#fullscreen')
    page.evaluate("screen.orientation.lock=fakeLock;lockCase='pending'")
    page.click('#fullscreen');page.wait_for_function('typeof resolveLock === "function"')
    page.click('#fullscreen');page.evaluate('resolveLock()')
    page.wait_for_function('unlockCalls===2')
    # Request rejection is handled; the portrait fullscreen action also attempts lock.
    page.evaluate('() => {window.nativeRequest=document.documentElement.requestFullscreen;document.documentElement.requestFullscreen=async()=>{throw Error("blocked")};}')
    page.click('#fullscreen');expect(page.locator('#view-status')).to_contain_text('Full screen unavailable')
    page.evaluate('document.documentElement.requestFullscreen=nativeRequest;lockCase="success"')
    page.set_viewport_size({'width':390,'height':844})
    count=page.evaluate('lockCalls.length')
    page.click('#portrait-fullscreen');page.wait_for_function(f'lockCalls.length==={count+1}')
    page.click('#portrait-fullscreen')
    # All scales at narrow/short Android landscape sizes. No notes are omitted.
    for width,height in [(1280,720),(915,412),(844,390),(800,360),(740,360),(667,320),(640,280),(568,320)]:
        page.set_viewport_size({'width':width,'height':height})
        for scale,count in [('major',21),('minor',21),('pentatonic',15),('chromatic',36)]:
            setting('#scale',scale)
            expect(page.locator('.note')).to_have_count(count)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight')
            regions=[page.locator(s).bounding_box() for s in ['.expression','.motion-panel','#keyboard']]
            assert regions[0]['x']+regions[0]['width']<regions[1]['x']
            assert regions[1]['x']+regions[1]['width']<regions[2]['x']
            circle=page.locator('#motion-level').bounding_box()
            assert circle['width']>=120 and abs(circle['width']-circle['height'])<1
            for el in page.locator('.note, #motion-level, #fullscreen, #settings-open, #volume-slider').all():
                assert el.evaluate('''el=>{const r=el.getBoundingClientRect();return r.width>=20&&r.height>=32&&r.top>=0&&r.bottom<=innerHeight&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'''),(width,height,scale)
            for el in page.locator('.note').all():
                assert el.evaluate('el=>el.scrollWidth<=el.clientWidth&&el.scrollHeight<=el.clientHeight'),(width,height,scale)
        if width in (844,640):page.screenshot(path=f'/tmp/celphonica-v03-{width}.png')
    # Drawer scrolls on a short screen and its close button stays reachable.
    page.set_viewport_size({'width':640,'height':280});page.click('#settings-open')
    edge=page.locator('.settings-drawer').bounding_box()
    pan={'x':edge['x']+8,'y':220,'id':1}
    send('touchStart',[pan]);pan['y']=70;send('touchMove',[pan]);send('touchEnd',[])
    page.wait_for_function('document.querySelector(".settings-drawer").scrollTop>0')
    expect(page.locator('#settings-close')).to_be_in_viewport()
    page.screenshot(path='/tmp/celphonica-v03-settings.png')
    page.click('#settings-close')
    for width,height in [(375,812),(320,568)]:
        page.set_viewport_size({'width':width,'height':height})
        expect(page.locator('#rotate-message')).to_be_visible()
        expect(page.locator('#instrument')).to_be_hidden()
        expect(page.locator('#rotate-status')).to_contain_text('Full screen can rotate')
    page.screenshot(path='/tmp/celphonica-v03-portrait.png')
    assert not errors,errors
    print('PASS: three-region landscape geometry/all notes and labels at eight sizes; large circular motion display; modal settings/focus/close/outside/Escape/scroll; actual touch settings interruption and note release; volume-only slider/master independence and multitouch; portrait rotation/hidden-input guard; fullscreen/landscape-lock success, rejection, missing API and pending-exit cleanup')
    browser.close()
