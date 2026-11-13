"""Physical-test regressions: timestamp jitter and foreign-key selection."""
import json, os
from pathlib import Path
from urllib.parse import unquote,urlsplit
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
URL='https://app-lab.test/small-apps/chordmidi/'
KEY='app-lab-chordmidi-v1'
HOOK='''()=>{window.played=[];const init=ChordAudio.prototype.init,note=ChordAudio.prototype.note;ChordAudio.prototype.init=function(...args){window.engine=this;return init.apply(this,args);};ChordAudio.prototype.note=function(pitch,time,duration,program,preview=false){played.push({pitch,time,duration,program,preview});return note.call(this,pitch,time,duration,program,preview);};}'''
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
    def context():
        c=browser.new_context(viewport={'width':320,'height':740},is_mobile=True,has_touch=True);c.route('https://app-lab.test/**',serve);c.on('weberror',lambda e:errors.append(str(e.error)));return c
    c=context();page=c.new_page();page.goto(URL)
    fixture=page.evaluate('''()=>{
      const p=ChordMidi.fresh();p.key=7;p.mode='Major';p.bpm=300;p.program=24;p.instrumentName='Acoustic Guitar (Nylon)';
      const make=(key,mode,lane,start,quality='diatonic',degree=0)=>{const s=ChordMidi.fresh();s.key=key;s.mode=mode;s.builders[lane].quality=quality;s.builders[lane].degree=degree;return ChordMidi.makeEvent(s,lane,start,1);};
      p.events=[make(0,'Major',0,0),make(2,'Minor',1,0),make(7,'Major',0,2),make(7,'Minor',0,4),make(1,'Major',0,6,'octave',6),make(9,'Minor',0,8)];
      p.events[5].pitches=[61,68,76];p.events[5].label='Imported voicing';
      const s=ChordMidi.fresh();s.key=2;s.mode='Minor';s.passing.index=2;p.events.push(ChordMidi.makeEvent(s,2,0));
      s.key=1;s.mode='Major';s.passing.source='chord';s.passing.index=1;s.builders[0].degree=6;s.builders[0].quality='octave';p.events.push(ChordMidi.makeEvent(s,2,2));const customNote=structuredClone(p.events[6]);customNote.id=crypto.randomUUID();customNote.start=4;customNote.pitches=[126];customNote.label='F♯9';p.events.push(customNote);return p;
    }''')
    page.evaluate('([k,p])=>localStorage.setItem(k,JSON.stringify(p))',[KEY,fixture]);page.reload();page.evaluate(HOOK)
    def project():return page.evaluate('k=>JSON.parse(localStorage.getItem(k))',KEY)
    def tap(target):target.evaluate('e=>e.scrollIntoView({block:"center",inline:"center"})');target.tap()
    def wheel(id,key):page.locator('#wheel-'+id).focus();page.keyboard.press(key)
    def song(key=7,mode='Major'):
        p=project();assert (p['key'],p['mode'])==(key,mode)
        expect(page.locator('#wheel-key')).to_have_attribute('aria-valuenow',str(key));expect(page.locator('#wheel-mode')).to_have_attribute('aria-valuetext',mode)
    events=json.loads(json.dumps(fixture['events']))
    baseline_midi=page.evaluate('k=>Array.from(ChordMidi.midi(JSON.parse(localStorage.getItem(k))))',KEY)
    for index in [0,1,2,3,4,5,1,0,3,5]:
        event=events[index];before=page.evaluate('played.length');tap(page.locator('.event[data-id="'+event['id']+'"]'))
        page.wait_for_function('([n,count])=>played.length===n+count',arg=[before,len(event['pitches'])])
        assert page.evaluate('n=>played.slice(n).map(e=>e.pitch)',before)==event['pitches']
        assert page.evaluate('n=>played.slice(n).every(e=>e.preview&&e.program===24)',before)
        song();assert project()['events']==events
        b=project()['builders'][event['lane']];assert all(b[k]==event['builder'][k] for k in ['degree','quality','inversion','octave'])
        if event['key']!=7 or event['mode']!='Major':expect(page.locator('#builder-context')).to_contain_text('Song G Major')
        if index==2:assert 'context' not in b
        if index==3:expect(page.locator('#chord-name')).to_contain_text('G minor')
        if index==4:expect(page.locator('#chord-notes')).to_contain_text('B♯4 – B♯5');expect(page.locator('#wheel-inversion')).to_have_attribute('aria-valuemax','0')
        if index==5:expect(page.locator('#builder-context')).to_contain_text('Stored voicing');expect(page.locator('#chord-notes')).to_contain_text('61, 68, 76')
    # Passing notes restore a local note/source context, never the song key/mode.
    for index in [6,7,8]:
        before=page.evaluate('played.length');event=events[index];tap(page.locator('.event[data-id="'+event['id']+'"]'))
        assert page.evaluate('played.length')==before;song();assert project()['events']==events
        expected='F4' if index==6 else 'B♯5' if index==7 else 'Stored F♯9'
        expect(page.locator('#passing-note option:checked')).to_have_text(expected)
        if index==8:
            page.locator('#passing-note').select_option('0');expect(page.locator('#passing-note option[value=stored]')).to_have_count(0);assert 'voicing' not in project()['passing'];song();assert project()['events']==events
    assert page.evaluate('k=>Array.from(ChordMidi.midi(JSON.parse(localStorage.getItem(k))))',KEY)==baseline_midi
    # A custom voicing stays authoritative for Drop; copy/paste and wheel edits
    # still require deliberate delete/place for replacing the original block.
    custom=events[5];tap(page.locator('.event[data-id="'+custom['id']+'"]'));page.wait_for_timeout(30)
    page.evaluate('played=[]');tap(page.locator('#drop'));page.wait_for_function('played.length===3');assert page.evaluate('played.map(n=>n.pitch)')==[61,68,76];song()
    tap(page.locator('#copy'));tap(page.locator('#paste'));tap(page.locator('#lane-0 .pad[data-start="10"]'))
    assert project()['events'][-1]['pitches']==[61,68,76];assert (project()['events'][-1]['key'],project()['events'][-1]['mode'])==(9,'Minor')
    before_edit=project()['events'];wheel('degree','ArrowDown');page.evaluate('played=[]');tap(page.locator('#drop'));page.wait_for_function('played.length===3')
    assert page.evaluate('played.map(n=>n.pitch)')==[71,74,77];assert project()['events']==before_edit;song()
    # Native touch long press deletes only the requested original, without preview.
    target=page.locator('.event[data-id="'+custom['id']+'"]');target.evaluate('e=>e.scrollIntoView({block:"center",inline:"center"})');box=target.bounding_box();x=box['x']+5;y=box['y']+20
    cdp=c.new_cdp_session(page);before=page.evaluate('played.length')
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]});page.wait_for_timeout(700);cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert not any(e['id']==custom['id'] for e in project()['events']);assert page.evaluate('played.length')==before
    tap(page.locator('#lane-0 .pad[data-start="8"]'));replacement=project()['events'][-1]
    assert replacement['pitches']==[71,74,77] and (replacement['key'],replacement['mode'])==(9,'Minor');song()
    # Builder context is optional, persists across save/load, and is not confused
    # with the global song settings or written into MIDI note events.
    tap(page.locator('#setup'))
    with page.expect_download() as dl:page.locator('#save-project').tap()
    path=dl.value.path();saved=project();assert json.loads(Path(path).read_text())==saved
    with page.expect_download() as dl:page.locator('#export-midi').tap()
    exported=Path(dl.value.path()).read_bytes();assert exported==bytes(page.evaluate('k=>Array.from(ChordMidi.midi(JSON.parse(localStorage.getItem(k))))',KEY))
    page.once('dialog',lambda d:d.accept());page.locator('#new-project').tap();tap(page.locator('#setup'));page.once('dialog',lambda d:d.accept());page.locator('#project-file').set_input_files(path);expect(page.locator('#setup-dialog')).to_be_hidden()
    assert project()==saved;page.reload();page.evaluate(HOOK);song();expect(page.locator('#builder-context')).to_contain_text('Builder A Minor')
    tap(page.locator('#drop'));page.wait_for_function('played.length===3');assert page.evaluate('played.map(n=>n.pitch)')==[71,74,77]
    # Deliberate song-wheel changes keep the old non-transposing behavior; they
    # remove local editor contexts but never clear or transpose arranged events.
    before_key_change=project()['events'];wheel('key','ArrowDown');wheel('mode','End');song(8,'Minor')
    assert project()['events']==before_key_change
    assert all('context' not in b and 'voicing' not in b for b in project()['builders']);assert 'context' not in project()['passing']
    tap(page.locator('.event[data-id="'+events[0]['id']+'"]'));song(8,'Minor');assert project()['events']==before_key_change
    for width in [320,360,393]:
        page.set_viewport_size({'width':width,'height':800});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path='/tmp/chordmidi-v03-context-393.png',full_page=True)
    print('PASS: same/foreign key and mode, rapid RH/LH audition, exact stored pitches, passing-note contexts, global wheels unchanged, custom voicing warning/Drop, copy/paste/manual replacement, persistent builder context, JSON/MIDI and deliberate non-transposing Key/Mode edits on narrow portrait.',flush=True)
    # Real SF2 arrangement with intentionally bouncing timestamp estimates. The
    # true output offset is fixed; only the browser's estimate is perturbed.
    jitter=context();jp=jitter.new_page();jp.goto(URL)
    p=jp.evaluate('''()=>{const p=ChordMidi.fresh();p.bpm=300;p.bars=4;p.metronome=true;p.events=[ChordMidi.makeEvent(p,0,0,8),ChordMidi.makeEvent(p,1,8,8)];return p;}''')
    jp.evaluate('([k,p])=>localStorage.setItem(k,JSON.stringify(p))',[KEY,p]);jp.reload()
    jp.evaluate('''()=>{window.sourceNotes=[];const init=ChordAudio.prototype.init,note=ChordAudio.prototype.note,pos=ChordAudio.prototype.position;ChordAudio.prototype.init=async function(...args){window.engine=this;await init.apply(this,args);if(!this.jitterHook){this.jitterHook=true;const c=this.context,noise=()=>[0,.03,-.03,.015,-.015][Math.floor(c.currentTime*60)%5];c.getOutputTimestamp=()=>{if(window.fallbackClock)throw Error('fallback test');const time=c.currentTime-.08+noise();window.rawObserved=time;return{contextTime:time,performanceTime:performance.now()};};Object.defineProperty(c,'baseLatency',{get:()=>.01});Object.defineProperty(c,'outputLatency',{get:()=>{const latency=.07-noise();window.rawObserved=c.currentTime-.01-latency;return latency;}});}};ChordAudio.prototype.note=function(...args){sourceNotes.push({pitch:args[0],time:args[1],duration:args[2]});return note.apply(this,args);};ChordAudio.prototype.position=function(...args){const value=pos.apply(this,args);if(this.running)this.draw={render:this.outputClock.render,raw:rawObserved-this.graphLatency};return value;};}''')
    stats=[]
    for fallback in [False,True]:
        jp.evaluate('value=>window.fallbackClock=value',fallback);jp.evaluate('sourceNotes=[]');jp.locator('#play').tap();jp.wait_for_function('engine.running')
        jp.evaluate('''()=>{window.frames=[];window.capture=true;const sample=()=>{if(!capture)return;const d=engine.draw;frames.push({x:parseFloat(document.getElementById('cursor').style.left)||0,scroll:document.getElementById('timeline-scroll').scrollLeft,render:d.render,raw:d.raw,graph:engine.graphLatency,anchor:engine.anchor,step:engine.stepSeconds,total:engine.total});requestAnimationFrame(sample);};requestAnimationFrame(sample);}''')
        jp.wait_for_timeout(6700);jp.evaluate('capture=false');frames=jp.evaluate('frames')
        reversals=0;phase_errors=[];raw_reversals=0
        for old,new in zip(frames,frames[1:]):
            if new['raw']<old['raw']:raw_reversals+=1
            if new['x']<old['x']-.001:
                reversals+=1;assert old['x']>old['total']*32-20 and new['x']<20,'Backward bounce away from a loop seam'
            if new['scroll']<old['scroll']-.001:assert new['x']<20,'Backward auto-scroll without a loop'
            if new['scroll']>old['scroll']:assert new['scroll']-old['scroll']<max(20,(new['render']-old['render'])*32/new['step']*1.2+2)
        for f in frames:
            expected=max(0,(max(0,f['render']-.08-f['graph'])-f['anchor'])/f['step'])%f['total']*32
            error=abs(f['x']-expected);phase_errors.append(min(error,f['total']*32-error)*f['step']/32)
        assert raw_reversals>5 and reversals>=1,(raw_reversals,reversals)
        assert max(phase_errors)<.035 and sum(phase_errors)/len(phase_errors)<.012,phase_errors
        for n in jp.evaluate('sourceNotes'):
            offset=round((n['time']-frames[0]['anchor'])/frames[0]['step'])
            assert abs(n['time']-(frames[0]['anchor']+offset*frames[0]['step']))<1e-6,(fallback,n,frames[0]['anchor'])
        stats.append({'fallback':fallback,'raw_reversals':raw_reversals,'legitimate_loops':reversals,'mean_phase_ms':round(sum(phase_errors)/len(phase_errors)*1000,3),'max_phase_ms':round(max(phase_errors)*1000,3)});print('JITTER CASE',stats[-1],flush=True)
        jp.locator('#play').tap();frozen=jp.evaluate('engine.offset');jp.wait_for_timeout(100);assert jp.evaluate('engine.position()')==frozen
        jp.locator('#play').tap();jp.wait_for_function('engine.running');jp.wait_for_timeout(150);jp.locator('#rewind').tap();assert jp.evaluate('engine.offset')==0
        jp.locator('#bpm').fill('137');jp.locator('#bpm').press('Tab');assert jp.evaluate('!engine.running&&engine.offset===0')
        jp.locator('#play').tap();jp.wait_for_function('engine.running');jp.wait_for_timeout(300);jp.locator('#stop').tap();assert jp.evaluate('engine.position()')==0
        # Restore 300 BPM for the second clock path.
        jp.locator('#bpm').fill('300');jp.locator('#bpm').press('Tab')
    assert not errors,errors;assert not missing,missing
    print('PASS: real audio with simulated output-timestamp and fallback jitter; no cursor/scroll bounce, legitimate loops, bounded non-drifting beat/onset phase, pause/resume/rewind/Stop/tempo. '+json.dumps(stats),flush=True)
    browser.close()
