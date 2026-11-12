"""Instrument library acceptance checks: python chordmidi/test-instruments-browser.py."""
import json, os
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
PROJECT_KEY = 'app-lab-chordmidi-v1'
LIBRARY_KEY = 'app-lab-chordmidi-instruments-v1'
URL = 'https://app-lab.test/small-apps/chordmidi/'
CATEGORIES = [('Pianos', 1), ('Chromatic Percussion', 9), ('Organs', 17), ('Guitars', 25), ('Strings', 41), ('Ensembles', 49), ('Brass', 57), ('Reeds', 65), ('Pipes', 73), ('Synth Pads', 89), ('Ethnic Instruments', 105), ('Percussive Instruments', 113)]
DEFAULTS = [0, 4, 6, 11, 13, 14, 16, 19, 22, 24, 25, 26, 45, 46, 48, 50, 52, 56, 60, 61, 65, 69, 73, 89, 114]

def read_midi(data):
    assert data[:4] == b'MThd' and int.from_bytes(data[8:10], 'big') == 1
    assert int.from_bytes(data[10:12], 'big') == 3 and int.from_bytes(data[12:14], 'big') == 480
    offset = 14
    tracks = []
    def vlq():
        nonlocal offset
        n = 0
        while True:
            v = data[offset]; offset += 1; n = n * 128 + (v & 127)
            if not v & 128: return n
    for lane in range(3):
        assert data[offset:offset+4] == b'MTrk'
        end = offset + 8 + int.from_bytes(data[offset+4:offset+8], 'big')
        offset += 8; tick = 0; events = []
        while offset < end:
            tick += vlq(); status = data[offset]; offset += 1
            if status == 255:
                kind = data[offset]; offset += 1; size = vlq()
                payload = data[offset:offset+size]; offset += size
                events.append((tick, 'meta', kind, payload))
            else:
                assert status & 128, 'Unexpected running status'
                size = 1 if status & 240 in (192, 208) else 2
                payload = data[offset:offset+size]; offset += size
                events.append((tick, 'channel', status, payload))
        assert tick == 1920
        tracks.append(events)
    assert offset == len(data)
    return tracks

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--autoplay-policy=document-user-activation-required'])
    errors, missing = [], []
    def serve(route):
        path = unquote(urlsplit(route.request.url).path)
        if path.startswith('/small-apps/'): path = path[len('/small-apps'):]
        file = (ROOT / path.lstrip('/')).resolve()
        if not file.is_relative_to(ROOT): return route.fulfill(status=403)
        if file.is_dir(): file /= 'index.html'
        if not file.is_file(): missing.append(path); return route.fulfill(status=404)
        mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.sf2': 'application/octet-stream'}
        route.fulfill(path=str(file), content_type=mime.get(file.suffix, 'text/plain'))
    def context(**kwargs):
        c = browser.new_context(**kwargs); c.route('https://app-lab.test/**', serve)
        c.on('weberror', lambda e: errors.append(str(e.error))); return c
    c = context(viewport={'width': 320, 'height': 740}, is_mobile=True, has_touch=True)
    page = c.new_page(); page.goto(URL)
    def project(): return page.evaluate('key=>JSON.parse(localStorage.getItem(key))', PROJECT_KEY)
    def enabled(): return page.locator('.instrument-choice input:checked').evaluate_all('els=>els.map(e=>+e.value)')
    def choices(): return page.locator('#instrument option').evaluate_all('els=>els.map(e=>+e.value)')
    def open_setup():
        page.locator('#setup').tap()
        if not page.locator('#instrument-settings').evaluate('e=>e.open'):
            page.locator('#instrument-settings > summary').tap()
    def checkbox(program, value):
        category = page.locator('.instrument-category').filter(has=page.locator('#instrument-'+str(program)))
        if not category.evaluate('e=>e.open'): category.locator('summary').tap()
        target = page.locator('#instrument-'+str(program))
        if target.is_checked() != value: target.tap()
        expect(target).to_be_checked(checked=value)
    def close_setup(): page.locator('#close-setup').tap()
    def unchanged(p):
        return {key: value for key, value in p.items() if key not in ('program', 'instrumentName')}
    assert choices() == DEFAULTS
    # Keep real progression data throughout library and instrument changes.
    fixture = page.evaluate('''()=>{const p=ChordMidi.fresh();p.bars=1;p.bpm=300;p.loop=false;p.events=[ChordMidi.makeEvent(p,0,0,4),ChordMidi.makeEvent(p,1,0,8),ChordMidi.makeEvent(p,2,2,1)];p.events[2].pitches=[74];p.events[2].label='D5';return p;}''')
    page.evaluate('([key,p])=>localStorage.setItem(key,JSON.stringify(p))', [PROJECT_KEY, fixture]); page.reload()
    open_setup()
    expect(page.locator('.instrument-category')).to_have_count(12)
    expect(page.locator('.instrument-choice input')).to_have_count(96)
    assert enabled() == DEFAULTS
    expect(page.locator('#enabled-count')).to_have_text('25 enabled')
    for i, (name, start) in enumerate(CATEGORIES):
        category = page.locator('.instrument-category').nth(i)
        expect(category.locator('.category-name')).to_have_text(name)
        category.locator('summary').tap()
        assert category.locator('input').evaluate_all('els=>els.map(e=>+e.value)') == list(range(start-1, start+7))
        assert category.locator('input:checked').count() == sum(p in DEFAULTS for p in range(start-1, start+7))
        for row in category.locator('.instrument-choice').all():
            assert row.bounding_box()['height'] >= 44
        category.locator('summary').tap()
    for name in ['Basses', 'Synth Leads', 'Synth Effects', 'Sound Effects']:
        expect(page.locator('.category-name').filter(has_text=name)).to_have_count(0)
    for start in [32, 80, 96, 120]:
        for program in range(start, start+8): expect(page.locator('#instrument-'+str(program))).to_have_count(0)
    checkbox(1, True)
    assert choices() == sorted(DEFAULTS + [1])
    expect(page.locator('#enabled-count')).to_have_text('26 enabled')
    close_setup(); page.locator('#instrument').select_option('1')
    assert project()['program'] == 1 and project()['instrumentName'] == 'Bright Acoustic Piano'
    assert unchanged(project()) == unchanged(fixture)
    # Removing the active preview falls back to the lowest enabled GM program.
    open_setup(); checkbox(1, False)
    assert choices() == DEFAULTS and project()['program'] == 0
    assert project()['instrumentName'] == 'Acoustic Grand Piano'
    checkbox(1, True); checkbox(0, False); close_setup(); page.reload()
    custom = sorted([p for p in DEFAULTS if p != 0] + [1])
    assert choices() == custom and project()['program'] == 1
    open_setup(); assert enabled() == custom
    # Preferences survive New Project and a separate browser context/session.
    page.once('dialog', lambda d: d.accept()); page.locator('#new-project').tap()
    assert choices() == custom and project()['program'] == 1
    assert page.evaluate('key=>JSON.parse(localStorage.getItem(key))', LIBRARY_KEY) == custom
    session = context(storage_state=c.storage_state()); other = session.new_page(); other.goto(URL)
    assert other.locator('#instrument option').evaluate_all('els=>els.map(e=>+e.value)') == custom
    other.close(); session.close()
    open_setup(); page.locator('#restore-instruments').tap()
    assert enabled() == DEFAULTS and choices() == DEFAULTS and project()['program'] == 0
    expect(page.locator('#library-status')).to_contain_text('25 instruments')
    close_setup(); page.reload(); assert choices() == DEFAULTS
    # Loading a hidden eligible instrument must preserve its name/program and
    # temporarily expose it, without adding it to the app-wide library.
    hidden = dict(fixture, program=1, instrumentName='Bright Acoustic Piano')
    def load(p):
        page.locator('#setup').tap(); page.once('dialog', lambda d: d.accept())
        page.locator('#project-file').set_input_files({'name':'instrument.json','mimeType':'application/json','buffer':json.dumps(p).encode()})
        expect(page.locator('#setup-dialog')).to_be_hidden()
    load(hidden)
    assert project() == hidden and choices() == sorted(DEFAULTS+[1])
    expect(page.locator('#instrument option:checked')).to_contain_text('Project preview')
    assert page.evaluate('key=>JSON.parse(localStorage.getItem(key))', LIBRARY_KEY) == DEFAULTS
    page.reload(); assert project() == hidden and choices() == sorted(DEFAULTS+[1])
    open_setup(); checkbox(2, True)  # An unrelated preference preserves the imported preview.
    assert project()['program'] == 1 and choices() == sorted(DEFAULTS+[1,2])
    checkbox(1, True); checkbox(1, False)
    assert project()['program'] == 0 and 1 not in choices()
    page.locator('#restore-instruments').tap(); close_setup(); load(hidden)
    # Instrument chosen through the dropdown drives Drop and every arrangement lane.
    page.evaluate('''()=>{window.played=[];const note=ChordAudio.prototype.note;ChordAudio.prototype.note=function(pitch,time,duration,program,...rest){played.push({pitch,time,duration,program});return note.call(this,pitch,time,duration,program,...rest);};}''')
    page.locator('#drop').tap(); page.wait_for_function('played.length>=3')
    assert page.evaluate('played.every(n=>n.program===1)')
    page.locator('#stop').tap(); page.evaluate('played=[]'); page.locator('#play').tap()
    page.wait_for_function('played.some(n=>n.pitch===74)', timeout=10000)
    assert page.evaluate('played.every(n=>n.program===1)')
    assert set(page.evaluate('played.map(n=>n.pitch)')) >= {48,52,55,60,64,67,74}
    page.locator('#stop').tap(); assert project() == hidden
    # Save/load and SMF parsing establish names, tracks and an absence of PC events.
    page.locator('#setup').tap()
    with page.expect_download() as dl: page.locator('#save-project').tap()
    saved = json.loads(Path(dl.value.path()).read_text()); assert saved == hidden
    assert saved['program'] == 1 and saved['instrumentName'] == 'Bright Acoustic Piano'
    assert 'enabledInstruments' not in saved and 'instruments' not in saved
    with page.expect_download() as dl: page.locator('#export-midi').tap()
    tracks = read_midi(Path(dl.value.path()).read_bytes())
    assert [(t,k,p) for t,kind,k,p in tracks[0] if kind=='meta' and k==1] == [(0,1,b'Preview instrument: Bright Acoustic Piano')]
    assert not any(kind=='channel' and status&240==192 for track in tracks for _,kind,status,_ in track)
    for lane, name in enumerate(['RH Chords','LH Chords','Passing Notes']):
        assert next(p for _,kind,k,p in tracks[lane] if kind=='meta' and k==3).decode() == name
        expected = sorted([(e['start']*240,144+lane,bytes([pitch,96])) for e in hidden['events'] if e['lane']==lane for pitch in e['pitches']] + [((e['start']+e['duration'])*240,128+lane,bytes([pitch,0])) for e in hidden['events'] if e['lane']==lane for pitch in e['pitches']])
        assert sorted((tick,status,payload) for tick,kind,status,payload in tracks[lane] if kind=='channel') == expected
    assert next(p for _,kind,k,p in tracks[0] if kind=='meta' and k==88) == bytes([4,2,24,8])
    assert next(p for _,kind,k,p in tracks[0] if kind=='meta' and k==81) == (200000).to_bytes(3,'big')
    close_setup()
    # Imported excluded programs can preview without appearing in Setup categories.
    excluded = dict(fixture, program=32, instrumentName='Acoustic Bass'); load(excluded)
    assert choices() == sorted(DEFAULTS+[32]) and project() == excluded
    page.evaluate('played=[]'); page.locator('#drop').tap(); page.wait_for_function('played.length>=3')
    assert page.evaluate('played.every(n=>n.program===32)')
    page.locator('#stop').tap(); page.locator('#instrument').select_option('24')
    assert 32 not in choices() and project()['instrumentName'] == 'Acoustic Guitar (Nylon)'
    assert unchanged(project()) == unchanged(fixture)
    # Narrow portrait: nested accordion and both scroll containers stay usable.
    open_setup()
    for width,height in [(320,640),(360,800),(393,851),(412,915)]:
        page.set_viewport_size({'width':width,'height':height})
        category = page.locator('.instrument-category').last
        if not category.evaluate('e=>e.open'): category.locator('summary').tap()
        page.locator('#instrument-119').scroll_into_view_if_needed()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        dialog = page.locator('#setup-dialog').bounding_box()
        assert dialog['x'] >= 0 and dialog['y'] >= 0 and dialog['x']+dialog['width'] <= width+1 and dialog['y']+dialog['height'] <= height+1
        assert page.locator('#instrument-categories').evaluate('e=>e.scrollHeight>e.clientHeight')
        assert page.locator('#instrument-categories').evaluate('e=>e.scrollWidth<=e.clientWidth')
        page.screenshot(path=f'/tmp/chordmidi-instruments-{width}.png')
    close_setup()
    # Last enabled choice cannot be removed; defaults recover the full initial list.
    last = context(viewport={'width':320,'height':740},is_mobile=True,has_touch=True)
    last.add_init_script('if(location.protocol==="https:")localStorage.setItem('+json.dumps(LIBRARY_KEY)+',"[0]")')
    lp=last.new_page();lp.goto(URL);lp.locator('#setup').tap();lp.locator('#instrument-settings > summary').tap();lp.locator('.instrument-category').first.locator('summary').tap();lp.locator('#instrument-0').tap()
    expect(lp.locator('#instrument-0')).to_be_checked();expect(lp.locator('#library-status')).to_contain_text('At least one')
    assert lp.locator('#instrument option').count()==1
    lp.locator('#restore-instruments').tap();expect(lp.locator('#enabled-count')).to_have_text('25 enabled')
    # A fresh project respects existing preferences even without an autosave.
    fresh = context()
    fresh.add_init_script('if(location.protocol==="https:")localStorage.setItem('+json.dumps(LIBRARY_KEY)+',"[4]")')
    fp=fresh.new_page();fp.goto(URL)
    expect(fp.locator('#instrument')).to_have_value('4');expect(fp.locator('#instrument option')).to_have_count(1)
    assert fp.evaluate('key=>JSON.parse(localStorage.getItem(key)).instrumentName',PROJECT_KEY)=='Electric Piano 1'
    assert not errors,errors; assert not missing,missing
    print('PASS: 12 GM categories/96 eligible programs, exact 25 defaults, immediate dropdown/fallback, reload/new/session persistence, Restore Defaults, last-enabled guard, hidden eligible/excluded project previews, real SF2 Drop/all-lane playback, JSON name/program, three parsed MIDI tracks/text/no Program Changes, unchanged notes/settings, four narrow portrait sizes.')
    browser.close()
