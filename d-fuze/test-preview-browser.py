"""Real Canvas geometry and clock-driven Level Preview regressions in Chromium."""
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
CAPTURE = """() => {
  const proto = CanvasRenderingContext2D.prototype;
  const arc = proto.arc, clear = proto.clearRect;
  window.levelArcs = [];
  proto.clearRect = function(...args) {
    if (this.canvas.id === 'level-preview') window.levelArcs = [];
    return clear.apply(this, args);
  };
  proto.arc = function(x,y,r,start,end,...rest) {
    if (this.canvas.id === 'level-preview')
      window.levelArcs.push({r,start,end,color:this.strokeStyle,cap:this.lineCap});
    return arc.call(this,x,y,r,start,end,...rest);
  };
  drawLevel();
}"""


def verify_geometry(page, widths):
    arcs = page.evaluate('levelArcs.filter(a=>a.r>75)')
    assert len(arcs) == 2 * len(widths)
    for i, degrees in enumerate(widths):
        wall, gate = arcs[i * 2:i * 2 + 2]
        width = math.radians(degrees)
        assert gate['color'] == '#56adff' and wall['color'] == '#ef6258'
        assert gate['cap'] == wall['cap'] == 'butt'
        assert gate['r'] == wall['r'] == 108 + i * 30
        assert math.isclose(gate['end'] - gate['start'], width, abs_tol=1e-12)
        assert math.isclose(wall['end'] - wall['start'], math.tau - width, abs_tol=1e-12)
        assert math.isclose(wall['start'], gate['end'], abs_tol=1e-12)
        assert math.isclose(wall['end'], gate['start'] + math.tau, abs_tol=1e-12)
        # Verify actual rendered pixels on both sides of each gate boundary.
        colors = page.evaluate('''([r,start,end]) => {
          const ctx=document.querySelector('#level-preview').getContext('2d');
          return [start+.025,end-.025,start-.025,end+.025].map(a=>
            Array.from(ctx.getImageData(Math.round(300+r*Math.cos(a)),
              Math.round(300+r*Math.sin(a)),1,1).data).slice(0,3));
        }''', [gate['r'], gate['start'], gate['end']])
        assert colors == [[86,173,255], [86,173,255], [239,98,88], [239,98,88]], colors


def verify_game_angles(page):
    # Compare actual preview arcs to the real game's parent/local/world angles.
    result = page.evaluate('''() => {
      const game=new DFuze.Game(()=>{},undefined,{testLevel:current(),
        seed:current().seed,assemblyProfiles:doc.assemblyProfiles,ringProfiles:doc.ringProfiles});
      game.elapsed=previewTime;game.updateRings();
      const gates=levelArcs.filter(a=>a.r>75 && a.color==='#56adff');
      return game.rings.map((r,i)=>({expected:r.displayAngle,
        actual:(gates[i].start+gates[i].end)/2, width:r.gateArc,
        drawnWidth:gates[i].end-gates[i].start}));
    }''')
    for ring in result:
        assert math.isclose(ring['expected'], ring['actual'], abs_tol=1e-10), ring
        assert math.isclose(ring['width'], ring['drawnWidth'], abs_tol=1e-10)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium')
    errors = []
    for viewport, prefix in [({'width':375,'height':812}, '/small-apps/'),
                             ({'width':1440,'height':1000}, '/')]:
        ctx=browser.new_context(viewport=viewport, is_mobile=viewport['width']<500,
                                has_touch=True)
        def serve(route):
            path=urlsplit(route.request.url).path.removeprefix('/small-apps')
            file=ROOT/path.lstrip('/')
            if file.is_dir():file/='index.html'
            assert file.is_file(), path
            route.fulfill(path=str(file),content_type={'.json':'application/json',
                '.js':'text/javascript','.html':'text/html','.css':'text/css',
                '.svg':'image/svg+xml'}.get(file.suffix,'text/plain'))
        ctx.route('http://app-lab.test/**',serve)
        ctx.on('weberror',lambda e:errors.append(str(e)))
        page=ctx.new_page()
        epoch=datetime(2026,11,9,12,tzinfo=timezone.utc)
        page.clock.install(time=epoch)
        page.goto('http://app-lab.test'+prefix+'d-fuze/builder/')
        page.locator('#access-code').fill('FUSE-LAB-3')
        page.get_by_role('button',name='OPEN LEVEL BUILDER').click()
        expect(page.locator('#builder')).to_be_visible()
        page.clock.pause_at(epoch+timedelta(seconds=1))
        page.add_script_tag(url='http://app-lab.test'+prefix+'d-fuze/engine.js')
        page.evaluate(CAPTURE)
        for width in [10,60,120]:
            page.get_by_role('combobox',name='Ring 1 gate width',exact=True).select_option(str(width))
            verify_geometry(page,[width])
        # Four independent configured widths, also supported by Test Mode.
        count=page.get_by_role('spinbutton',name='Level 1 Rings',exact=True)
        count.fill('4');count.press('Tab')
        for i,width in enumerate([10,60,120,20],1):
            page.get_by_role('combobox',name=f'Ring {i} gate width',exact=True).select_option(str(width))
        verify_geometry(page,[10,60,120,20])
        expect(page.locator('#test-level')).to_be_enabled()
        verify_game_angles(page)
        page.get_by_role('combobox',name='Ring 1 family',exact=True).select_option('hard')
        page.get_by_role('combobox',name='Ring 2 family',exact=True).select_option('easy')
        # Independently scaled clocks plus unwrapped assembly turns.
        page.evaluate('''() => {
          current().playbackSpeed=1.3;current().assembly.playbackSpeed=.7;
          const profile=doc.assemblyProfiles.find(p=>p.id===current().assembly.profileId);
          profile.keyframes=[[0,0],[5,45],[12,180],[20,315],[25,360]];
          renderAll();
        }''')
        page.locator('#preview-play').click(force=True)
        expect(page.locator('#preview-play')).to_have_text('STOP')
        assert page.evaluate('previewTime') == 0
        for advance,target in [(10100,10.1),(15000,25.1),(25000,50.1),(50000,100.1)]:
            page.clock.fast_forward(advance)
            assert abs(page.evaluate('previewTime')-target)<.02
            assert page.evaluate('previewPlaying')
            expect(page.locator('#preview-play')).to_have_text('STOP')
            verify_game_angles(page)
            before=page.evaluate('[previewTime,previewProfiles.map(p=>p.id)]')
            # Width edits redraw immediately without touching playback or profiles.
            width=120 if target<30 else 60
            page.get_by_role('combobox',name='Ring 1 gate width',exact=True).select_option(str(width))
            assert page.evaluate('[previewTime,previewProfiles.map(p=>p.id)]') == before
            assert page.evaluate('previewPlaying')
            verify_geometry(page,[width,60,120,20]);verify_game_angles(page)
        expect(page.locator('#preview-readout')).to_contain_text('Elapsed: 100.')
        expect(page.locator('#preview-readout')).to_contain_text('Ring cycle:')
        expect(page.locator('#preview-readout')).to_contain_text('Assembly cycle:')
        page.locator('#preview-play').click(force=True)
        expect(page.locator('#preview-play')).to_have_text('PLAY')
        assert page.evaluate('[previewTime,previewPlaying]') == [0,False]
        verify_game_angles(page)
        page.clock.fast_forward(60000)
        assert page.evaluate('previewTime') == 0
        page.locator('#preview-play').click(force=True)
        assert page.evaluate('previewTime') == 0
        page.clock.run_for(1000)
        assert abs(page.evaluate('previewTime')-1)<.02
        page.locator('#preview-play').click(force=True)
        # Fixed widths belong only to the explicitly labeled profile references.
        expect(page.locator('#profile-ring').locator('..').locator('..')).to_contain_text('fixed 60° gate')
        page.locator('#motion-mode').select_option('assembly')
        expect(page.locator('#assembly-section')).to_contain_text('fixed 60° gates')
        assert page.locator('#preview-section input[type=range],#preview-speed').count()==0
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        ctx.close()
    assert not errors,errors
    print('PASS: Canvas arcs/pixels for 10/60/120° and mixed four-ring widths; live edits preserve playback; continuous 10/25/50/100s clocks match real game with mixed profiles and independent rates/unwrapped assembly turns; Stop/reset/restart; labeled reference previews; mobile/desktop and both hosting paths')
    browser.close()
