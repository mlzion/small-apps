"""Run from repository root: python chordmidi/test-browser.py."""
import json, os
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
PROBE="""(() => {
 window.probe={contexts:[],hits:[],clicks:[]};const Native=window.AudioContext;
 window.AudioContext=class extends Native {
 constructor(...a){super(...a);probe.contexts.push(this);}
 createBufferSource(){const s=super.createBufferSource(),start=s.start.bind(s),stop=s.stop.bind(s),r={ended:false};s.addEventListener('ended',()=>r.ended=true);s.start=(time)=>{Object.assign(r,{time,rate:s.playbackRate.value,frames:s.buffer.length,loop:s.loop});probe.hits.push(r);return start(time);};s.stop=(time)=>{r.stop=time??this.currentTime;return stop(time);};return s;}
 createOscillator(){const s=super.createOscillator(),start=s.start.bind(s);s.start=(time)=>{probe.clicks.push({time,frequency:s.frequency.value});return start(time);};return s;}
 };
})()"""
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
  route.fulfill(path=str(file),content_type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.sf2':'application/octet-stream'}.get(file.suffix,'text/plain'))
 def context(**kw):
  c=browser.new_context(**kw);c.route('https://app-lab.test/**',serve);c.add_init_script(PROBE);c.on('weberror',lambda e:errors.append(str(e)));return c
 c=context(viewport={'width':393,'height':851},is_mobile=True,has_touch=True)
 page=c.new_page();page.goto('https://app-lab.test/small-apps/chordmidi/');page.screenshot(path='/tmp/chordmidi-initial.png',full_page=True)
 def project():return page.evaluate("JSON.parse(localStorage.getItem('app-lab-chordmidi-v1'))")
 def pad(lane,step):return page.locator(f'#lane-{lane} .pad[data-start="{step}"]')
 def wheel(id,key):
  target=page.locator('#wheel-'+id);target.focus();page.keyboard.press(key)
 expect(page.locator('.wheel')).to_have_count(6);expect(page.locator('.wheel-option')).to_have_count(18);expect(page.locator('#chord-name')).to_have_text('C major · Root · Oct 4');assert page.evaluate('probe.contexts.length')==0
 # Mouse wheel, keyboard and true CDP touch scrolling/snapping; two choices never duplicate.
 wheel('mode','End');expect(page.locator('#chord-name')).to_contain_text('C minor');expect(page.locator('#wheel-mode .wheel-option:not(.blank)')).to_have_count(2)
 wheel('mode','Home');wheel('inversion','End');expect(page.locator('#chord-notes')).to_contain_text('67, 72, 76')
 wheel('quality','ArrowDown');assert project()['builders'][0]['inversion']==1
 wheel('quality','Home');wheel('inversion','Home')
 page.locator('#wheel-key').dispatch_event('wheel',{'deltaY':120});expect(page.locator('#wheel-key')).to_have_attribute('aria-valuetext','C♯')
 cdp=c.new_cdp_session(page)
 def touch(kind,x=0,y=0):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind=='touchEnd' else [{'x':x,'y':y,'id':1}]})
 box=page.locator('#wheel-key').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
 touch('touchStart',x,y);touch('touchMove',x,y-36);touch('touchEnd');expect(page.locator('#wheel-key')).to_have_attribute('aria-valuetext','D')
 wheel('key','Home');pad(0,0).tap();expect(page.locator('.event')).to_have_count(1);assert project()['events'][0]['pitches']==[60,64,67]
 # Independent LH octave and inversion, and single-note passing lane.
 page.locator('#lh').tap();wheel('inversion','ArrowDown');pad(1,0).tap();assert project()['events'][1]['pitches']==[52,55,60]
 page.locator('#passing-note').select_option('2');pad(2,2).tap();assert project()['events'][2]['pitches']==[64]
 page.locator('#rh').tap();wheel('key','ArrowDown');assert project()['events'][0]['pitches']==[60,64,67]
 # Tap selection restores original builder, copy/paste is a snapshot with original duration/pitches.
 page.locator('.event[data-lane="0"]').tap();expect(page.locator('#wheel-key')).to_have_attribute('aria-valuetext','C♯');expect(page.locator('#builder-context')).to_contain_text('Builder C Major');page.locator('#copy').tap();wheel('key','ArrowDown');page.locator('#paste').tap();pad(1,4).tap();assert project()['events'][-1]['pitches']==[60,64,67]
 # Hold empty pad + horizontal drag extends duration; right edge resize.
 target=pad(0,3);box=target.bounding_box();x=box['x']+16;y=box['y']+35
 touch('touchStart',x,y);page.wait_for_timeout(300);touch('touchMove',x+64,y);touch('touchEnd');assert project()['events'][-1]['duration']==3, (project()['events'],page.locator('#status').inner_text())
 event=page.locator('.event[data-lane="0"]').last;box=event.locator('.resize').bounding_box();x=box['x']+7;y=box['y']+20
 touch('touchStart',x,y);touch('touchMove',x+32,y);touch('touchEnd');assert project()['events'][-1]['duration']==4
 # Moving a held event cancels deletion; stationary long press deletes exactly one.
 event=page.locator('.event[data-lane="0"]').last;box=event.bounding_box();x=box['x']+12;y=box['y']+20;before=len(project()['events'])
 touch('touchStart',x,y);touch('touchMove',x-12,y);page.wait_for_timeout(700);touch('touchEnd');assert len(project()['events'])==before
 page.locator('#timeline-scroll').evaluate('e=>e.scrollLeft=0');event=page.locator('.event[data-lane="0"]').last;box=event.bounding_box();x=box['x']+12;y=box['y']+20
 touch('touchStart',x,y);page.wait_for_timeout(700);touch('touchEnd');assert len(project()['events'])==before-1
 # Native scrolling cancels accidental placement on empty pads.
 before=project();page.locator('#timeline-scroll').evaluate('e=>e.scrollLeft=0');box=pad(2,4).bounding_box();x=box['x']+16;y=box['y']+30
 touch('touchStart',x,y);touch('touchMove',x-100,y);touch('touchEnd');assert project()==before
 page.wait_for_timeout(1000)  # Let native kinetic scrolling settle before the next tap.
 page.locator('#timeline-scroll').evaluate('e=>e.scrollLeft=0')
 # All meters / grid lengths; shortening refuses to discard notes.
 for meter,steps in [('2/4',16),('3/4',24),('4/4',32),('6/8',24)]:
  page.locator('#meter').select_option(meter);expect(page.locator('#lane-0 .pad')).to_have_count(steps)
 for bars in range(5,9):
  page.locator('#more-bars').tap();expect(page.locator('#bar-count')).to_have_text(str(bars))
 assert project()['bars']==8, (project()['bars'],page.locator('#status').inner_text())
 page.evaluate('scrollTo(0,0)');page.wait_for_timeout(400)
 # Touch all wheels, verify exact snapped selections remain in range.
 for id in ['key','mode','degree','quality','inversion','octave']:
  target=page.locator('#wheel-'+id);box=target.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
  touch('touchStart',x,y);page.wait_for_timeout(80);touch('touchMove',x,y+42);touch('touchEnd');page.wait_for_timeout(200);assert int(target.get_attribute('aria-valuenow'))>=0
 page.wait_for_timeout(500)
 # Real SF2 decoding, every GM preset and zone sample, audio scheduling and note-off.
 page.locator('#drop').tap()
 try:page.wait_for_function('probe.hits.length>=3',timeout=20000)
 except Exception:
  print('AUDIO DEBUG',page.locator('#status').inner_text(),page.locator('#audio-status').inner_text(),page.evaluate('({hits:probe.hits,contexts:probe.contexts.map(c=>c.state)})'),errors,flush=True);raise
 assert page.evaluate('probe.contexts[0].state')=='running';assert page.evaluate('probe.hits.every(h=>h.frames>0 && h.rate>0 && h.stop>h.time)')
 page.evaluate('''async()=>{const a=new ChordAudio();await a.init();window.bankProbe={presets:0,voices:0};for(let program=0;program<128;program++){let count=0;for(const pitch of [36,60,84])for(const z of a.font.voices(program,pitch)){const s=a.font.sample(z);if(!s.buffer.length)throw Error('Empty sample');count++;}if(!count)throw Error('Missing GM program '+program);bankProbe.presets++;bankProbe.voices+=count;}a.stop();}''')
 assert page.evaluate('bankProbe.presets')==128
 # Render real PCM for piano, organ, guitar, strings and brass; releases reach silence.
 render=page.evaluate('''async()=>{const bytes=await(await fetch('soundfont/TimGM6mb.sf2')).arrayBuffer(),c=new OfflineAudioContext(2,44100*8,44100),a=new ChordAudio();a.context=c;a.master=c.createGain();a.master.gain.value=.15;a.master.connect(c.destination);a.font=new SoundFont(bytes,c);[0,16,24,48,61].forEach((program,i)=>[60,64,67].forEach(pitch=>a.note(pitch,.01+i, .35,program)));const b=await c.startRendering(),v=b.getChannelData(0);return {energy:[0,1,2,3,4].map(s=>{let e=0;for(let i=(s+.02)*44100|0;i<(s+.3)*44100;i++)e+=v[i]*v[i];return e;}),tail:v.slice(7*44100).reduce((m,x)=>Math.max(m,Math.abs(x)),0)};}''')
 assert all(e>0.001 for e in render['energy']),render;assert render['tail']==0,render
 # Deterministic transport fixture includes simultaneous lanes, passing notes, sustained notes.
 fixture=page.evaluate('''()=>{const p=ChordMidi.fresh();p.bars=1;p.bpm=300;p.metronome=true;p.events=[ChordMidi.makeEvent(p,0,0,4),ChordMidi.makeEvent(p,1,0,8),ChordMidi.makeEvent(p,2,2,1)];return p;}''')
 page.evaluate("p=>localStorage.setItem('app-lab-chordmidi-v1',JSON.stringify(p))",fixture);page.reload()
 page.locator('#meter').select_option('2/4');expect(page.locator('#meter')).to_have_value('4/4');expect(page.locator('#status')).to_contain_text('extend past that length')
 page.locator('#play').tap();page.wait_for_function('probe.hits.length>=7');page.wait_for_timeout(1800)
 hits=page.evaluate('probe.hits');assert len(hits)>=13,hits
 times=[h['time'] for h in hits];first=min(times);assert sum(abs(t-first)<1e-5 for t in times)>=6;assert any(abs(t-first-.2)<1e-5 for t in times);assert any(abs(t-first-.8)<1e-5 for t in times)
 clicks=page.evaluate('probe.clicks');assert len(clicks)>=8;assert abs(clicks[1]['time']-clicks[0]['time']-.2)<1e-6
 expect(page.locator('#cursor')).to_be_visible();page.locator('#play').tap();expect(page.locator('#play')).to_have_attribute('aria-label','Play');n=page.evaluate('probe.hits.length');page.wait_for_timeout(180);assert page.evaluate('probe.hits.length')==n
 page.locator('#play').tap();page.wait_for_timeout(180);page.locator('#stop').tap();assert page.evaluate('probe.hits.every(h=>h.stop<=probe.contexts[0].currentTime || h.ended)')
 page.locator('#loop').tap();page.locator('#play').tap();page.wait_for_timeout(1200);expect(page.locator('#play')).to_have_attribute('aria-label','Play');expect(page.locator('#cursor')).to_be_hidden()
 page.locator('#instrument').select_option('24');page.locator('#drop').tap();page.wait_for_timeout(100);expect(page.locator('#audio-status')).to_contain_text('SF2 ready')
 # JSON / MIDI downloads and automatic persistence, malformed imports leave project intact.
 page.locator('#setup').tap();page.locator('#project-name').fill('My progression')
 with page.expect_download() as dl:page.locator('#save-project').tap()
 path=dl.value.path();saved=project();assert json.loads(Path(path).read_text())==saved
 with page.expect_download() as dl:page.locator('#export-midi').tap()
 data=Path(dl.value.path()).read_bytes();assert data[:4]==b'MThd' and int.from_bytes(data[10:12],'big')==3
 page.once('dialog',lambda d:d.accept());page.locator('#new-project').tap();assert project()['events']==[]
 page.locator('#setup').tap();page.once('dialog',lambda d:d.accept());page.locator('#project-file').set_input_files(path);expect(page.locator('#setup-dialog')).to_be_hidden();assert project()==saved
 page.reload();assert project()==saved
 page.locator('#setup').tap();page.locator('#project-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"format":"chordmidi","version":2}'})
 expect(page.locator('#storage-status')).to_contain_text('Could not load');assert project()==saved;page.locator('#close-setup').tap()
 # Selecting a chord-tone passing event restores the RH source voicing too.
 page.locator('#note-source').select_option('chord');page.locator('#passing-note').select_option('2');pad(2,4).tap();assert project()['events'][-1]['pitches']==[67]
 wheel('degree','End');page.locator('.event[data-lane="2"]').last.tap();expect(page.locator('#wheel-degree')).to_have_attribute('aria-valuenow','0');expect(page.locator('#passing-note')).to_have_value('2');assert page.locator('#passing-note option:checked').inner_text()=='G4'
 # Portrait widths, fixed transport and no horizontal page overflow.
 for width,height in [(320,740),(360,800),(393,851),(412,915),(768,1024),(1440,1000)]:
  page.set_viewport_size({'width':width,'height':height});page.evaluate('scrollTo(0,0)');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  box=page.locator('.transport').bounding_box();assert abs(box['y']+box['height']-height)<2
  assert page.locator('.wheel-option.selected').count()==6
  assert page.locator('.instrument').bounding_box()['y']+page.locator('.instrument').bounding_box()['height']<box['y'],width
  page.screenshot(path=f'/tmp/chordmidi-{width}.png',full_page=True)
 # Fullscreen API control and desktop mouse dragging, plus gallery routing at both roots.
 desk=context(viewport={'width':900,'height':1000});d=desk.new_page()
 for prefix in ['/','/small-apps/']:
  d.goto('https://app-lab.test'+prefix);d.get_by_role('link',name='Launch ChordMidi',exact=True).click();expect(d).to_have_url('https://app-lab.test'+prefix+'chordmidi/')
  target=d.locator('#lane-0 .pad').nth(0);box=target.bounding_box();x=box['x']+16;y=box['y']+30;d.mouse.move(x,y);d.mouse.down();d.mouse.move(x+96,y,steps=5);d.mouse.up();assert d.evaluate("JSON.parse(localStorage.getItem('app-lab-chordmidi-v1')).events.at(-1).duration")==4
  d.evaluate('localStorage.clear()')
 d.locator('#fullscreen').click();d.wait_for_function('!!document.fullscreenElement');d.locator('#fullscreen').click();d.wait_for_function('!document.fullscreenElement')
 # Audio/network and storage failures are visible and recoverable.
 failed=context();failed.route('**/TimGM6mb.sf2',lambda route:route.fulfill(status=503));f=failed.new_page();f.goto('https://app-lab.test/chordmidi/');f.locator('#drop').click();expect(f.locator('#status')).to_contain_text('Could not start audio');expect(f.locator('#play')).to_be_enabled()
 storage=context();storage.add_init_script("Storage.prototype.setItem=function(){throw Error('full')}");s=storage.new_page();s.goto('https://app-lab.test/chordmidi/');expect(s.locator('#status')).to_contain_text('Use Save Project');s.locator('#setup').click()
 with s.expect_download() as dl:s.locator('#save-project').click()
 assert json.loads(Path(dl.value.path()).read_text())['format']=='chordmidi'
 # Root-only octave dyads integrate with both builders and all existing actions.
 oc=context(viewport={'width':320,'height':740},is_mobile=True,has_touch=True);op=oc.new_page();op.goto("https://app-lab.test/small-apps/chordmidi/")
 op.evaluate('''()=>{window.octaveNotes=[];const init=ChordAudio.prototype.init,note=ChordAudio.prototype.note;ChordAudio.prototype.init=function(...args){window.octaveAudio=this;return init.apply(this,args);};ChordAudio.prototype.note=function(pitch,time,duration,program,preview=false){octaveNotes.push({pitch,time,duration,program,preview});return note.call(this,pitch,time,duration,program,preview);};}''')
 def owheel(id,key):op.locator('#wheel-'+id).focus();op.keyboard.press(key)
 def octave_quality():
  owheel('quality','Home')
  for _ in range(op.evaluate("ChordMidi.qualities.findIndex(q=>q.id==='octave')")):owheel('quality','ArrowDown')
 def oproject():return op.evaluate("JSON.parse(localStorage.getItem('app-lab-chordmidi-v1'))")
 owheel('inversion','End');octave_quality()
 expect(op.locator('#wheel-quality')).to_have_attribute('aria-valuetext','Octave 1–8')
 expect(op.locator('#wheel-inversion')).to_have_attribute('aria-valuemax','0');expect(op.locator('#wheel-inversion .wheel-option:not(.blank)')).to_have_count(1)
 owheel('inversion','End');owheel('inversion','ArrowDown');op.locator('#wheel-inversion').dispatch_event('wheel',{'deltaY':120})
 assert oproject()['builders'][0]['inversion']==0
 expect(op.locator('#chord-notes')).to_contain_text('C4 – C5');expect(op.locator('#chord-notes')).to_contain_text('60, 72')
 op.locator('#drop').tap();op.wait_for_function('octaveNotes.length===2');assert op.evaluate('octaveNotes.map(n=>n.pitch)')==[60,72]
 op.locator('#lane-0 .pad[data-start="0"]').tap();assert oproject()['events'][0]['pitches']==[60,72]
 op.locator('#lh').tap();octave_quality();expect(op.locator('#chord-notes')).to_contain_text('C3 – C4')
 op.locator('#lane-1 .pad[data-start="0"]').tap();assert oproject()['events'][1]['pitches']==[48,60]
 for lane,pitches,label in [(0,[60,72],'C4 – C5'),(1,[48,60],'C3 – C4')]:
  op.evaluate('octaveNotes=[]');op.locator(f'.event[data-lane="{lane}"]').tap();op.wait_for_function('octaveNotes.length===2')
  assert op.evaluate('octaveNotes.map(n=>n.pitch)')==pitches
  expect(op.locator('#chord-notes')).to_contain_text(label);expect(op.locator('#wheel-inversion')).to_have_attribute('aria-valuemax','0')
 stored=oproject()['events'];op.locator('#rh').tap();owheel('key','Home');owheel('key','ArrowDown');owheel('degree','End')
 expect(op.locator('#chord-notes')).to_contain_text('B♯4 – B♯5');expect(op.locator('#chord-notes')).to_contain_text('72, 84')
 owheel('mode','End');expect(op.locator('#chord-notes')).to_contain_text('B4 – B5');expect(op.locator('#chord-notes')).to_contain_text('71, 83')
 assert oproject()['events']==stored
 op.evaluate('octaveNotes=[]');op.locator('#play').tap();op.wait_for_function('octaveNotes.filter(n=>!n.preview).length===4')
 assert sorted(op.evaluate('octaveNotes.filter(n=>!n.preview).map(n=>n.pitch)'))==[48,60,60,72]
 owheel('inversion','ArrowDown');assert op.evaluate('octaveAudio.running');op.locator('#stop').tap()
 op.locator('#setup').tap();op.locator('#project-name').fill('Octave dyads')
 with op.expect_download() as dl:op.locator('#save-project').tap()
 octave_path=dl.value.path();octave_saved=oproject();assert json.loads(Path(octave_path).read_text())==octave_saved
 assert all(b['quality']=='octave' and b['inversion']==0 for b in octave_saved['builders'])
 with op.expect_download() as dl:op.locator('#export-midi').tap()
 octave_midi=Path(dl.value.path()).read_bytes();assert octave_midi[:4]==b'MThd' and int.from_bytes(octave_midi[10:12],'big')==3
 assert octave_midi==bytes(op.evaluate("Array.from(ChordMidi.midi(JSON.parse(localStorage.getItem('app-lab-chordmidi-v1'))))"))
 op.once('dialog',lambda d:d.accept());op.locator('#new-project').tap();op.locator('#setup').tap();op.once('dialog',lambda d:d.accept());op.locator('#project-file').set_input_files(octave_path)
 expect(op.locator('#setup-dialog')).to_be_hidden();assert oproject()==octave_saved;op.reload();assert oproject()==octave_saved
 expect(op.locator('#wheel-inversion .wheel-option:not(.blank)')).to_have_count(1)
 op.locator('#setup').tap();invalid=json.loads(json.dumps(octave_saved));invalid['builders'][0]['inversion']=1
 op.locator('#project-file').set_input_files({'name':'bad-octave.json','mimeType':'application/json','buffer':json.dumps(invalid).encode()})
 expect(op.locator('#storage-status')).to_contain_text('Could not load');assert oproject()==octave_saved;op.locator('#close-setup').tap()
 for width in [320,360,393]:
  op.set_viewport_size({'width':width,'height':800});assert op.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert op.locator('#wheel-quality .selected').evaluate('e=>e.scrollWidth<=e.clientWidth')
 print('PASS: Octave 1–8 RH/LH root-only wheel and labels, key/mode/degree/register changes, exact two-note Drop/tap/playback, immutable placed pitches, JSON/reload/invalid inversion rejection and three-track MIDI download on narrow portrait sizes.',flush=True)
 assert not missing,missing;assert not errors,errors
 print('PASS: 6 touch wheels, wheel/keyboard/mouse; independent voicings; frozen pitches; placement/hold-drag/resize/select/copy/paste/long-delete/scroll cancellation; meters/8 bars; all 128 real SF2 presets; simultaneous lanes/passing notes; audio clock/offs/pause/resume/loop/click/stop; JSON/MIDI/failure recovery; 6 layouts/fullscreen; both hosting roots.')
 browser.close()
