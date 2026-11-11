# LaserBreak — 25-level defense progression report

**7,500 simulated games:** 100 attempts × 25 levels × 3 unchanged player models. Production World, ArcadeSession, scoring, clearance, shuffle bags and generator are exercised at 60 Hz on a 1000 × 573 logical field (approximately an 844×390 landscape phone). Rendering/audio/cosmetic particle storage are omitted. These estimates do not confirm physical-phone performance or human playability.

All physical settings for Levels 1–10 are unchanged, verified against the prior implementation fixture. Levels 11–25 extend the same formulas with no overrides. Quotas are removed. Passing now uses the generated 40%→80% threshold at the 45-second deadline; zero resolved targets always fails. Active targets are excluded.

## All generated levels

| Level | Physical budget | Target Ø | Target fall | Bar fall | Density % | Bars % | Rotation °/s | Required defense % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 40 | 50.00 | 35.00 | 20 | 20 | 45 | 40 |
| 2 | 1 | 40 | 51.00 | 35.70 | 23 | 20 | 45 | 41.9 |
| 3 | 2 | 40 | 52.02 | 36.41 | 23 | 30 | 45 | 41.9 |
| 4 | 3 | 38 | 53.06 | 37.14 | 23 | 30 | 45 | 41.9 |
| 5 | 3 | 38 | 54.12 | 37.89 | 23 | 30 | 45 | 45.7 |
| 6 | 4 | 38 | 55.20 | 38.64 | 23 | 30 | 53 | 47.6 |
| 7 | 5 | 38 | 56.31 | 39.42 | 26 | 30 | 53 | 49.5 |
| 8 | 6 | 38 | 57.43 | 40.20 | 26 | 40 | 53 | 49.5 |
| 9 | 6 | 38 | 58.58 | 41.01 | 26 | 40 | 53 | 53.3 |
| 10 | 7 | 36 | 59.75 | 41.83 | 26 | 40 | 53 | 53.3 |
| 11 | 8 | 36 | 60.95 | 42.66 | 26 | 40 | 61 | 55.2 |
| 12 | 9 | 36 | 62.17 | 43.52 | 29 | 40 | 61 | 57.1 |
| 13 | 9 | 36 | 63.41 | 44.39 | 29 | 40 | 61 | 61 |
| 14 | 10 | 36 | 64.68 | 45.28 | 29 | 50 | 61 | 61 |
| 15 | 11 | 34 | 65.97 | 46.18 | 29 | 50 | 61 | 61 |
| 16 | 12 | 34 | 67.29 | 47.11 | 29 | 50 | 69 | 62.9 |
| 17 | 12 | 34 | 68.64 | 48.05 | 29 | 50 | 69 | 66.7 |
| 18 | 13 | 34 | 70.01 | 49.01 | 32 | 50 | 69 | 68.6 |
| 19 | 14 | 34 | 71.41 | 49.99 | 32 | 60 | 69 | 68.6 |
| 20 | 15 | 32 | 72.84 | 50.99 | 32 | 60 | 69 | 68.6 |
| 21 | 15 | 32 | 74.30 | 52.01 | 32 | 60 | 69 | 72.4 |
| 22 | 16 | 32 | 75.78 | 53.05 | 32 | 60 | 77 | 74.3 |
| 23 | 17 | 32 | 77.30 | 54.11 | 35 | 60 | 77 | 76.2 |
| 24 | 18 | 32 | 78.84 | 55.19 | 35 | 60 | 77 | 76.2 |
| 25 | 18 | 32 | 80.42 | 56.30 | 35 | 60 | 77 | 80 |

Every level: 45 active seconds, bar length 100, thickness 12, cooldown 0.75 s, blast multiplier 3×. Dimensions/speeds are logical px and px/s. Sound/debug are user preferences.

## Central formulas

For positive integer `L`, use `n=L−1`, `b=n−floor(n/4)`, and `p(j)=floor(b/4)+indicator(b mod 4 > j)` for axes 0–3. Three physical budget points per four steps; each changes one additional axis. Falling speeds still rise on plateaus. All configuration lives in `arcade.js:CONFIG`.

- Target speed `min(140, 50×1.02^n)`; bar speed `min(110, 35×1.02^n)`.
- Density `min(60, 20+3×p(0))`.
- Bars `min(60, 20+10×p(1))`, preserving ten-entry bags.
- Target diameter `max(24, 40−2×p(2))`.
- Rotation `min(140, 45+8×p(3))`.
- Threshold budget `u(n)=2×(n−b)+p(0)+p(3)`. Its configured weights are plateau=2, soft (density/rotation)=1, hard (bars/size)=0.
- `requiredDestructionPercent=roundToTenth(40+40×min(1,u(n)/u(24)))`; `u(24)=21`. Start, end, ramp length and weights are configurable. Physical bounds and threshold saturation allow extension beyond Level 25 without new level definitions.
- Threshold rises about 1.9 percentage points on soft steps and 3.8 on physical plateaus; it holds during bar/size steps. Thus larger threshold changes do not coincide with added physical difficulty. Speeds continue their modest 2% growth.
- Actual defense is `destroyed/(destroyed+escaped)×100`. Pass compares integer cross-products to the tenth-percent threshold, avoiding floating-point boundary errors. No resolved targets means no pass. No early success/failure gate.

## Player models and method

| Model | Reaction s | Post-shot wait s | Endpoint σ px | Prediction | Strategy | Bar forecasting |
| --- | --- | --- | --- | --- | --- | --- |
| Learning | 0.65 | 1.25 | 16 | 50% | urgent | 0% |
| Regular | 0.5 | 1.1 | 14 | 65% | cluster | 45% |
| Practised | 0.22 | 0.8 | 5 | 100% | cluster | 100% |

Each model observes, waits reaction time, fires with independent Gaussian endpoint errors, then waits its firing interval. Learning selects the lowest target horizontally; Regular scores clusters among up to eight candidates with approximate bar prediction; Practised also tries three slopes with accurate prediction. Release timing is modeled, while real Pointer Events are tested separately. The models and physical formulas were not adjusted to manufacture completion rates.

Seed `(level×1000003 + trial×9176 + 71) >>> 0` is shared across models; player randomness uses XOR `0xa5366b4d`. Destruction and placement retries naturally diverge. A blocked shot is a successful firing action with at least one beam reaching a bar, and can still destroy targets. Each game runs all 45 active seconds. Entirely departed circles count as escaped; unresolved targets at the deadline do not count. Joint destroyed/escaped histograms permit exact outcome reproduction. Mean percentages are per-attempt means, not a ratio of pooled totals; zero-resolved attempts contribute zero and are separately recorded.

## Difficulty graph

![Difficulty, mean defense, and required threshold](arcade-difficulty.svg)

Estimated difficulty is failed-attempt percentage. The Learning band is a 95% Wilson interval; 100 trials near 50% have roughly ±10 percentage points uncertainty. A 100/100 completion rate has a lower bound around 96%, not proof of certainty.

## Completion and shot metrics

| Level | Model | Completed | Mean destroyed | Mean escaped | Mean defense % | Mean shots | Mean blocked |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Learning | 99% | 21.77 | 13.33 | 62.03 | 23.90 | 9.59 |
| 1 | Regular | 100% | 28.51 | 7.09 | 80.12 | 27.97 | 5.23 |
| 1 | Practised | 100% | 44.80 | 0.00 | 100.00 | 41.07 | 13.14 |
| 2 | Learning | 100% | 24.05 | 16.21 | 59.72 | 23.98 | 10.16 |
| 2 | Regular | 100% | 31.25 | 9.87 | 76.00 | 27.98 | 5.41 |
| 2 | Practised | 100% | 50.41 | 0.00 | 100.00 | 42.38 | 12.44 |
| 3 | Learning | 98% | 21.36 | 13.98 | 60.45 | 23.94 | 13.98 |
| 3 | Regular | 100% | 28.45 | 8.12 | 77.81 | 27.94 | 9.54 |
| 3 | Practised | 100% | 44.17 | 0.00 | 100.00 | 41.19 | 19.50 |
| 4 | Learning | 91% | 19.65 | 16.11 | 54.96 | 23.96 | 13.39 |
| 4 | Regular | 100% | 26.79 | 9.92 | 72.99 | 27.95 | 8.89 |
| 4 | Practised | 100% | 44.20 | 0.00 | 100.00 | 41.34 | 19.09 |
| 5 | Learning | 85% | 19.02 | 16.72 | 53.22 | 23.96 | 13.54 |
| 5 | Regular | 100% | 26.20 | 10.61 | 71.17 | 27.95 | 9.18 |
| 5 | Practised | 100% | 44.22 | 0.00 | 100.00 | 41.16 | 18.08 |
| 6 | Learning | 73% | 19.20 | 16.87 | 53.24 | 23.98 | 12.99 |
| 6 | Regular | 100% | 26.62 | 10.35 | 72.00 | 27.95 | 8.63 |
| 6 | Practised | 100% | 44.31 | 0.00 | 100.00 | 41.34 | 17.74 |
| 7 | Learning | 60% | 20.65 | 19.60 | 51.33 | 23.96 | 13.30 |
| 7 | Regular | 100% | 28.43 | 12.96 | 68.72 | 27.99 | 9.66 |
| 7 | Practised | 100% | 49.30 | 0.00 | 100.00 | 42.53 | 17.58 |
| 8 | Learning | 61% | 17.67 | 16.72 | 51.45 | 23.89 | 16.65 |
| 8 | Regular | 100% | 25.53 | 10.05 | 71.79 | 27.92 | 13.64 |
| 8 | Practised | 100% | 42.14 | 0.00 | 100.00 | 40.84 | 23.31 |
| 9 | Learning | 39% | 17.37 | 17.42 | 49.98 | 23.95 | 16.75 |
| 9 | Regular | 97% | 24.78 | 11.14 | 69.02 | 27.92 | 14.27 |
| 9 | Practised | 100% | 42.06 | 0.00 | 100.00 | 40.69 | 22.71 |
| 10 | Learning | 20% | 15.92 | 19.00 | 45.61 | 23.86 | 15.84 |
| 10 | Regular | 96% | 23.91 | 12.04 | 66.52 | 27.89 | 13.51 |
| 10 | Practised | 100% | 42.38 | 0.01 | 99.98 | 40.83 | 22.12 |
| 11 | Learning | 7% | 15.66 | 19.44 | 44.63 | 23.90 | 15.80 |
| 11 | Regular | 96% | 23.69 | 12.32 | 65.80 | 27.93 | 13.43 |
| 11 | Practised | 100% | 42.32 | 0.00 | 100.00 | 40.81 | 21.94 |
| 12 | Learning | 0% | 16.57 | 22.06 | 42.92 | 23.98 | 16.42 |
| 12 | Regular | 82% | 24.87 | 14.66 | 62.92 | 27.97 | 14.44 |
| 12 | Practised | 100% | 46.08 | 0.01 | 99.98 | 42.15 | 21.38 |
| 13 | Learning | 0% | 16.05 | 22.83 | 41.34 | 23.94 | 16.53 |
| 13 | Regular | 53% | 24.48 | 15.32 | 61.53 | 27.97 | 14.04 |
| 13 | Practised | 100% | 46.49 | 0.06 | 99.87 | 42.20 | 20.43 |
| 14 | Learning | 0% | 13.26 | 18.86 | 41.34 | 23.90 | 18.38 |
| 14 | Regular | 82% | 22.04 | 10.98 | 66.77 | 27.89 | 18.54 |
| 14 | Practised | 100% | 38.43 | 0.01 | 99.97 | 39.60 | 26.66 |
| 15 | Learning | 0% | 12.19 | 20.36 | 37.43 | 23.86 | 18.19 |
| 15 | Regular | 58% | 20.47 | 12.83 | 61.48 | 27.91 | 18.21 |
| 15 | Practised | 100% | 38.43 | 0.02 | 99.95 | 39.42 | 26.26 |
| 16 | Learning | 1% | 11.93 | 20.46 | 36.87 | 23.92 | 18.01 |
| 16 | Regular | 37% | 20.17 | 12.99 | 60.86 | 27.91 | 18.09 |
| 16 | Practised | 100% | 38.55 | 0.00 | 100.00 | 39.54 | 25.89 |
| 17 | Learning | 0% | 11.06 | 21.87 | 33.64 | 23.95 | 18.45 |
| 17 | Regular | 20% | 20.27 | 13.26 | 60.48 | 27.95 | 18.08 |
| 17 | Practised | 100% | 38.47 | 0.00 | 100.00 | 39.60 | 25.43 |
| 18 | Learning | 0% | 12.30 | 23.28 | 34.57 | 23.91 | 18.33 |
| 18 | Regular | 3% | 20.65 | 15.40 | 57.35 | 27.99 | 18.84 |
| 18 | Practised | 100% | 41.75 | 0.01 | 99.98 | 40.77 | 25.65 |
| 19 | Learning | 0% | 9.60 | 18.08 | 34.71 | 23.76 | 19.67 |
| 19 | Regular | 40% | 18.72 | 9.77 | 65.77 | 27.79 | 21.86 |
| 19 | Practised | 100% | 32.89 | 0.02 | 99.94 | 36.29 | 27.33 |
| 20 | Learning | 0% | 8.92 | 19.13 | 31.81 | 23.83 | 19.81 |
| 20 | Regular | 17% | 17.39 | 11.25 | 60.73 | 27.86 | 21.75 |
| 20 | Practised | 100% | 33.30 | 0.00 | 100.00 | 36.60 | 26.98 |
| 21 | Learning | 0% | 8.07 | 20.50 | 28.23 | 23.82 | 19.41 |
| 21 | Regular | 6% | 17.03 | 12.12 | 58.46 | 27.85 | 21.67 |
| 21 | Practised | 100% | 33.08 | 0.00 | 100.00 | 36.54 | 26.69 |
| 22 | Learning | 0% | 8.29 | 20.18 | 29.14 | 23.81 | 19.64 |
| 22 | Regular | 4% | 16.42 | 12.67 | 56.45 | 27.85 | 21.47 |
| 22 | Practised | 100% | 33.24 | 0.00 | 100.00 | 36.62 | 26.74 |
| 23 | Learning | 0% | 8.09 | 22.52 | 26.42 | 23.86 | 19.70 |
| 23 | Regular | 0% | 16.98 | 14.21 | 54.47 | 27.88 | 22.43 |
| 23 | Practised | 100% | 35.21 | 0.04 | 99.89 | 38.48 | 28.22 |
| 24 | Learning | 0% | 8.13 | 23.04 | 26.10 | 23.82 | 19.43 |
| 24 | Regular | 0% | 16.37 | 15.20 | 51.88 | 27.90 | 21.48 |
| 24 | Practised | 100% | 35.78 | 0.01 | 99.97 | 38.77 | 27.96 |
| 25 | Learning | 0% | 7.89 | 23.25 | 25.32 | 23.81 | 19.63 |
| 25 | Regular | 0% | 16.22 | 15.28 | 51.53 | 27.89 | 22.02 |
| 25 | Practised | 100% | 35.81 | 0.03 | 99.92 | 38.26 | 26.95 |

## Balance findings

Every level was passed by a sampled model; Practised passed 100/100 at every level. None is demonstrated impossible. This strong model is optimistic about human prediction and cannot establish phone playability. Learning falls below 10% from Level 11; Regular reaches 0% at Levels 23–25. Later levels are substantially harder, and likely excessive for those slower strategies. The progression is not smoothly monotonic in estimated difficulty despite smooth generated parameters.

| Model | Level | Change in completion | Interpretation |
| --- | --- | --- | --- |
| Learning | 9 | -22 pp | Difficulty spike |
| Learning | 10 | -19 pp | Difficulty spike |
| Regular | 13 | -29 pp | Difficulty spike |
| Regular | 14 | +29 pp | Unexpectedly easier |
| Regular | 15 | -24 pp | Difficulty spike |
| Regular | 16 | -21 pp | Difficulty spike |
| Regular | 17 | -17 pp | Difficulty spike |
| Regular | 18 | -17 pp | Difficulty spike |
| Regular | 19 | +37 pp | Unexpectedly easier |
| Regular | 20 | -23 pp | Difficulty spike |

Bar-share increases can reduce target workload as well as obstruct shots: Regular improves 29 points at Level 14 and 37 at Level 19. Density increases can also supply more explosion clusters. Discrete target outcomes make percentage thresholds nonlinear. These are balance concerns, not excuses to hand-tune individual levels. No per-level tuning or scripted waves were introduced.

## Recommendations

1. Phone-test Levels 1, 10, 11, 13, 14, 18, 19, 23 and 25 with several players. Record resolved counts and defense, especially the apparent bar-step reversals.
2. If reproduced, tune shared post-Level-10 density/rotation/size budget increments or bounds; keep the historical first ten physical settings fixed. Consider smaller, more frequent bar increments only with a bag system that supports them. Retest all levels after a shared change.
3. Keep the intended approximately 40%→80% threshold ramp. Its shared weights/ramp shape can shift increases toward currently easier budget steps, but avoid coupling large threshold increases to large physical changes. Treat these as initial guidelines, not a finished balance.
4. Calibrate prediction/error/reaction models against real players before tuning to the ceiling Practised model. Repeat on other phone aspect ratios: dwell time, accepted spawning and obstruction depend on geometry.
5. Keep temporary Level Select during review; disable `CONFIG.testingLevelSelect` before release. For future expansion, change count and ramp policy deliberately and rerun the same study. Current thresholds saturate at 80% after Level 25.

## Reproduce

```sh
node laserbreak/simulate-arcade.cjs 100
python laserbreak/report-arcade.py
node laserbreak/test-arcade.cjs
```

Node runs the simulation; Python/matplotlib export the report and standalone SVG (PNG preview in `/tmp/laserbreak-arcade-difficulty.png`). These are development tools, not deployed dependencies. Raw configuration, seeds, means, ranges, unresolved counts and joint histograms are in [arcade-simulation.json](arcade-simulation.json).
