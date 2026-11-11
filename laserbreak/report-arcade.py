"""Export the production generator's seeded defense study; development tools only."""
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
c=report['config'];levels=report['levels'];models=report['models'];results=report['results']
count=c['levelCount'];attempts=results[0]['attempts'];x=list(range(1,count+1))
by_key={(r['model'],r['level']):r for r in results}
def wilson(rate,n):
    z=1.96;den=1+z*z/n;center=(rate+z*z/(2*n))/den
    half=z*math.sqrt(rate*(1-rate)/n+z*z/(4*n*n))/den
    return max(0,center-half),min(1,center+half)
plt.rcParams.update({'svg.hashsalt':'laserbreak-arcade','font.size':10})
fig,axes=plt.subplots(2,1,figsize=(11,8),sharex=True)
for idx,m in enumerate(models):
    rows=[by_key[(m['name'],n)] for n in x]
    axes[0].plot(x,[100*(1-r['completion']) for r in rows],label=m['name'],marker=['o','s','^'][idx],linewidth=1.5,markersize=4)
    axes[1].plot(x,[r['percent'] for r in rows],label=m['name'],marker=['o','s','^'][idx],linewidth=1.5,markersize=4)
    if idx==0:
        bounds=[wilson(r['completion'],r['attempts']) for r in rows]
        axes[0].fill_between(x,[100*(1-hi) for lo,hi in bounds],[100*(1-lo) for lo,hi in bounds],alpha=.13)
axes[1].plot(x,[l['requiredDestructionPercent'] for l in levels],color='black',linestyle='--',label='Required defense',linewidth=2)
for ax in axes:
    for l in levels:
        if l['number']>1 and (l['number']-1)%c['plateauEvery']==0:ax.axvspan(l['number']-.2,l['number']+.2,color='#777777',alpha=.08)
    ax.set(ylim=(-3,103),xticks=x);ax.grid(alpha=.2);ax.legend(loc='best')
axes[0].set(ylabel='Estimated difficulty (% failed)',title=f'LaserBreak · {attempts} seeded attempts per model per level')
axes[1].set(ylabel='Mean destruction percentage',xlabel='Level')
fig.text(.5,.01,'Learning band: 95% Wilson interval. Gray: physical-budget plateaus. Estimates require physical-phone validation.',ha='center',fontsize=9)
fig.tight_layout(rect=(0,.035,1,1));fig.savefig(ROOT/'arcade-difficulty.svg',metadata={'Date':None})
svg=ROOT/'arcade-difficulty.svg'
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines())+'\n')
fig.savefig('/tmp/laserbreak-arcade-difficulty.png',dpi=150)
lines=['# LaserBreak — 25-level defense progression report','',
f"**{len(results)*attempts:,} simulated games:** {attempts} attempts × {count} levels × {len(models)} unchanged player models. Production World, ArcadeSession, scoring, clearance, shuffle bags and generator are exercised at 60 Hz on a {report['geometry']['width']} × {report['geometry']['height']} logical field (approximately an 844×390 landscape phone). Rendering/audio/cosmetic particle storage are omitted. These estimates do not confirm physical-phone performance or human playability.",'',
'All physical settings for Levels 1–10 are unchanged, verified against the prior implementation fixture. Levels 11–25 extend the same formulas with no overrides. Quotas are removed. Passing now uses the generated 40%→80% threshold at the 45-second deadline; zero resolved targets always fails. Active targets are excluded.','',
'## All generated levels','',
'| Level | Physical budget | Target Ø | Target fall | Bar fall | Density % | Bars % | Rotation °/s | Required defense % |',
'| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
for l in levels:
    s=l['settings'];lines.append(f"| {l['number']} | {l['budget']} | {s['targetSize']} | {s['targetSpeed']:.2f} | {s['barSpeed']:.2f} | {s['density']} | {s['barPercentage']} | {s['barRotation']} | {l['requiredDestructionPercent']} |")
lines+=['',f"Every level: {c['duration']} active seconds, bar length {c['barLength']}, thickness 12, cooldown {c['cooldown']} s, blast multiplier {c['blastMultiplier']}×. Dimensions/speeds are logical px and px/s. Sound/debug are user preferences.",'',
'## Central formulas','',
'For positive integer `L`, use `n=L−1`, `b=n−floor(n/4)`, and `p(j)=floor(b/4)+indicator(b mod 4 > j)` for axes 0–3. Three physical budget points per four steps; each changes one additional axis. Falling speeds still rise on plateaus. All configuration lives in `arcade.js:CONFIG`.','',
f"- Target speed `min({c['maxTargetSpeed']}, {c['targetSpeed']}×{c['speedRate']}^n)`; bar speed `min({c['maxBarSpeed']}, {c['barSpeed']}×{c['speedRate']}^n)`.",
f"- Density `min({c['maxDensity']}, {c['density']}+{c['densityStep']}×p(0))`.",
f"- Bars `min({c['maxBars']}, {c['barPercentage']}+{c['barStep']}×p(1))`, preserving ten-entry bags.",
f"- Target diameter `max({c['minSize']}, {c['targetSize']}−{c['sizeStep']}×p(2))`.",
f"- Rotation `min({c['maxRotation']}, {c['barRotation']}+{c['rotationStep']}×p(3))`.",
'- Threshold budget `u(n)=2×(n−b)+p(0)+p(3)`. Its configured weights are plateau=2, soft (density/rotation)=1, hard (bars/size)=0.',
'- `requiredDestructionPercent=roundToTenth(40+40×min(1,u(n)/u(24)))`; `u(24)=21`. Start, end, ramp length and weights are configurable. Physical bounds and threshold saturation allow extension beyond Level 25 without new level definitions.',
'- Threshold rises about 1.9 percentage points on soft steps and 3.8 on physical plateaus; it holds during bar/size steps. Thus larger threshold changes do not coincide with added physical difficulty. Speeds continue their modest 2% growth.',
'- Actual defense is `destroyed/(destroyed+escaped)×100`. Pass compares integer cross-products to the tenth-percent threshold, avoiding floating-point boundary errors. No resolved targets means no pass. No early success/failure gate.',
'',
'## Player models and method','',
'| Model | Reaction s | Post-shot wait s | Endpoint σ px | Prediction | Strategy | Bar forecasting |',
'| --- | --- | --- | --- | --- | --- | --- |']
for m in models:lines.append(f"| {m['name']} | {m['reaction']} | {m['interval']} | {m['accuracy']} | {m['prediction']:.0%} | {m['strategy']} | {m['avoidance']:.0%} |")
lines+=['',
'Each model observes, waits reaction time, fires with independent Gaussian endpoint errors, then waits its firing interval. Learning selects the lowest target horizontally; Regular scores clusters among up to eight candidates with approximate bar prediction; Practised also tries three slopes with accurate prediction. Release timing is modeled, while real Pointer Events are tested separately. The models and physical formulas were not adjusted to manufacture completion rates.','',
'Seed `(level×1000003 + trial×9176 + 71) >>> 0` is shared across models; player randomness uses XOR `0xa5366b4d`. Destruction and placement retries naturally diverge. A blocked shot is a successful firing action with at least one beam reaching a bar, and can still destroy targets. Each game runs all 45 active seconds. Entirely departed circles count as escaped; unresolved targets at the deadline do not count. Joint destroyed/escaped histograms permit exact outcome reproduction. Mean percentages are per-attempt means, not a ratio of pooled totals; zero-resolved attempts contribute zero and are separately recorded.','',
'## Difficulty graph','',
'![Difficulty, mean defense, and required threshold](arcade-difficulty.svg)','',
'Estimated difficulty is failed-attempt percentage. The Learning band is a 95% Wilson interval; 100 trials near 50% have roughly ±10 percentage points uncertainty. A 100/100 completion rate has a lower bound around 96%, not proof of certainty.','',
'## Completion and shot metrics','',
'| Level | Model | Completed | Mean destroyed | Mean escaped | Mean defense % | Mean shots | Mean blocked |',
'| --- | --- | --- | --- | --- | --- | --- | --- |']
for r in results:lines.append(f"| {r['level']} | {r['model']} | {r['completion']:.0%} | {r['targets']:.2f} | {r['escaped']:.2f} | {r['percent']:.2f} | {r['shots']:.2f} | {r['blocked']:.2f} |")
lines+=['','## Balance findings','',
'Every level was passed by a sampled model; Practised passed 100/100 at every level. None is demonstrated impossible. This strong model is optimistic about human prediction and cannot establish phone playability. Learning falls below 10% from Level 11; Regular reaches 0% at Levels 23–25. Later levels are substantially harder, and likely excessive for those slower strategies. The progression is not smoothly monotonic in estimated difficulty despite smooth generated parameters.','',
'| Model | Level | Change in completion | Interpretation |','| --- | --- | --- | --- |']
for m in models:
    for n in range(2,count+1):
        delta=by_key[(m['name'],n)]['completion']-by_key[(m['name'],n-1)]['completion']
        if delta>.1+1e-9 or delta<=-.15+1e-9:lines.append(f"| {m['name']} | {n} | {delta*100:+.0f} pp | {'Unexpectedly easier' if delta>0 else 'Difficulty spike'} |")
lines+=['',
'Bar-share increases can reduce target workload as well as obstruct shots: Regular improves 29 points at Level 14 and 37 at Level 19. Density increases can also supply more explosion clusters. Discrete target outcomes make percentage thresholds nonlinear. These are balance concerns, not excuses to hand-tune individual levels. No per-level tuning or scripted waves were introduced.','',
'## Recommendations','',
'1. Phone-test Levels 1, 10, 11, 13, 14, 18, 19, 23 and 25 with several players. Record resolved counts and defense, especially the apparent bar-step reversals.',
'2. If reproduced, tune shared post-Level-10 density/rotation/size budget increments or bounds; keep the historical first ten physical settings fixed. Consider smaller, more frequent bar increments only with a bag system that supports them. Retest all levels after a shared change.',
'3. Keep the intended approximately 40%→80% threshold ramp. Its shared weights/ramp shape can shift increases toward currently easier budget steps, but avoid coupling large threshold increases to large physical changes. Treat these as initial guidelines, not a finished balance.',
'4. Calibrate prediction/error/reaction models against real players before tuning to the ceiling Practised model. Repeat on other phone aspect ratios: dwell time, accepted spawning and obstruction depend on geometry.',
'5. Keep temporary Level Select during review; disable `CONFIG.testingLevelSelect` before release. For future expansion, change count and ramp policy deliberately and rerun the same study. Current thresholds saturate at 80% after Level 25.',
'', '## Reproduce','', '```sh','node laserbreak/simulate-arcade.cjs 100','python laserbreak/report-arcade.py','node laserbreak/test-arcade.cjs','```','',
'Node runs the simulation; Python/matplotlib export the report and standalone SVG (PNG preview in `/tmp/laserbreak-arcade-difficulty.png`). These are development tools, not deployed dependencies. Raw configuration, seeds, means, ranges, unresolved counts and joint histograms are in [arcade-simulation.json](arcade-simulation.json).']
(ROOT/'ARCADE-REPORT.md').write_text('\n'.join(lines)+'\n')
print('Generated ARCADE-REPORT.md and arcade-difficulty.svg')
