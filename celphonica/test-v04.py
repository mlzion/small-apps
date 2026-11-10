"""v0.4 real-touch polish, sensor/audio integration, and offline safety checks."""
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),
                              args=['--autoplay-policy=document-user-activation-required'])
    ctx=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
    errors=[]
    ctx.on('weberror',lambda error:errors.append(str(error)))
    def serve(route):
        path=urlsplit(route.request.url).path.removeprefix('/small-apps/')
        file=ROOT/path
        if file.is_dir():file/='index.html'
        mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}
        route.fulfill(path=str(file),content_type=mime.get(file.suffix,'text/plain'))
    ctx.route('https://app-lab.test/**',serve)
    ctx.add_init_script("""
      window.audioProbe={voices:[],contexts:[],gains:[],filters:[],guards:[]};
      const Native=window.AudioContext;
      window.AudioContext=class extends Native {
        constructor(options){super(options);audioProbe.contexts.push(this);}
        createOscillator(){const n=super.createOscillator(),v={node:n,stopped:false,ended:false},stop=n.stop.bind(n);
          n.stop=(...args)=>{v.stopped=true;return stop(...args);};
          n.addEventListener('ended',()=>v.ended=true);audioProbe.voices.push(v);return n;}
        createGain(){const n=super.createGain();audioProbe.gains.push(n);return n;}
        createBiquadFilter(){const n=super.createBiquadFilter();audioProbe.filters.push(n);return n;}
        createWaveShaper(){const n=super.createWaveShaper();audioProbe.guards.push(n);return n;}
      };
      window.DeviceOrientationEvent=class extends Event {static requestPermission(){return Promise.resolve('granted');}};
      window.DeviceMotionEvent=undefined;
      Object.defineProperty(screen.orientation,'angle',{get:()=>0});
    """)
    page=ctx.new_page();page.goto('https://app-lab.test/small-apps/celphonica/')
    client=ctx.new_cdp_session(page)
    def send(kind,points):client.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
    def point(selector,index=0,x=.5,y=.5,id=1):
        b=page.locator(selector).nth(index).bounding_box()
        return {'x':b['x']+b['width']*x,'y':b['y']+b['height']*y,'id':id}
    def live():return page.evaluate('audioProbe.voices.filter(v=>!v.stopped).length')
    def voice_count():return page.evaluate('audioProbe.voices.length')
    def sample(beta=0,gamma=0):
        page.evaluate('(v)=>window.dispatchEvent(Object.assign(new Event("deviceorientation"),v))',{'alpha':0,'beta':beta,'gamma':gamma})
    def pose(beta=0,gamma=0):
        sample(beta,gamma);page.wait_for_timeout(180);sample(beta,gamma);page.wait_for_timeout(220)
    def axes():return page.locator('#motion-level').evaluate('el=>[Number(el.dataset.x),Number(el.dataset.y)]')
    def detune():return page.evaluate('audioProbe.voices.at(-1).node.detune.value')
    def gain():return page.evaluate('audioProbe.gains[0].gain.value')
    def checkbox(id,enabled):
        # Exercise live changes without the drawer intentionally releasing notes.
        return page.evaluate('''v=>{
          const node=audioProbe.voices.at(-1).node,master=audioProbe.gains[0];
          const before={pitch:node.detune.value,gain:master.gain.value};
          const e=document.getElementById(v.id);e.checked=v.enabled;e.dispatchEvent(new Event('change'));
          return {before,after:{pitch:node.detune.value,gain:master.gain.value}};
        }''',{'id':id,'enabled':enabled})

    expect(page.locator('#notes')).to_have_text('Key: C maj | Note: —')
    expect(page.locator('#motion-enable')).to_be_hidden()
    page.click('#settings-open')
    close=page.locator('#settings-close').bounding_box();gear=page.locator('#settings-open').bounding_box()
    assert close['x']+close['width']<gear['x']-100,(close,gear)
    expect(page.locator('#settings')).to_be_visible()
    expect(page.locator('#motion-pitch')).not_to_be_checked()
    expect(page.locator('#motion-volume')).not_to_be_checked()
    expect(page.locator('#settings #motion-enable')).to_have_count(1)
    page.click('#settings-close')

    # Every point in the square pad, including near its label and current marker, is live.
    for x,y in [(.08,.9),(.92,.1),(.5,.5),(.01,.99),(.99,.01)]:
        pad=point('#xy-pad',x=x,y=y)
        send('touchStart',[pad])
        levels=page.locator('#volume-slider').input_value()
        assert abs(float(levels)-(1-y)*100)<=1,(x,y,levels)
        assert f'Bright {round(x*100)}%' in page.locator('#expression-value').inner_text()
        cursor=page.locator('#cursor').bounding_box();bounds=page.locator('#xy-pad').bounding_box()
        assert cursor['x']>=bounds['x']-1 and cursor['x']+cursor['width']<=bounds['x']+bounds['width']+1
        assert cursor['y']>=bounds['y']-1 and cursor['y']+cursor['height']<=bounds['y']+bounds['height']+1
        send('touchEnd',[])
    # Stable notes/chords remain after release, and key changes reflect actual selectors.
    page.locator('.note').first.click();expect(page.locator('#notes')).to_have_text('Key: C maj | Note: C3')
    chord=[point('.note',index=i,id=n+1) for n,i in enumerate([0,2,4,6])]
    send('touchStart',chord)
    expect(page.locator('#notes')).to_have_text('Key: C maj | Note: C3·E3·G3 +1')
    assert live()==4
    send('touchEnd',[]);assert live()==0
    expect(page.locator('#notes')).to_have_text('Key: C maj | Note: C3·E3·G3 +1')
    expect(page.locator('#notes')).to_have_attribute('title','Key: C maj | Note: C3 · E3 · G3 · B3')
    page.click('#settings-open');page.select_option('#root','9');page.select_option('#scale','minor');page.click('#settings-close')
    expect(page.locator('#notes')).to_contain_text('Key: A min | Note:')
    page.locator('.note').first.click();expect(page.locator('#notes')).to_have_text('Key: A min | Note: A3')
    page.click('#settings-open');page.select_option('#root','0');page.select_option('#scale','major')
    page.select_option('#expression-mode','slider');page.click('#settings-close')
    # Fader track taps away from the existing handle jump immediately, drag/cancel work.
    for y in [.85,.15,.7]:
        fader=point('#volume-slider',x=.2,y=y)
        send('touchStart',[fader])
        expect(page.locator('#volume-slider')).to_be_focused()
        first=float(page.locator('#volume-slider').input_value())
        assert (first<30 if y>.7 else first>70 if y<.3 else 20<first<40),first
        second=point('#volume-slider',x=.8,y=.95 if y<.5 else .05,id=2)
        send('touchStart',[fader,second])
        assert float(page.locator('#volume-slider').input_value())==first,'Second fader pointer must not cause a native jump'
        send('touchEnd',[second])
        fader.update(point('#volume-slider',x=.8,y=.5))
        send('touchMove',[fader])
        assert abs(float(page.locator('#volume-slider').input_value())-50)<=1
        send('touchCancel',[])
    page.locator('#volume-slider').focus();page.keyboard.press('ArrowUp')
    assert float(page.locator('#volume-slider').input_value())>50
    page.locator('#volume-slider').fill('100')

    page.click('#settings-open');page.click('#motion-enable')
    page.locator('#motion-pitch').check();page.locator('#motion-volume').check()
    page.click('#settings-close');sample()
    note=point('.note')
    send('touchStart',[note]);page.wait_for_function('audioProbe.voices.some(v=>!v.stopped)')
    page.wait_for_timeout(80)
    base_frequency=page.evaluate('audioProbe.voices.at(-1).node.frequency.value')
    assert abs(base_frequency-130.8128)<.01 and abs(detune())<.01 and abs(gain()-.65)<.005
    count=voice_count()
    pose(gamma=12.5)
    x,y=axes()
    assert .48<x<.51 and abs(detune()-x*200)<.15,(x,detune())
    assert voice_count()==count and live()==1
    assert page.evaluate('audioProbe.voices.at(-1).node.frequency.value')==base_frequency
    pose(beta=-12.5)
    x,y=axes()
    assert -.51<y<-.48 and abs(gain()-.65*(1-y*.15))<.002
    # Manual fader composes multiplicatively with motion; it never replaces the factor.
    fader=point('#volume-slider',x=.25,y=.6,id=2)
    send('touchStart',[note,fader]);send('touchEnd',[fader])
    level=float(page.locator('#volume-slider').input_value())/100
    page.wait_for_timeout(160)
    assert abs(gain()-.65*level*(1-y*.15))<.002
    assert voice_count()==count and live()==1
    pose(beta=-8,gamma=8)
    x,y=axes();bent=detune();boosted=gain()
    assert bent>40 and boosted>.65*level
    change=checkbox('motion-pitch',False)
    assert abs(change['after']['pitch']-change['before']['pitch'])<10,'Disabling pitch must ramp'
    page.wait_for_timeout(200)
    assert abs(detune())<.2 and abs(gain()-boosted)<.002
    change=checkbox('motion-pitch',True)
    assert abs(change['after']['pitch']-change['before']['pitch'])<10,'Enabling pitch must ramp from neutral'
    page.wait_for_timeout(200);assert abs(detune()-x*200)<.2
    change=checkbox('motion-volume',False)
    assert abs(change['after']['gain']-change['before']['gain'])<.003
    page.wait_for_timeout(200);assert abs(gain()-.65*level)<.002
    checkbox('motion-volume',True);page.wait_for_timeout(200)
    assert abs(gain()-.65*level*(1-y*.15))<.002
    # Manual recenter while a different pointer holds the note smoothly restores neutral.
    center=point('#motion-level',id=2)
    send('touchStart',[note,center]);send('touchEnd',[center])
    page.wait_for_timeout(220)
    assert axes()==[0,0] and abs(detune())<.2 and abs(gain()-.65*level)<.002
    assert voice_count()==count and live()==1
    pose(beta=-20,gamma=20);assert abs(detune())>30
    page.wait_for_timeout(2100)
    expect(page.locator('#motion-status')).to_contain_text('No sensor readings')
    assert axes()==[0,0] and abs(detune())<.2 and abs(gain()-.65*level)<.002
    sample(beta=45,gamma=65);page.wait_for_timeout(80)
    assert axes()==[0,0] and abs(detune())<.2
    pose(beta=30,gamma=45);assert abs(detune())>30
    # The actual disable listener is also safe for active voices, even though
    # opening the drawer normally releases them first.
    page.evaluate('document.getElementById("motion-enable").click()')
    page.wait_for_timeout(220)
    assert axes()==[0,0] and abs(detune())<.2 and abs(gain()-.65*level)<.002
    assert voice_count()==count and live()==1
    page.evaluate('document.getElementById("motion-enable").click()')
    expect(page.locator('#motion-enable')).to_have_attribute('aria-pressed','true')
    sample();pose(gamma=12.5);assert detune()>80
    extra=point('.note',index=2,id=3)
    send('touchStart',[note,extra])
    assert voice_count()==count+1 and live()==2
    assert abs(detune())<.01,'A fresh calibrated voice must start at original pitch'
    page.wait_for_timeout(220)
    assert page.evaluate('audioProbe.voices.filter(v=>!v.stopped).every(v=>Math.abs(v.node.detune.value)<.2)')
    send('touchEnd',[])
    page.wait_for_function('audioProbe.voices.every(v=>v.stopped&&v.ended)')
    assert live()==0

    # Production audio rendered offline: an existing oscillator bends and returns
    # in actual samples; overloads remain bounded for every waveform.
    results=page.evaluate('''async () => {
      const {Synth}=await import('./synth.js');const Native=window.AudioContext;
      function adapter(context,clock) {
        window.AudioContext=function(){return {state:'running',get currentTime(){return clock.time;},
          destination:context.destination,addEventListener(){},createOscillator:context.createOscillator.bind(context),
          createGain:context.createGain.bind(context),createBiquadFilter:context.createBiquadFilter.bind(context),
          createWaveShaper:context.createWaveShaper.bind(context)};};
      }
      function stats(buffer,start,end) {
        const a=buffer.getChannelData(0),r=buffer.sampleRate;let peak=0,crossings=[];
        for(let i=Math.ceil(start*r)+1;i<end*r;i++) {
          if(!Number.isFinite(a[i]))throw Error('non-finite audio');peak=Math.max(peak,Math.abs(a[i]));
          if(a[i-1]<=0&&a[i]>0)crossings.push(i-1-a[i-1]/(a[i]-a[i-1]));
        }
        return {peak,frequency:crossings.length>1?(crossings.length-1)*r/(crossings.at(-1)-crossings[0]):null};
      }
      const context=new OfflineAudioContext(1,48000*1.1,48000),clock={time:0};adapter(context,clock);
      const synth=new Synth();synth.setExpression({level:.6});await synth.unlock();synth.start(1,69);
      // Apply controls at actual rendering boundaries, like live input. Queuing
      // cancelAndHold calls far in the future before rendering is not live usage.
      const stages=[.025,.4,.65,.9].map(time=>context.suspend(time));
      const rendering=context.startRendering();
      for(let i=0;i<stages.length;i++) {
        await stages[i];clock.time=context.currentTime;
        if(i===0)synth.setMotion({bendCents:200,volume:1.15});
        if(i===1)synth.setMotion({bendCents:-200,volume:.85});
        if(i===2)synth.setMotion();
        if(i===3)synth.stop(1);
        await context.resume();
      }
      const buffer=await rendering;
      if(!buffer.getChannelData(0).every(Number.isFinite))throw Error('non-finite transition samples');
      const bend=stats(buffer,.2,.35),negative=stats(buffer,.55,.62),neutral=stats(buffer,.81,.88),tail=stats(buffer,1,1.09);
      const overload=[];
      for(const waveform of ['sine','triangle','sawtooth']) {
        const offline=new OfflineAudioContext(1,48000*.25,48000),t={time:0};adapter(offline,t);
        const s=new Synth();s.setWaveform(waveform);s.setVolume(1);s.setMotion({volume:1.15});await s.unlock();
        for(let id=0;id<40;id++)s.start(id,69);
        t.time=.1;s.stopAll();const a=(await offline.startRendering()).getChannelData(0);
        let peak=0,tail=0;for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i]))throw Error('non-finite overload');peak=Math.max(peak,Math.abs(a[i]));if(i>48000*.2)tail=Math.max(tail,Math.abs(a[i]));}
        overload.push({waveform,peak,tail});
      }
      window.AudioContext=Native;return {bend,negative,neutral,tail,overload};
    }''')
    assert abs(results['bend']['frequency']-440*2**(2/12))<.3,results
    assert abs(results['neutral']['frequency']-440)<.3,results
    assert abs(results['negative']['frequency']-440*2**(-2/12))<.3,results
    assert abs(results['bend']['peak']/results['neutral']['peak']-1.15)<.01,results
    assert abs(results['negative']['peak']/results['neutral']['peak']-.85)<.01,results
    assert results['tail']['peak']<1e-6,results
    for row in results['overload']:
        assert .9<row['peak']<.926 and row['tail']<1e-6,row
    print('Offline production audio:',results)

    page.reload();page.click('#settings-open')
    expect(page.locator('#motion-pitch')).not_to_be_checked();expect(page.locator('#motion-volume')).not_to_be_checked()
    page.click('#settings-close')
    # Square pad, labels/hit targets, and no more than ~10% keyboard reallocation.
    for width,height in [(1280,720),(915,412),(844,390),(800,360),(740,360),(667,320),(640,280),(568,320)]:
        page.set_viewport_size({'width':width,'height':height})
        page.click('#settings-open');page.select_option('#scale','chromatic');page.click('#settings-close')
        b=page.locator('#xy-pad').bounding_box();assert abs(b['width']-b['height'])<1,(width,height,b)
        for el in page.locator('.note, #xy-pad, #motion-level').all():
            assert el.evaluate('el=>{const r=el.getBoundingClientRect();return r.width>=19&&r.height>=32&&r.top>=0&&r.bottom<=innerHeight&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'),(width,height)
        for el in page.locator('.note').all():assert el.evaluate('el=>el.scrollWidth<=el.clientWidth&&el.scrollHeight<=el.clientHeight')
        if width==844:
            key_width=page.locator('#keyboard').bounding_box()['width']
            assert 472.9*.89<=key_width<=472.9*.91,key_width
            page.screenshot(path='/tmp/celphonica-v04-pad.png')
    page.set_viewport_size({'width':844,'height':390});page.click('#settings-open')
    page.select_option('#expression-mode','slider');page.click('#settings-close')
    page.screenshot(path='/tmp/celphonica-v04-fader.png')
    page.click('#settings-open');page.screenshot(path='/tmp/celphonica-v04-settings.png')
    page.locator('#motion-enable').scroll_into_view_if_needed()
    page.screenshot(path='/tmp/celphonica-v04-motion-settings.png')
    assert not errors,errors
    print('PASS: left-side close/no gear overlap; motion settings/defaults; real touch pad/fader taps/drag/cancel and keyboard input; retained key/note/chord readout; square XY + legible keys at eight sizes; both motion mappings on actual active oscillators without retrigger; calibration, independent toggles, manual expression multiplication, recenter, sensor loss/disable neutral return; real offline pitch/gain samples and overload protection')
    browser.close()
