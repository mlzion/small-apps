"""v0.4: derived song locks, atomic transposition and mobile persistence."""
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
    locked(False);wheel('key','ArrowDown');wheel('mode','End');assert (project()['key'],project()['mode'])==(1,'Minor')
    # Every lane locks on its first event, and deletion of the final event unlocks.
    for lane in [0,1,2]:
        tap(page.locator(f'#lane-{lane} .pad[data-start="0"]'));locked(True)
        before=project()
        for id in ['key','mode']:
            target=page.locator('#wheel-'+id)
            for key in ['ArrowDown','ArrowUp','Home','End']:wheel(id,key)
            target.dispatch_event('wheel',{'deltaY':120});target.dispatch_event('wheel',{'deltaY':-120})
            target.evaluate('e=>e.scrollIntoView({block:"center"})');box=target.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
            touch('touchStart',x,y);touch('touchMove',x,y-40);touch('touchEnd');target.tap(position={'x':box['width']/2,'y':10},force=True)
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y+40,steps=5);page.mouse.up()
        assert project()==before
        assert page.locator('#wheel-key').evaluate('e=>getComputedStyle(e,"::after").content')!='none'
        page.locator('.event').focus();page.keyboard.press('Delete');locked(False)
    wheel('key','Home');wheel('mode','Home');assert (project()['key'],project()['mode'])==(0,'Major')
    fixture=page.evaluate('''()=>{const p=ChordMidi.fresh();p.mode='Minor';p.program=24;p.instrumentName='Acoustic Guitar (Nylon)';p.builders[0].quality='octave';p.builders[1].inversion=1;
      p.events=[ChordMidi.makeEvent(p,0,0,4),ChordMidi.makeEvent(p,1,1,3),ChordMidi.makeEvent(p,2,2,2)];
      const foreign=ChordMidi.fresh();foreign.key=11;foreign.mode='Major';const e=ChordMidi.makeEvent(foreign,1,6,2);e.pitches=[51,65,74];e.label='Imported custom';p.events.push(e);p.builders[1]=ChordMidi.restoreBuilder(p,e);return p;}''')
    load(fixture);locked(True)
    # Read-only source, signed previews, shortest tritone tie, cancel is inert.
    before=project();open_transpose(6);expect(page.locator('#transpose-current')).to_have_text('C Minor');expect(page.locator('#transpose-preview')).to_contain_text('+6 semitones')
    page.locator('#transpose-direction').select_option('down');expect(page.locator('#transpose-preview')).to_contain_text('−6 semitones' if '−' in page.locator('#transpose-preview').inner_text() else '-6 semitones')
    page.locator('#transpose-key').select_option('0');expect(page.locator('#transpose-preview')).to_contain_text('+0 semitones')
    for width in [320,360,393]:
        page.set_viewport_size({'width':width,'height':740})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        for selector in ['#transpose-dialog','#transpose-key','#transpose-direction','#apply-transpose','#cancel-transpose']:
            box=page.locator(selector).bounding_box();assert box['x']>=0 and box['x']+box['width']<=width
        assert page.locator('#transpose-dialog').evaluate('e=>e.scrollWidth<=e.clientWidth')
        page.screenshot(path=f'/tmp/chordmidi-v04-transpose-{width}.png')
    tap(page.locator('#cancel-transpose'));expect(page.locator('#setup-dialog')).to_be_visible();assert project()==before;tap(page.locator('#close-setup'))
    # Copy remains a literal snapshot; transpose disarms pending Paste.
    tap(page.locator('.event').first);tap(page.locator('#copy'));tap(page.locator('#paste'));before=project()
    open_transpose(2,'up');tap(page.locator('#apply-transpose'));after=project();locked(True)
    assert (after['key'],after['mode'])==(2,'Minor');expect(page.locator('#paste')).to_have_attribute('aria-pressed','false')
    for old,new in zip(before['events'],after['events']):
        assert new['pitches']==[n+2 for n in old['pitches']]
        for k in ['id','lane','start','duration','mode']:assert new[k]==old[k]
    assert after['events'][0]['label'].startswith('D ');assert after['events'][3]['label'].startswith('Stored ')
    assert after['builders'][1]['context']=={'key':1,'mode':'Major'}
    # SF2 audition and Drop use the exact transposed snapshots and selected preset.
    page.evaluate('''()=>{window.notes=[];const note=ChordAudio.prototype.note;ChordAudio.prototype.note=function(pitch,time,duration,program,preview){notes.push({pitch,program,preview});return note.call(this,pitch,time,duration,program,preview);};}''')
    for index in [0,1,3]:
        page.evaluate('notes=[]');tap(page.locator('.event[data-id="'+after['events'][index]['id']+'"]'));page.wait_for_function('n=>notes.length===n',arg=len(after['events'][index]['pitches']))
        assert page.evaluate('notes.map(n=>n.pitch)')==after['events'][index]['pitches'];assert page.evaluate('notes.every(n=>n.program===24&&n.preview)')
        page.evaluate('notes=[]');tap(page.locator('#drop'));page.wait_for_function('n=>notes.length===n',arg=len(after['events'][index]['pitches']));assert page.evaluate('notes.map(n=>n.pitch)')==after['events'][index]['pitches']
        assert project()['events']==after['events'] and project()['key']==2
    tap(page.locator('.event[data-lane="2"]'));assert project()['key']==2;assert project()['events']==after['events']
    # Actual download/load/reload round trip, and unchanged MIDI format/export path.
    tap(page.locator('#setup'))
    with page.expect_download() as dl:tap(page.locator('#save-project'))
    path=dl.value.path();saved=project();assert json.loads(Path(path).read_text())==saved
    with page.expect_download() as dl:tap(page.locator('#export-midi'))
    midi=Path(dl.value.path()).read_bytes();assert midi==bytes(page.evaluate('k=>Array.from(ChordMidi.midi(JSON.parse(localStorage.getItem(k))))',KEY));assert midi[:4]==b'MThd' and int.from_bytes(midi[10:12],'big')==3
    page.once('dialog',lambda d:d.accept());tap(page.locator('#new-project'));locked(False)
    tap(page.locator('#setup'));page.once('dialog',lambda d:d.accept());page.locator('#project-file').set_input_files(path);expect(page.locator('#setup-dialog')).to_be_hidden();assert project()==saved;locked(True)
    page.reload();assert project()==saved;locked(True)
    # A zero transpose leaves every project field untouched.
    before=project();open_transpose(before['key'],'down');tap(page.locator('#apply-transpose'));assert project()==before
    # Register crossings keep extra octave choices and precise spelled dyads.
    edge=page.evaluate("()=>{const p=ChordMidi.fresh();p.key=11;p.builders[0].octave=6;p.builders[0].quality='octave';p.events=[ChordMidi.makeEvent(p,0,0,2)];return p;}")
    load(edge);open_transpose(0,'up');tap(page.locator('#apply-transpose'))
    expect(page.locator('#wheel-octave')).to_have_attribute('aria-valuetext','7');expect(page.locator('#chord-notes')).to_contain_text('C7 – C8')
    assert project()['events'][0]['pitches']==[96,108];page.reload();expect(page.locator('#wheel-octave')).to_have_attribute('aria-valuetext','7')
    open_transpose(11,'down');tap(page.locator('#apply-transpose'));assert project()['events'][0]['pitches']==edge['events'][0]['pitches'];expect(page.locator('#chord-notes')).to_contain_text('B6 – B7')
    # Each isolated lane can also transpose without depending on the other lanes.
    for lane in [0,1,2]:
        isolated=json.loads(json.dumps(fixture));isolated['events']=[fixture['events'][lane]];load(isolated)
        open_transpose(11,'down');tap(page.locator('#apply-transpose'));assert project()['events'][0]['pitches']==[n-1 for n in isolated['events'][0]['pitches']];locked(True)
    # Pitch range rejection blocks the button and also guards direct form submission.
    for pitch,dest,direction in [(127,1,'up'),(0,11,'down')]:
        invalid=json.loads(json.dumps(fixture));invalid['events'][0]['pitches']=[pitch];load(invalid);before=project();open_transpose(dest,direction)
        expect(page.locator('#apply-transpose')).to_be_disabled();expect(page.locator('#transpose-error')).to_contain_text('outside 0–127')
        page.locator('#transpose-form').dispatch_event('submit');assert project()==before
        tap(page.locator('#cancel-transpose'));tap(page.locator('#close-setup'))
    # Clipboard snapshot behavior is covered by existing copy/paste regressions.
    assert not errors,errors;assert not missing,missing
    print('PASS: first/last event locks in all lanes; blocked keyboard/wheel/mouse/touch; empty song edits; signed transpose previews, tritone tie, cancel/zero no-op, atomic Apply, frozen IDs/timing/modes, foreign/custom/octave contexts, real SF2 tap/Drop, range rejection, JSON/download/load/reload/MIDI, portrait 320/360/393.')
    browser.close()
