"""Real SF2 touch auditions and output-clock/DOM synchronization in Chromium."""
import json, math, os
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
URL='https://app-lab.test/small-apps/chordmidi/'
KEY='app-lab-chordmidi-v1'
PROBE='''(()=>{window.realSources=[];const Native=window.AudioContext;window.AudioContext=class extends Native{createBufferSource(){const s=super.createBufferSource(),start=s.start.bind(s),stop=s.stop.bind(s);s.stopCalls=[];s.start=t=>{s.startTime=t;return start(t);};s.stop=t=>{s.stopCalls.push(t??this.currentTime);return stop(t);};realSources.push(s);return s;}};})()'''
HOOK='''()=>{
 window.played=[];window.clicks=[];
 const init=ChordAudio.prototype.init,note=ChordAudio.prototype.note,click=ChordAudio.prototype.click,outputTime=ChordAudio.prototype.outputTime,position=ChordAudio.prototype.position;
 ChordAudio.prototype.init=async function(...args){window.engine=this;await init.apply(this,args);if(!this.clockHooked){this.clockHooked=true;const c=this.context,native=c.getOutputTimestamp?.bind(c);c.getOutputTimestamp=()=>{const stamp=window.simulatedOutputDelay?{contextTime:Math.max(0,c.currentTime-simulatedOutputDelay),performanceTime:performance.now()}:native?.();window.lastOutputRead={stamp,renderTime:c.currentTime};return stamp;};}};
 ChordAudio.prototype.outputTime=function(now=performance.now()){window.lastOutputRead=null;const value=outputTime.call(this,now);this.clockRead={...window.lastOutputRead,now,graph:this.graphLatency,base:this.context.baseLatency,device:this.context.outputLatency};return value;};
 ChordAudio.prototype.position=function(...args){const value=position.apply(this,args);this.lastDraw={clock:this.clockRead,wall:performance.now()};return value;};
 ChordAudio.prototype.note=function(pitch,time,duration,program,preview=false){const before=new Set(this.sources),r=note.call(this,pitch,time,duration,program,preview);played.push({pitch,time,duration,program,preview,renderTime:this.context.currentTime,voices:[...this.sources].filter(v=>!before.has(v)).map(v=>v.source)});return r;};
 ChordAudio.prototype.click=function(time,accent){clicks.push({time,accent});return click.call(this,time,accent);};
}'''
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--autoplay-policy=document-user-activation-required'])
    errors=[];missing=[]
    def serve(route):
        path=unquote(urlsplit(route.request.url).path)
        if path.startswith('/small-apps/'):path=path[len('/small-apps'):]
        file=(ROOT/path.lstrip('/')).resolve()
        if not file.is_relative_to(ROOT):return route.fulfill(status=403)
        if file.is_dir():file/='index.html'
        if not file.is_file():missing.append(path);return route.fulfill(status=404)
        route.fulfill(path=str(file),content_type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.sf2':'application/octet-stream'}.get(file.suffix,'text/plain'))
    def context(**kw):
        c=browser.new_context(**kw);c.route('https://app-lab.test/**',serve);c.add_init_script(PROBE);c.on('weberror',lambda e:errors.append(str(e.error)));return c
    c=context(viewport={'width':320,'height':740},is_mobile=True,has_touch=True)
    page=c.new_page();page.goto(URL)
    fixture=page.evaluate('''()=>{const p=ChordMidi.fresh();p.program=24;p.instrumentName='Acoustic Guitar (Nylon)';p.events=[ChordMidi.makeEvent(p,0,0,4),ChordMidi.makeEvent(p,1,0,4),ChordMidi.makeEvent(p,0,8,4),ChordMidi.makeEvent(p,2,2,1)];p.events[0].pitches=[61,65,73];p.events[1].pitches=[45,52,57];return p;}''')
    page.evaluate('([k,p])=>localStorage.setItem(k,JSON.stringify(p))',[KEY,fixture]);page.reload();page.evaluate(HOOK)
    def project():return page.evaluate('k=>JSON.parse(localStorage.getItem(k))',KEY)
    def chord(lane):return page.locator('.event[data-lane="'+str(lane)+'"]').first
    def preview_count():return page.evaluate('played.filter(n=>n.preview).length')
    rhid,lhid=fixture['events'][0]['id'],fixture['events'][1]['id']
    baseline_midi=page.evaluate('k=>Array.from(ChordMidi.midi(JSON.parse(localStorage.getItem(k))))',KEY)
    # Cold first launch: hold the real bank request until three taps have arrived.
    held=[]
    c.route('**/TimGM6mb.sf2',lambda route:held.append(route))
    chord(0).tap();page.wait_for_function('!!window.engine');expect(page.locator('#play')).to_be_enabled();expect(page.locator('#drop')).to_be_enabled()
    chord(1).tap();chord(0).tap();assert len(held)==1 and preview_count()==0
    held[0].fulfill(path=str(ROOT/'chordmidi/soundfont/TimGM6mb.sf2'),content_type='application/octet-stream')
    page.wait_for_function('played.filter(n=>n.preview).length===3')
    assert page.evaluate('played.map(n=>n.pitch)')==[61,65,73]
    assert page.evaluate('played.every(n=>n.program===24 && n.preview)')
    assert page.evaluate('!engine.running && engine.offset===0')
    assert page.evaluate('played.every(n=>n.time-n.renderTime<.01 && n.duration===.8)')
    assert project()==fixture
    # Hot sequential auditions cut only the preceding preview, with a de-click fade.
    for lane,pitches in [(1,[45,52,57]),(0,[61,65,73]),(1,[45,52,57])]:
        page.evaluate('window.previousPreview=[...engine.auditionSources].map(v=>v.source)')
        before=preview_count();chord(lane).tap();page.wait_for_function('(before)=>played.filter(n=>n.preview).length===before+3',arg=before)
        assert page.evaluate('played.slice(-3).map(n=>n.pitch)')==pitches
        assert page.evaluate('previousPreview.every(s=>s.stopCalls.at(-1)<=engine.context.currentTime+.006)')
        assert page.evaluate('!engine.running && engine.offset===0')
    assert project()==fixture
    assert page.evaluate('k=>Array.from(ChordMidi.midi(JSON.parse(localStorage.getItem(k))))',KEY)==baseline_midi
    # Freeze the audible position, then preview while paused without moving it.
    page.locator('#play').tap();page.wait_for_function('engine.running');page.wait_for_timeout(350);page.locator('#play').tap()
    page.wait_for_function('!engine.running');frozen=page.evaluate('engine.offset');assert frozen>0
    before=preview_count();chord(0).tap();page.wait_for_function('before=>played.filter(n=>n.preview).length===before+3',arg=before)
    page.wait_for_timeout(100);assert page.evaluate('engine.offset')==frozen
    assert page.evaluate('!engine.running') and project()==fixture
    page.locator('#stop').tap()
    # Short taps may audition; movement, cancellation and deletion may not.
    cdp=c.new_cdp_session(page)
    def touch(kind,x=0,y=0):
        cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind in ('touchEnd','touchCancel') else [{'x':x,'y':y,'id':1}]})
    def point(target,edge=False):
        target.scroll_into_view_if_needed();box=target.bounding_box();return box['x']+(box['width']/2 if edge else 15),box['y']+box['height']/2
    before=preview_count();x,y=point(chord(0).locator('.resize'),True)
    touch('touchStart',x,y);touch('touchMove',x+32,y);touch('touchEnd');assert project()['events'][0]['duration']==5
    assert preview_count()==before
    x,y=point(chord(1));touch('touchStart',x,y);touch('touchMove',x-45,y);touch('touchEnd');page.wait_for_timeout(800)
    assert preview_count()==before and len(project()['events'])==4
    page.locator('#timeline-scroll').evaluate('e=>e.scrollLeft=0');page.evaluate('scrollTo(0,0)')
    x,y=point(chord(0));touch('touchStart',x,y);touch('touchCancel');assert preview_count()==before
    x,y=point(chord(0));touch('touchStart',x,y);page.wait_for_timeout(700);touch('touchEnd')
    assert preview_count()==before and not any(e['id']==rhid for e in project()['events'])
    # Passing-note selection remains selection-only; copy/paste also stays quiet.
    page.evaluate('scrollTo(0,180)');page.locator('.event[data-lane="2"]').tap();assert preview_count()==before
    page.evaluate('scrollTo(0,0)');chord(1).tap();page.wait_for_function('before=>played.filter(n=>n.preview).length===before+3',arg=before)
    before=preview_count();page.locator('#copy').tap();page.locator('#paste').tap();page.locator('#lane-0 .pad[data-start="2"]').tap()
    assert preview_count()==before and project()['events'][-1]['pitches']==[45,52,57]
    # Existing replacement workflow: wheels and Drop never overwrite the block.
    saved_events=project()['events'];page.locator('#wheel-degree').focus();page.keyboard.press('ArrowDown');page.locator('#drop').tap()
    page.wait_for_function('before=>played.filter(n=>n.preview).length===before+3',arg=before)
    assert page.evaluate('played.slice(-3).map(n=>n.pitch)')==[50,53,57]
    assert page.evaluate('played.slice(-3).every(n=>n.duration===1.2)')
    assert project()['events']==saved_events
    page.locator('#stop').tap();page.locator('#instrument').select_option('73');before=preview_count();chord(1).tap()
    page.wait_for_function('before=>played.filter(n=>n.preview).length===before+3',arg=before)
    assert page.evaluate('played.slice(-3).every(n=>n.program===73)')
    assert page.evaluate('played.slice(-3).map(n=>n.pitch)')==[45,52,57]
    assert project()['events']==saved_events
    page.locator('#stop').tap()
    # Simulate input queued around a main-thread stall: no late timer can turn a
    # genuine hold into a short-tap audition.
    before=preview_count();event_id=project()['events'][-1]['id']
    page.evaluate('''id=>{const el=document.querySelector('.event[data-id="'+id+'"]');for(const [type,time] of [['pointerdown',1000],['pointerup',1800]]){const event=new PointerEvent(type,{bubbles:true,button:0,pointerId:101,clientX:150,clientY:450});Object.defineProperty(event,'timeStamp',{value:time});el.dispatchEvent(event);}}''',event_id)
    assert preview_count()==before and not any(e['id']==event_id for e in project()['events'])
    print('PASS: real cold/hot RH/LH touch auditions, latest tap wins, exact stored pitches/current instrument, common immediate onset, short natural release, paused position/data/MIDI unchanged; no preview on resize/scroll/cancel/long-delete/passing selection/copy/paste; Drop and manual replacement workflow preserved.',flush=True)
    # One engine, real graph calibration, and actual RAF/layout. Test native output
    # timestamps first, then simulate a device reporting 80 ms output latency.
    timing=context(viewport={'width':320,'height':740},is_mobile=True,has_touch=True)
    t=timing.new_page();t.goto(URL);t.evaluate(HOOK)
    def load_timing(bpm,meter,bars):
        p=t.evaluate('''([bpm,meter,bars])=>{const p=ChordMidi.fresh();p.bpm=bpm;p.meter=meter;p.bars=bars;p.metronome=true;const per=ChordMidi.stepsPerBar(meter);p.events=[ChordMidi.makeEvent(p,0,0,per),ChordMidi.makeEvent(p,1,0,per),ChordMidi.makeEvent(p,2,per-1,1)];p.events[2].pitches=[90];if(bars>1){const upper=ChordMidi.makeEvent(p,0,per,per);upper.pitches=[72,76,79];upper.builder.octave=5;p.events.push(upper);}return p;}''',[bpm,meter,bars])
        t.locator('#setup').tap();t.once('dialog',lambda d:d.accept());t.locator('#project-file').set_input_files({'name':'timing.json','mimeType':'application/json','buffer':json.dumps(p).encode()});expect(t.locator('#setup-dialog')).to_be_hidden();return p
    def sample_start():
        t.evaluate('''()=>{window.frames=[];window.capture=true;const sample=()=>{if(!capture)return;const draw=engine.lastDraw,clock=draw.clock,stamp=clock.stamp,reported=stamp?.performanceTime>0?stamp.contextTime+(clock.now-stamp.performanceTime)/1000:clock.renderTime-(clock.base||0)-(clock.device||0);frames.push({sourceTime:Math.max(0,Math.min(clock.renderTime,reported)-clock.graph),px:parseFloat(document.getElementById('cursor').style.left)||0,scroll:document.getElementById('timeline-scroll').scrollLeft,running:engine.running,offset:engine.offset,wall:draw.wall,presentedAt:performance.now()});requestAnimationFrame(sample);};requestAnimationFrame(sample);}''')
    summary=[]
    for i,(bpm,meter,bars,cycles) in enumerate([(30,'4/4',1,0),(300,'4/4',4,2),(137,'3/4',1,2),(300,'6/8',1,3),(60,'2/4',1,2)]):
        p=load_timing(bpm,meter,bars)
        t.evaluate('played=[];clicks=[]');t.locator('#play').tap();t.wait_for_function('engine.running')
        if i:
            t.evaluate('window.simulatedOutputDelay=.08')
        graph=t.evaluate('engine.graphLatency');assert 0<graph<.1,graph
        anchor,step,total=t.evaluate('[engine.anchor,engine.stepSeconds,engine.total]')
        sample_start();duration=cycles*total*step+.2 if cycles else .6;t.wait_for_timeout(duration*1000)
        t.evaluate('capture=false');frames=t.evaluate('frames');notes=t.evaluate('played.filter(n=>!n.preview).map(({voices,...n})=>n)');clicks=t.evaluate('clicks')
        assert len(frames)>10
        max_error=0
        intervals=sorted((b['wall']-a['wall'])/1000 for a,b in zip(frames,frames[1:]))
        frame_budget=intervals[len(intervals)//2]
        for f in frames:
            if not f['running']:continue
            expected=max(f['offset'],(f['sourceTime']-anchor)/step)%total*32
            error=abs(f['px']-expected);error=min(error,total*32-error);max_error=max(max_error,error)
            assert error<32/step*frame_budget+1,(bpm,meter,error,f)
        per=int(meter.split('/')[0])*8/int(meter.split('/')[1]);beat=3 if meter=='6/8' else 2
        for click in clicks:
            index=round((click['time']-anchor)/step)
            assert abs(click['time']-(anchor+index*step))<1e-6
            assert index%beat==0 and click['accent']==(index%per==0)
        for note in notes:
            event=next(e for e in p['events'] if note['pitch'] in e['pitches'])
            index=(note['time']-anchor)/step
            assert abs((index-event['start'])%total)<1e-5 or abs((index-event['start'])%total-total)<1e-5
            assert abs(note['duration']-event['duration']*step)<1e-6
            # Only compare onsets already presented; lookahead intentionally queues future ones.
            if frames[0]['sourceTime']<=note['time']<=frames[-1]['sourceTime']:
                nearest=min(frames,key=lambda f:abs(f['sourceTime']-note['time']))
                edge=(index%total)*32;error=abs(nearest['px']-edge);error=min(error,total*32-error)
                assert error<32/step*(2*frame_budget+128/t.evaluate('engine.context.sampleRate'))+1,(bpm,meter,error)
        for old,new in zip(frames,frames[1:]):
            delta=new['scroll']-old['scroll'];progress=max(0,new['sourceTime']-old['sourceTime'])*32/step
            if delta>0:assert delta<=progress+2,(delta,progress)
        assert t.evaluate('k=>JSON.parse(localStorage.getItem(k))',KEY)==p
        summary.append({'bpm':bpm,'meter':meter,'graph_ms':round(graph*1000,3),'max_cursor_error_px':round(max_error,3),'frames':len(frames)});print('SYNC CASE',summary[-1],flush=True)
        t.locator('#play').tap();t.wait_for_function('!engine.running');offset=t.evaluate('engine.offset')
        t.wait_for_timeout(100);assert t.evaluate('engine.position()')==offset
        t.locator('#play').tap();t.wait_for_function('engine.running')
        t.wait_for_timeout(180);assert t.evaluate('engine.position()')>=offset
        if i==1:
            t.screenshot(path='/tmp/chordmidi-v02-320.png')
            # Previewing during playback cannot cut scheduled arrangement sources.
            t.evaluate('window.arrangementVoices=[...engine.sources].filter(v=>v.pitch!==undefined&&!engine.auditionSources.has(v)).map(v=>({source:v.source,stop:v.source.stopCalls.at(-1)}))')
            t.locator('.event[data-lane="1"]').first.tap()
            t.wait_for_function('played.some(n=>n.preview)')
            assert t.evaluate('engine.running && arrangementVoices.length>0 && arrangementVoices.every(v=>v.source.stopCalls.at(-1)===v.stop)')
        t.locator('#bpm').fill('121');t.locator('#bpm').press('Tab');assert t.evaluate('!engine.running && engine.offset===0')
        t.locator('#play').tap()
        try:t.wait_for_function('engine.running',timeout=5000)
        except Exception:
            print('RESTART DEBUG',i,t.locator('#status').inner_text(),t.evaluate('({running:engine.running,generation:engine.generation,state:engine.context.state})'),errors,flush=True);raise
        assert t.evaluate('engine.stepSeconds')==30/121
        t.locator('#stop').tap();assert t.evaluate('!engine.running && engine.position()===0')
    assert not errors,errors;assert not missing,missing
    print('PASS: native/reported output clock, independently measured compressor delay, DOM playhead versus exact source onsets, metronome beat/bar edges, smooth scrolling, multiple loop seams, audible pause/resume, tempo restart and Stop, at 30/60/137/300 BPM and all meters on 320px portrait.',json.dumps(summary),flush=True)
    browser.close()
