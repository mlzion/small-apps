"""Local mobile Chromium performance guardrails; optional --baseline-ref Git ref.
These CPU-throttled desktop measurements do not certify physical-phone FPS.
"""
import argparse
import json
import os
import subprocess
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--baseline-ref', help='Also profile the LaserBreak files at this local Git ref')
args = parser.parse_args()
fixture = '''world.clear();world.settings.density=0;world.settings.targetSpeed=0;world.settings.barSpeed=0;
world.objects=Array.from({length:60},(_,i)=>i%3===0
?{id:i,type:'bar',x:50+i%10*95,y:55+Math.floor(i/10)*65,length:100,thickness:12,angle:i*.3,rotation:65*Math.PI/180,speed:0,extent:51}
:{id:i,type:'target',x:50+i%10*95,y:55+Math.floor(i/10)*65,radius:20,angle:0,speed:0,extent:20,color:i%2?'#36fff3':'#fff04b'});
world.paused=false;'''
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
    results = {}
    for label, ref in [('current',None)] + ([('baseline',args.baseline_ref)] if args.baseline_ref else []):
        c = browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=3)
        def serve(route):
            path = urlsplit(route.request.url).path.lstrip('/')
            if ref and path.startswith('laserbreak/'):
                data = subprocess.check_output(['git','show',f'{ref}:{path}'],cwd=ROOT)
            else: data = (ROOT/path).read_bytes()
            route.fulfill(body=data,content_type={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}.get(Path(path).suffix,'text/html'))
        c.route('http://bench.test/**',serve)
        page = c.new_page(); page.goto('http://bench.test/laserbreak/index.html')
        client = c.new_cdp_session(page); client.send('Emulation.setCPUThrottlingRate',{'rate':4})
        page.evaluate(fixture)
        page.wait_for_timeout(150)
        result = page.evaluate('''async()=>{
          const frames=[],renders=[],updates=[];
          const originalDraw=draw,originalStep=world.step.bind(world);
          draw=()=>{const t=performance.now();originalDraw();renders.push(performance.now()-t);};
          world.step=dt=>{const t=performance.now();originalStep(dt);updates.push(performance.now()-t);};
          let previous=performance.now();
          for(let n=0;n<120;n++){await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-previous);previous=now;}
          draw=originalDraw;world.step=originalStep;
          const stats=a=>({meanMs:a.reduce((x,y)=>x+y,0)/a.length,p95Ms:a.sort((a,b)=>a-b)[Math.floor(a.length*.95)]});
          return {raf:stats(frames),render:stats(renders),update:stats(updates),objects:world.objects.length,
            pixels:canvas.width*canvas.height,renderedFrames:renders.length};
        }''')
        # Measure slider event -> next animation opportunity with Setup over active simulation.
        page.locator('#setup-toggle').tap()
        result['slider'] = page.evaluate('''async()=>{
          const slider=document.querySelector('#targetSize'),latency=[];
          for(let n=0;n<25;n++){
            const t=performance.now();slider.value=12+n%10*2;slider.dispatchEvent(new Event('input',{bubbles:true}));
            if(world.settings.targetSize!==Number(slider.value))throw Error('Slider did not update synchronously');
            await new Promise(requestAnimationFrame);latency.push(performance.now()-t);
          }
          latency.sort((a,b)=>a-b);return {meanMs:latency.reduce((x,y)=>x+y,0)/latency.length,p95Ms:latency[23]};
        }''')
        page.locator('#close-setup').tap()
        if not ref:
            assert result['objects'] == 60
            assert result['pixels'] <= 1000000
            assert result['render']['p95Ms'] < 16, result
            assert result['update']['p95Ms'] < 5, result
            assert result['raf']['p95Ms'] < 75, result
            assert result['slider']['p95Ms'] < 100, result
            assert page.evaluate('getComputedStyle(setup).backdropFilter') == 'none'
            # Sustain the maximum particle load alongside all 60 active objects.
            result['particles'] = page.evaluate('''async()=>{
              const renders=[],updates=[],frames=[];
              const originalDraw=draw,originalStep=world.step.bind(world);
              draw=()=>{const t=performance.now();originalDraw();renders.push(performance.now()-t);};
              world.step=dt=>{const t=performance.now();originalStep(dt);updates.push(performance.now()-t);};
              let previous=performance.now(),peak=0;
              for(let n=0;n<90;n++){
                for(let i=0;i<10;i++)world.fragments({id:i,type:'target',x:200+i*60,y:250,radius:20,color:'#36fff3'},true);
                peak=Math.max(peak,world.particles.length);
                if(world.particles.length>LaserBreak.MAX_PARTICLES)throw Error('Particle cap exceeded');
                await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-previous);previous=now;
              }
              draw=originalDraw;world.step=originalStep;
              // The longest fragment lifetime is 420 ms.
              for(let n=0;n<35;n++)await new Promise(requestAnimationFrame);
              const stats=a=>({meanMs:a.reduce((x,y)=>x+y,0)/a.length,p95Ms:a.sort((a,b)=>a-b)[Math.floor(a.length*.95)]});
              return {render:stats(renders),update:stats(updates),raf:stats(frames),peak,remaining:world.particles.length};
            }''')
            assert result['particles']['peak'] == 128
            assert result['particles']['remaining'] == 0
            assert result['particles']['render']['p95Ms'] < 16, result
            assert result['particles']['update']['p95Ms'] < 5, result
            assert result['particles']['raf']['p95Ms'] < 75, result
            # No Canvas blur or per-frame layout reads. Stable HUD/pads should not mutate.
            counters = page.evaluate('''async()=>{
              window.counts={blur:0,layout:0,mutations:0};
              const descriptor=Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,'shadowBlur');
              Object.defineProperty(ctx,'shadowBlur',{get(){return descriptor.get.call(ctx);},set(v){if(v>0)counts.blur++;descriptor.set.call(ctx,v);},configurable:true});
              const rect=canvas.getBoundingClientRect.bind(canvas);
              canvas.getBoundingClientRect=()=>{counts.layout++;return rect();};
              const observer=new MutationObserver(changes=>counts.mutations+=changes.length);
              await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
              observer.observe(document.body,{subtree:true,attributes:true,childList:true,characterData:true});
              for(let n=0;n<40;n++)await new Promise(requestAnimationFrame);
              observer.disconnect();delete ctx.shadowBlur;canvas.getBoundingClientRect=rect;return counts;
            }''')
            assert counters == {'blur':0,'layout':0,'mutations':0}, counters
            # Exercise the automatic slower-device fallback and recovery without depending on host load.
            assert page.evaluate('''()=>{
              diagnostics.fps=60;pacing.slow=0;
              for(let i=0;i<45;i++)updatePacing(30);
              const slow=diagnostics.fps;
              diagnostics.renderMs=1;diagnostics.updateMs=.1;
              for(let i=0;i<240;i++)updatePacing(16.7);
              return slow===30 && diagnostics.fps===60;
            }''')
            # The Arcade clock/HUD must stay within the same budgets at maximum scene load.
            page.evaluate('arcadeChange(()=>{session.setMode("arcade");session.begin(1);})')
            page.evaluate(fixture)
            result['arcade'] = page.evaluate('''async()=>{
              const renders=[],updates=[],frames=[];
              const originalDraw=draw,originalStep=world.step.bind(world);
              draw=()=>{const t=performance.now();originalDraw();renders.push(performance.now()-t);};
              world.step=dt=>{const t=performance.now();originalStep(dt);updates.push(performance.now()-t);};
              let previous=performance.now(),peak=0;
              for(let n=0;n<90;n++){
                for(let i=0;i<10;i++)world.fragments({id:i,type:'target',x:200+i*60,y:250,radius:20,color:'#36fff3'},true);
                peak=Math.max(peak,world.particles.length);
                await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-previous);previous=now;
              }
              draw=originalDraw;world.step=originalStep;
              const stats=a=>({meanMs:a.reduce((x,y)=>x+y,0)/a.length,p95Ms:a.sort((a,b)=>a-b)[Math.floor(a.length*.95)]});
              return {render:stats(renders),update:stats(updates),raf:stats(frames),objects:world.objects.length,peak,elapsed:session.elapsed,state:session.state,pixels:diagnostics.pixels};
            }''')
            assert result['arcade']['objects'] == 60 and result['arcade']['peak'] == 128
            assert result['arcade']['state'] == 'playing' and result['arcade']['elapsed'] > 1
            assert result['arcade']['pixels'] <= 1000000
            assert result['arcade']['render']['p95Ms'] < 16, result
            assert result['arcade']['update']['p95Ms'] < 5, result
            assert result['arcade']['raf']['p95Ms'] < 75, result
            # A maximum simultaneous escape burst stays bounded, with one threshold crossing.
            result['escapes'] = page.evaluate('''()=>{
              world.clear();world.stats.targets=10;world.stats.escaped=0;
              world.objects=Array.from({length:60},(_,i)=>({type:'target',x:20+i*16,y:world.height+21,radius:20,extent:20,speed:0}));
              const start=performance.now();session.step(.016);const updateMs=performance.now()-start;
              const drawStart=performance.now();draw();const renderMs=performance.now()-drawStart;
              return {updateMs,renderMs,count:world.stats.escaped,effects:world.effects.length,objects:world.objects.length,warnings:session.warningCount};
            }''')
            assert result['escapes']['count']==60 and result['escapes']['objects']==0
            assert result['escapes']['effects']<=160 and result['escapes']['warnings']==1
            assert result['escapes']['updateMs']<5 and result['escapes']['renderMs']<16,result
        results[label] = result
        c.close()
    browser.close()
    print(json.dumps(results,indent=2))
    print('PASS: 60-object CPU/render and slider budgets, bounded Canvas pixels, no per-frame blur/layout/DOM churn, adaptive 30/60 FPS pacing, capped-particle stress and cleanup, Arcade HUD/clock under load')
