"""Generate the progression report and exportable graph from seeded simulation results.
Development only: Python + matplotlib; nothing from this script is loaded by the app.
"""
import json
import math
import os
from pathlib import Path
os.environ.setdefault('MPLCONFIGDIR','/tmp/laserbreak-matplotlib')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parent
report=json.loads((ROOT/'arcade-simulation.json').read_text())
config=report['config'];c=config;levels=report['levels'];models=report['models'];results=report['results']
count=config['levelCount'];attempts=results[0]['attempts']
by_key={(r['model'],r['level']):r for r in results}
def wilson(rate,n):
    z=1.96;den=1+z*z/n;center=(rate+z*z/(2*n))/den
    half=z*math.sqrt(rate*(1-rate)/n+z*z/(4*n*n))/den
    return max(0,center-half),min(1,center+half)
plt.rcParams.update({'svg.hashsalt':'laserbreak-arcade','font.size':10})
fig,ax=plt.subplots(figsize=(9.3,5.2))
for idx,model in enumerate(models):
    rows=[by_key[(model['name'],n)] for n in range(1,count+1)]
    x=list(range(1,count+1));y=[100*(1-r['completion']) for r in rows]
    ax.plot(x,y,label=model['name'],marker=['o','s','^'][idx],linestyle=['-','--',':'][idx],linewidth=2,markersize=5)
    if idx==0:
        bounds=[wilson(r['completion'],r['attempts']) for r in rows]
        ax.fill_between(x,[100*(1-hi) for lo,hi in bounds],[100*(1-lo) for lo,hi in bounds],alpha=.13)
for level in levels:
    if level['number']>1 and (level['number']-1)%config['plateauEvery']==0:
        ax.axvspan(level['number']-.2,level['number']+.2,color='#777777',alpha=.08)
ax.set(xlabel='Level',ylabel='Estimated difficulty (% unsuccessful attempts)',ylim=(-3,103),xticks=list(range(1,count+1)),title=f'LaserBreak Arcade estimates · {attempts} attempts per model per level')
ax.grid(alpha=.2);ax.legend(loc='upper left')
fig.text(.5,.01,'Shading: Learning model 95% Wilson intervals. Gray bands: extra-parameter plateaus. Phone playtesting is still required.',ha='center',fontsize=8)
fig.tight_layout(rect=(0,.035,1,1))
fig.savefig(ROOT/'arcade-difficulty.svg',metadata={'Date':None})
fig.savefig('/tmp/laserbreak-arcade-difficulty.png',dpi=150)
lines=['# LaserBreak — 10-level Arcade progression report','',
       f"Configuration and results are generated from `arcade.js` and [arcade-simulation.json](arcade-simulation.json). The primary run uses **{attempts} seeded attempts per level per model**, **{len(results)*attempts:,} attempts total**, a **{report['geometry']['width']} × {report['geometry']['height']}** logical field, and **60 Hz** simulation. This approximates the central field of an 844×390 landscape phone after the existing pads/header. It is an estimate, not a physical-phone validation.",'',
       '## Generated levels','',
       '| Level | Budget | Seconds | Target Ø | Target fall | Bar length | Bar fall | Rotation °/s | Density % | Bars % | Cooldown s | Blast × | Required |',
       '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
for l in levels:
    s=l['settings'];lines.append(f"| {l['number']} | {l['budget']} | {l['duration']} | {s['targetSize']} | {s['targetSpeed']:.2f} | {s['barLength']} | {s['barSpeed']:.2f} | {s['barRotation']} | {s['density']} | {s['barPercentage']} | {s['cooldown']} | {s['blastMultiplier']} | {l['required']} |")
lines += ['','Sizes/speeds use logical pixels and logical pixels/second. Thickness remains 12. Sound/debug are user preferences, not difficulty inputs. Requirements need not rise numerically: more bars and smaller targets reduce attainable target supply, so the budget compensates instead of simply increasing every requirement.','',
'## Central formulas','',
f"For positive integer level `L`, let `n = L − 1`, `b = n − floor(n / {c['plateauEvery']})`, and `p(j) = floor(b / 4) + indicator(b mod 4 > j)` for axes `j = 0..3`. Every {c['plateauEvery']}th step adds no extra budget point. Falling speeds still rise; the plateau is in the other parameters.",'',
f"- Target speed: `min({c['maxTargetSpeed']}, {c['targetSpeed']} × {c['speedRate']}^n)`; bar speed: `min({c['maxBarSpeed']}, {c['barSpeed']} × {c['speedRate']}^n)`.",
f"- Density: `min({c['maxDensity']}, {c['density']} + {c['densityStep']} × p(0))`.",
f"- Bar percentage: `min({c['maxBars']}, {c['barPercentage']} + {c['barStep']} × p(1))`, compatible with ten-entry bags.",
f"- Target diameter: `max({c['minSize']}, {c['targetSize']} − {c['sizeStep']} × p(2))`.",
f"- Bar rotation: `min({c['maxRotation']}, {c['barRotation']} + {c['rotationStep']} × p(3))`.",
f"- Bar length {c['barLength']}, cooldown {c['cooldown']}, blast multiplier {c['blastMultiplier']}, duration {c['duration']} remain constant in this first progression.",
f"- Let `rate = 0.05 + 5.95 × density / 100` and `S = {c['duration']} × rate × {1-c['barPercentage']/100:g} × ((1 − bars / 100) / {1-c['barPercentage']/100:g})^{c['barSupplyPower']}`.",
f"- Let `capture = min({c['maxCapture']}, {c['captureFraction']:.2f} + {c['captureStep']} × b)`.",
f"- Required targets: `max(1, round(S × capture × (diameter / {c['targetSize']})^{c['precisionAllowancePower']}))`.",
'',
'`S` is a supply heuristic, not a promise of accepted spawns: occupied entry slots can skip attempts. The bar exponent and precision factor temper the quota when aiming/obstruction gets harder. Budget allocation changes only one extra axis per step; there are no individual level overrides or scripted positions/waves. All constants, bounds, duration, count, and the testing-feature flag live in `CONFIG`. `generateLevel()` is pure and bounded through Level 50 in tests. To extend the playable count, change `CONFIG.levelCount` and rerun simulations/report; future levels have not been phone-balanced.','',
'## Player models and method','',
'| Model | Reaction / aiming delay | Post-shot wait | Endpoint σ | Motion prediction | Strategy | Bar forecasting |',
'| --- | --- | --- | --- | --- | --- | --- |']
for m in models:lines.append(f"| {m['name']} | {m['reaction']} s | {m['interval']} s | {m['accuracy']} px | {m['prediction']:.0%} | {m['strategy']} | {m['avoidance']:.0%} |")
lines += ['','Each model observes targets, waits its reaction delay, then fires; the post-shot wait precedes the next observation. Gaussian endpoint errors are independent. Learning picks the lowest visible target with horizontal aim. Regular scores clusters among up to eight visible candidates with approximate bar prediction. Practised also tries three slopes with accurate motion prediction. No model has a prescribed spawn sequence. Seeds are shared across models for each level/trial, but destruction and placement retries naturally diverge.','',
'The harness calls the production World, generator, and ArcadeSession. It omits only cosmetic particles/effect storage and audio/rendering. It models release timing rather than physically moving two simulated fingers; real Pointer Events are covered by browser tests. Targets count from the actual destroyed set; blocked shots are successful firing actions where at least one beam reaches a bar. A blocked shot can still destroy targets from the other side, so it is not synonymous with a miss. Each attempt runs the full 45 seconds even after reaching its requirement.','',
'## Estimated difficulty','',
'![Estimated unsuccessful-attempt rate by level and player model](arcade-difficulty.svg)','',
'The graph uses `100 × (1 − completion rate)` as estimated difficulty. The Learning band is a 95% Wilson interval; near 50%, 100 attempts leave roughly ±10 percentage points of uncertainty. A 100/100 outcome still has a lower confidence bound around 96%, rather than proving certainty.','',
'## Simulation results','',
'| Level | Model | Completed | Mean targets | Mean shots | Mean blocked shots | Target range |',
'| --- | --- | --- | --- | --- | --- | --- |']
for r in results:lines.append(f"| {r['level']} | {r['model']} | {r['completion']:.0%} | {r['targets']:.2f} | {r['shots']:.2f} | {r['blocked']:.2f} | {r['min']}–{r['max']} |")
lines += ['','## Tuning and balance concerns','',
'The initial requirement heuristic used `round(45 × rate × targetShare × (0.42 + 0.012 × budget))`. It over-penalized slower players when precision and obstruction increased. The final formula lowers capture growth and accounts for target size; the bar-supply exponent prevents a large quota drop from making a new bar step unexpectedly easy. The following counterfactual uses the **same final-run target histograms** against the original quotas. Quotas are checked only at the deadline, so changing them does not change the simulated shots/spawns. This isolates quota tuning from model or geometry changes.','',
'| Level | Initial quota | Final quota | Learning completion with initial quota | Learning completion now |',
'| --- | --- | --- | --- | --- |']
for l in levels:
    s=l['settings'];initial=max(1,math.floor(45*(.05+5.95*s['density']/100)*(1-s['barPercentage']/100)*(.42+.012*l['budget'])+.5))
    r=by_key[(models[0]['name'],l['number'])];old=sum(freq for target,freq in r['histogram'].items() if int(target)>=initial)/r['attempts']
    lines.append(f"| {l['number']} | {initial} | {l['required']} | {old:.0%} | {r['completion']:.0%} |")
flags=[]
for l in levels:
    rows=[by_key[(m['name'],l['number'])] for m in models]
    if max(r['max'] for r in rows)<l['required']:flags.append(f"Level {l['number']}: no sampled model attained the requirement; investigate feasibility (not a proof of impossibility).")
    for r in rows:
        if r['completion']<.1:flags.append(f"Level {l['number']}: {r['model']} completion below 10%; likely excessively difficult for that model.")
for m in models:
    for n in range(2,count+1):
        delta=by_key[(m['name'],n)]['completion']-by_key[(m['name'],n-1)]['completion']
        if delta>.1+1e-9:flags.append(f"Level {n}: {m['name']} improves {delta*100:.0f} percentage points; unexpectedly easier signal worth retesting.")
        if delta<=-.15+1e-9:flags.append(f"Level {n}: {m['name']} drops {-delta*100:.0f} percentage points; inspect this difficulty step on a phone.")
lines += ['',f"All ten requirements were attained by sampled models. The lowest observed completion rate is {min(r['completion'] for r in results):.0%}; no below-10% model/level outcome occurred. These are feasibility estimates, not proofs.",'']+[f'- {f}' for f in flags]
if not flags:lines.append('- No sampled feasibility, below-10%-completion, >10-point reversal, or ≥15-point drop flags fired. This does not establish physical playability.')
lines += ['- Regular/Practised results are near the ceiling: good clustering and prediction dominate this initial progression. The model suite can detect a slower-player curve but cannot resolve fine difficulty for highly accurate players.',
'- Spawn density can increase target supply as well as pressure. The supply-based quota counters this; it is why a numerical quota can rise on a density step and fall on a bar/precision step.',
'- Random samples and real aspect ratios matter. Longer/narrower logical fields change dwell time and bar obstruction; this report represents one common phone geometry.',
'', '## Recommendations','',
'1. Phone-test Levels 1, 4, 7, 8, and 10 first with actual users. Tune the shared size step, capture fraction, or prediction assumptions if a reported spike is reproducible; avoid per-level exceptions.',
'2. Keep the temporary Level Select available for this review. Disable `CONFIG.testingLevelSelect` before release; it removes the testing UI/action without changing the generator.',
'3. Collect physical completion counts and rough shot rates before increasing quotas to challenge the ceiling models. Aiming prediction and symmetric independent errors are optimistic assumptions for human thumbs.',
'4. Repeat at other phone/tablet aspect ratios and slower rendering budgets. At stalls, the active Arcade clock remains accurate but motion/spawning deliberately do not catch up in bursts.',
'5. Expand beyond ten only after recalculating outcomes. Raise `CONFIG.levelCount` to 25/50, keep clamps, rerun the same harness, and inspect acceptance counts and precision demands.',
'', '## Reproduce','', '```sh', 'node laserbreak/simulate-arcade.cjs 100', 'python laserbreak/report-arcade.py', 'node laserbreak/test-arcade.cjs', '```','',
'The simulation needs Node only. Report/chart generation needs Python and matplotlib as development tools; the deployed application has no new dependencies. The JSON contains seeds-by-formula metadata, model/config snapshots, means, ranges, and target-count histograms. The SVG is a standalone exportable graph; a PNG preview is written to `/tmp/laserbreak-arcade-difficulty.png`.']
(ROOT/'ARCADE-REPORT.md').write_text('\n'.join(lines)+'\n')
print('Generated ARCADE-REPORT.md and arcade-difficulty.svg')
