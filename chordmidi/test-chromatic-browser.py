"""PR #41 addendum: chromatic roots, scale colors, compatibility and editing."""
import json, os
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
URL='https://app-lab.test/small-apps/chordmidi/'
KEY='app-lab-chordmidi-v1'
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
    errors=[];missing=[]
    def serve(route):
        path=unquote(urlsplit(route.request.url).path).removeprefix('/small-apps')
        file=(ROOT/path.lstrip('/')).resolve()
        if not file.is_relative_to(ROOT):return route.fulfill(status=403)
        if file.is_dir():file/='index.html'
        if not file.is_file():missing.append(path);return route.fulfill(status=404)
        route.fulfill(path=str(file),content_type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.sf2':'application/octet-stream','.svg':'image/svg+xml'}.get(file.suffix,'text/plain'))
    c=browser.new_context(viewport={'width':320,'height':740},is_mobile=True,has_touch=True)
    c.route('https://app-lab.test/**',serve);c.on('weberror',lambda e:errors.append(str(e.error)))
    page=c.new_page();page.goto(URL);cdp=c.new_cdp_session(page)
    def project():return page.evaluate('k=>JSON.parse(localStorage.getItem(k))',KEY)
    def load(p):
        page.evaluate('([k,p])=>localStorage.setItem(k,JSON.stringify(p))',[KEY,p]);page.reload()
    def tap(target):target.evaluate('e=>e.scrollIntoView({block:"center",inline:"center"})');target.tap()
    def wheel(id,key):page.locator('#wheel-'+id).focus();page.keyboard.press(key)
    def locked(value):
        for id in ['key','mode']:
            expect(page.locator('#wheel-'+id)).to_have_attribute('aria-disabled',str(value).lower())
            expect(page.locator('#wheel-'+id)).to_have_attribute('aria-readonly',str(value).lower())
        assert page.locator('#transpose').is_disabled()==(not value)
    def open_transpose(dest=None,direction='shortest'):
        tap(page.locator('#setup'));tap(page.locator('#transpose'))
        if dest is not None:page.locator('#transpose-key').select_option(str(dest))
        page.locator('#transpose-direction').select_option(direction)
    def touch(kind,x=0,y=0):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind=='touchEnd' else [{'x':x,'y':y,'id':1}]})
    # Exhaust all chromatic positions in several song keys and both modes/hands.
    checks=0
    for key in [0,2,5,9]:
        for mode in ['Major','Minor']:
            fixture=page.evaluate('([key,mode])=>{const p=ChordMidi.fresh();p.key=key;p.mode=mode;p.builders.forEach(b=>b.quality="major");return p;}',[key,mode]);load(fixture)
            for hand in ['rh','lh']:
                tap(page.locator('#'+hand));wheel('degree','Home')
                for offset in range(12):
                    if offset:wheel('degree','ArrowDown')
                    expect(page.locator('#wheel-degree')).to_have_attribute('aria-valuenow',str(offset))
                    assert page.locator('#wheel-degree .wheel-option').count()==3
                    current=project();b=current['builders'][0 if hand=='rh' else 1]
                    assert b['rootOffset']==offset
                    assert (current['key'],current['mode'])==(key,mode)
                    for option in page.locator('#wheel-degree .wheel-option').all():
                        pc=int(option.get_attribute('data-pc'));expected=(pc-key+12)%12 in page.evaluate('mode=>ChordMidi.scales[mode]',mode)
                        assert ('in-scale' in option.get_attribute('class'))==expected
                        assert ('out-of-scale' in option.get_attribute('class'))==(not expected)
                    assert page.evaluate('b=>ChordMidi.builderChord(JSON.parse(localStorage.getItem("app-lab-chordmidi-v1")),b).pitches[0]',b)==12*(b['octave']+1)+key+offset
                    checks+=1
    def block(event):return page.locator('.event[data-id="'+event['id']+'"]')
    def check_blocks(expected_project):
        scale=[(expected_project['key']+n)%12 for n in page.evaluate('mode=>ChordMidi.scales[mode]',expected_project['mode'])]
        for event in expected_project['events']:
            borrowed=False
            if event['lane']<2:
                offset=event['builder'].get('rootOffset',page.evaluate('([mode,degree])=>ChordMidi.scales[mode][degree]',[event['mode'],event['builder']['degree']]))
                borrowed=(event['key']+offset)%12 not in scale
            assert ('borrowed' in block(event).get_attribute('class'))==borrowed
            background=block(event).evaluate('e=>getComputedStyle(e).backgroundImage')
            if borrowed:assert '98, 97, 110' in background and '66, 65, 78' in background
            elif event['lane']==0:assert '171, 54, 219' in background
            elif event['lane']==1:assert '50, 125, 224' in background
            else:assert '114, 238, 141' in background
    # Every root in both hands, multiple song scales, inverted/custom pitches,
    # foreign original contexts, legacy degrees and a chromatic passing note.
    for key in [0,2,5,9]:
        for mode in ['Major','Minor']:
            fixture=page.evaluate("""([key,mode])=>{
                const p=ChordMidi.fresh();p.key=key;p.mode=mode;
                for(let lane=0;lane<2;lane++)for(let rootOffset=0;rootOffset<12;rootOffset++){
                    Object.assign(p.builders[lane],{rootOffset,quality:'major',inversion:1});
                    const e=ChordMidi.makeEvent(p,lane,rootOffset,1);
                    // Force bass/individual notes to disagree with root classification.
                    if(!ChordMidi.scales[mode].includes(rootOffset))e.pitches=[60+key];
                    p.events.push(e);
                }
                const old=ChordMidi.fresh();old.key=(key+1)%12;old.builders[0].degree=4;
                const legacy=ChordMidi.makeEvent(old,0,14);legacy.pitches=[60+key];p.events.push(legacy);
                const note=ChordMidi.makeEvent(p,2,13);note.pitches=[60+(key+1)%12];p.events.push(note);
                return p;
            }""",[key,mode]);load(fixture);check_blocks(fixture)
            baseline=page.evaluate('k=>Array.from(ChordMidi.midi(JSON.parse(localStorage.getItem(k))))',KEY)
            event=next(e for e in fixture['events'] if e['lane']==0 and 'borrowed' in block(e).get_attribute('class'))
            tap(block(event));expect(block(event)).to_have_class('event selected borrowed')
            assert block(event).evaluate('e=>getComputedStyle(e).outlineStyle')=='solid'
            assert block(event).evaluate('e=>getComputedStyle(e).outlineColor')=='rgb(255, 255, 255)'
            check_blocks(project());assert project()['events']==fixture['events']
            assert page.evaluate('k=>Array.from(ChordMidi.midi(JSON.parse(localStorage.getItem(k))))',KEY)==baseline
            # A normal edit still works with the gray class and selected outline.
            block(event).focus();page.keyboard.press('Shift+ArrowRight');assert next(e for e in project()['events'] if e['id']==event['id'])['duration']==2
            check_blocks(project());before_transpose=project();open_transpose((key+2)%12,'up');tap(page.locator('#apply-transpose'));transposed=project();check_blocks(transposed)
            for old,new in zip(before_transpose['events'],transposed['events']):assert new['pitches']==[n+2 for n in old['pitches']]
            page.reload();check_blocks(project())
    # Legacy serialized degree 4 is G (offset 7), not chromatic E.
    legacy=page.evaluate('()=>{const p=ChordMidi.fresh();p.builders[0].degree=4;p.events=[ChordMidi.makeEvent(p,0,0,2)];return p;}');load(legacy)
    expect(page.locator('#wheel-degree')).to_have_attribute('aria-valuenow','7');assert project()['events'][0]['pitches']==[67,71,74]
    tap(page.locator('.event'));assert project()['builders'][0]['degree']==4;assert 'rootOffset' not in project()['builders'][0]
    # A chromatic root with a scale-derived quality waits for an explicit choice.
    wheel('degree','Home');wheel('degree','ArrowDown');expect(page.locator('#drop')).to_be_disabled();expect(page.locator('#chord-name')).to_contain_text('Choose an explicit quality')
    expect(page.locator('#wheel-quality .selected')).to_have_attribute('aria-disabled','true')
    before=project()['events'];tap(page.locator('#lane-0 .pad[data-start="4"]'));assert project()['events']==before;expect(page.locator('#status')).to_contain_text('explicit')
    page.locator('#note-source').select_option('chord');expect(page.locator('#passing-note')).to_be_disabled();tap(page.locator('#lane-2 .pad[data-start="4"]'));assert project()['events']==before
    page.reload();expect(page.locator('#drop')).to_be_disabled();locked(True)
    # Transpose remains usable while an unplaced chromatic preview awaits quality.
    open_transpose(2);tap(page.locator('#apply-transpose'));assert project()['events'][0]['pitches']==[69,73,76];expect(page.locator('#drop')).to_be_disabled()
    # Home skips unavailable qualities, explicitly choosing the first valid quality.
    wheel('quality','Home');assert project()['builders'][0]['quality']=='fifth';expect(page.locator('#drop')).to_be_enabled();expect(page.locator('#passing-note')).to_be_enabled()
    # New borrowed iv and bVI, inversion and independent hand settings via real UI.
    load(page.evaluate('()=>ChordMidi.fresh()'))
    def quality(id):
        wheel('quality','Home')
        for _ in range(page.evaluate('id=>ChordMidi.qualities.findIndex(q=>q.id===id)',id)):wheel('quality','ArrowDown')
    quality('minor');wheel('degree','Home')
    for _ in range(5):wheel('degree','ArrowDown')
    wheel('inversion','ArrowDown');tap(page.locator('#lane-0 .pad[data-start="2"]'));rh=project()['events'][-1];assert rh['pitches']==[68,72,77] and rh['label']=='F Minor'
    tap(page.locator('#lh'));quality('major');wheel('degree','Home')
    for _ in range(8):wheel('degree','ArrowDown')
    tap(page.locator('#lane-1 .pad[data-start="2"]'));lh=project()['events'][-1];assert lh['pitches']==[56,60,63] and lh['label']=='A♭ Major'
    check_blocks(project())
    assert 'borrowed' not in block(rh).get_attribute('class')  # F minor: Ab does not make its F root chromatic.
    assert 'borrowed' in block(lh).get_attribute('class')
    tap(page.locator('#rh'));expect(page.locator('#wheel-degree')).to_have_attribute('aria-valuenow','5');assert project()['builders'][0]['inversion']==1
    # Center selection is clear on both blue scale roots and gray non-scale roots.
    for width in [320,360,393]:
        page.set_viewport_size({'width':width,'height':800})
        tap(page.locator('#rh'));blue=page.locator('#wheel-degree .selected').evaluate('e=>getComputedStyle(e).backgroundImage');page.screenshot(path=f'/tmp/chordmidi-chromatic-blue-{width}.png',full_page=True)
        tap(page.locator('#lh'));gray=page.locator('#wheel-degree .selected').evaluate('e=>getComputedStyle(e).backgroundImage');assert blue!=gray
        assert page.locator('#wheel-degree .selected').evaluate('e=>e.scrollWidth<=e.clientWidth')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=f'/tmp/chordmidi-chromatic-gray-{width}.png',full_page=True)
    page.locator('#instrument').select_option('24')
    page.evaluate('''()=>{window.notes=[];const note=ChordAudio.prototype.note;ChordAudio.prototype.note=function(pitch,time,duration,program,preview){notes.push({pitch,time,duration,program,preview});return note.call(this,pitch,time,duration,program,preview);};}''')
    for event in [rh,lh,rh,lh]:
        page.evaluate('notes=[]');tap(page.locator('.event[data-id="'+event['id']+'"]'));page.wait_for_function('notes.length===3');assert page.evaluate('notes.map(n=>n.pitch)')==event['pitches'];assert page.evaluate('notes.every(n=>n.program===24&&n.preview)')
        page.evaluate('notes=[]');tap(page.locator('#drop'));page.wait_for_function('notes.length===3');assert page.evaluate('notes.map(n=>n.pitch)')==event['pitches']
    page.locator('#note-source').select_option('chord');page.locator('#passing-note').select_option('1');tap(page.locator('#lane-2 .pad[data-start="3"]'));assert project()['events'][-1]['pitches']==[72]
    # Simultaneous RH/LH and passing-note arrangement playback uses frozen notes.
    page.evaluate('notes=[]');tap(page.locator('#play'));page.wait_for_function('notes.filter(n=>!n.preview).length>=7');assert sorted(page.evaluate('notes.filter(n=>!n.preview).slice(0,7).map(n=>n.pitch)'))==sorted([68,72,77,56,60,63,72]);tap(page.locator('#stop'))
    before=project();open_transpose(2,'up');tap(page.locator('#apply-transpose'));after=project()
    for old,new in zip(before['events'],after['events']):assert new['pitches']==[p+2 for p in old['pitches']];assert new['id']==old['id'];assert new['start']==old['start'];assert new['duration']==old['duration']
    assert after['events'][0]['label']=='G Minor' and after['events'][1]['label']=='B♭ Major';check_blocks(after)
    # Context-specific stored chords still use song-scale colors, not a foreign scale.
    foreign=page.evaluate('()=>{const p=ChordMidi.fresh();p.key=2;p.mode="Minor";p.builders[0].rootOffset=1;p.builders[0].quality="major";return ChordMidi.makeEvent(p,0,6);}');after['events'].append(foreign);load(after);tap(page.locator('.event[data-id="'+foreign['id']+'"]'));expect(page.locator('#builder-context')).to_contain_text('Builder D Minor')
    for option in page.locator('#wheel-degree .wheel-option').all():
        pc=int(option.get_attribute('data-pc'));assert ('in-scale' in option.get_attribute('class'))==((pc-2+12)%12 in [0,2,4,5,7,9,11])
    assert project()['mode']=='Major'
    # Actual JSON/MIDI downloads, load and reload preserve new and legacy settings.
    tap(page.locator('#setup'))
    with page.expect_download() as dl:tap(page.locator('#save-project'))
    path=dl.value.path();saved=project();assert json.loads(Path(path).read_text())==saved
    with page.expect_download() as dl:tap(page.locator('#export-midi'))
    data=Path(dl.value.path()).read_bytes();assert data==bytes(page.evaluate('k=>Array.from(ChordMidi.midi(JSON.parse(localStorage.getItem(k))))',KEY));assert int.from_bytes(data[10:12],'big')==3
    page.once('dialog',lambda d:d.accept());tap(page.locator('#new-project'));tap(page.locator('#setup'));page.once('dialog',lambda d:d.accept());page.locator('#project-file').set_input_files(path);expect(page.locator('#setup-dialog')).to_be_hidden();assert project()==saved
    page.reload();assert project()==saved;locked(True);check_blocks(saved)
    assert not errors,errors;assert not missing,missing
    print(f'PASS: {checks} UI root/hand cases across multiple keys/modes, exact blue/gray song-scale colors and gray RH/LH blocks from stored roots after transpose/load, selection/editing, unavailable-quality guards and recovery, legacy degree selection, locked song settings, borrowed chords/inversions, SF2 tap/Drop/all-lane playback, transposition, foreign contexts, JSON/MIDI/load/reload and 320/360/393 px visual checks.')
    browser.close()
