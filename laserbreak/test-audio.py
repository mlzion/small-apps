"""Browser unlock/mute integration and OfflineAudioContext synthesis verification."""
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
    context=browser.new_context(viewport={'width':844,'height':390})
    errors=[];context.on('weberror',lambda e:errors.append(str(e)))
    def serve(route):
        file=ROOT/urlsplit(route.request.url).path.lstrip('/')
        if file.is_dir():file/='index.html'
        route.fulfill(path=str(file),content_type={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}.get(file.suffix,'text/html'))
    context.route('http://app-lab.test/**',serve)
    page=context.new_page();page.goto('http://app-lab.test/laserbreak/')
    assert page.evaluate('audio.enabled && !audio.context && audio.playShot({single:1})===0')
    page.locator('#left-pad').click()
    page.wait_for_function('audio.context && audio.context.state==="running"')
    assert page.evaluate('audio.voices.size')==0
    assert page.evaluate('audio.playShot({double:50,bars:50,single:50})')==4
    page.evaluate('for(let i=0;i<50;i++)audio.playShot({double:50,bars:50,single:50})')
    assert page.evaluate('audio.voices.size<=8')
    page.wait_for_timeout(600);assert page.evaluate('audio.voices.size')==0
    page.locator('#setup-toggle').click();expect(page.locator('#sound')).to_be_checked()
    page.locator('#sound').uncheck();assert page.evaluate('!audio.enabled && audio.playShot({double:1})===0 && audio.voices.size===0')
    page.locator('#sound').check();assert page.evaluate('audio.enabled')
    page.locator('#close-setup').click()
    # No audio generation or polling should occur in ordinary animation.
    page.evaluate('window.originalVoice=audio.voice;audio.voice=()=>{throw Error("audio work in frame")};void 0')
    page.wait_for_timeout(200);page.evaluate('audio.voice=originalVoice;void 0')
    measured=page.evaluate('''async()=>{
      async function render(hits){
        const offline=new OfflineAudioContext(1,Math.ceil(24000*.7),24000);
        const synth=new LaserSound.LaserAudio();
        // Schedule into an offline graph through a running-state facade, with native nodes.
        synth.context={state:'running',currentTime:0};
        for(const name of ['createGain','createOscillator'])synth.context[name]=offline[name].bind(offline);
        synth.master=offline.createGain();synth.master.gain.value=LaserSound.MASTER_GAIN;synth.master.connect(offline.destination);
        const voices=hits.escape ? Number(synth.playEscape()) : synth.playShot(hits);const buffer=await offline.startRendering(),data=buffer.getChannelData(0);
        const peak=(from,to)=>{let max=0;for(let i=Math.ceil(from*24000);i<Math.floor(to*24000);i++)max=Math.max(max,Math.abs(data[i]));return max;};
        const frequency=(from,to)=>{let crossings=0;const begin=Math.ceil(from*24000),end=Math.floor(to*24000);for(let i=begin+1;i<end;i++)if(data[i-1]<=0&&data[i]>0)crossings++;return crossings/(to-from);};
        let energy=0;for(const v of data)energy+=v*v;
        return {voices,energy,peak:peak(0,.7),first:peak(.08,.11),gap:peak(.128,.155),second:peak(.175,.205),tail:peak(.24,.7),escapeEarlyHz:frequency(.01,.04),escapeLateHz:frequency(.07,.10),firstHz:frequency(.08,.11),secondHz:frequency(.175,.205)};
      }
      return {escape:await render({escape:true}),zap:await render({}),single:await render({single:1}),double:await render({double:1}),bars:await render({bars:1}),mass:await render({single:60,double:60,bars:60}),mixed:await render({single:1,double:1,bars:1})};
    }''')
    assert measured['escape']['voices']==1 and measured['escape']['tail']<.000001,measured
    assert measured['escape']['escapeEarlyHz']>measured['escape']['escapeLateHz']+150,measured
    assert measured['single']['first']>.015 and measured['single']['second']<.000001,measured
    assert measured['double']['first']>.015 and measured['double']['second']>.015,measured
    assert measured['double']['gap']<.000001 and measured['double']['tail']<.000001,measured
    assert abs(measured['double']['firstHz']-1100)<40 and abs(measured['double']['secondHz']-1320)<40,measured
    assert measured['bars']['voices']==3 and measured['double']['voices']==2 and measured['mass']['voices']==4
    assert abs(measured['mass']['energy']-measured['mixed']['energy'])<.00001,measured
    assert all(0<v['peak']<.51 for v in measured.values()),measured
    page.screenshot(path='/tmp/laserbreak-audio-test.png')
    fallback=browser.new_context(viewport={'width':844,'height':390})
    fallback.route('http://app-lab.test/**',serve)
    fallback.on('weberror',lambda e:errors.append(str(e)))
    fallback.add_init_script('window.AudioContext=undefined;window.webkitAudioContext=undefined;')
    silent=fallback.new_page();silent.goto('http://app-lab.test/laserbreak/')
    silent.locator('#left-pad').click()
    assert silent.evaluate('!audio.context && audio.enabled')
    assert silent.evaluate('world.clear();input.down(1,"left",200);input.down(2,"right",200);input.up(1);world.effects.some(e=>e.type==="flash")')
    assert not errors,errors
    browser.close()
    print('PASS: real user-gesture audio unlock, silent initialization, mute/unmute, voice cleanup/caps, no frame audio work, unsupported fallback; offline distinct single/double beeps with silent gap and higher second pitch, aggregated hits and peak headroom',measured)
