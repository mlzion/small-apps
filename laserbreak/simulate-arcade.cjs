/* Seeded heuristic play estimates using the production World and ArcadeSession. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {World, W, H, barHit, circleHit} = require('./engine.js');
const {CONFIG, generateLevel, ArcadeSession} = require('./arcade.js');
const MODELS = Object.freeze([
  {name:'Learning', reaction:.65, accuracy:16, interval:1.25, prediction:.5, strategy:'urgent', avoidance:0},
  {name:'Regular', reaction:.5, accuracy:14, interval:1.1, prediction:.65, strategy:'cluster', avoidance:.45},
  {name:'Practised', reaction:.22, accuracy:5, interval:.8, prediction:1, strategy:'cluster', avoidance:1}
]);
function random(seed) {return () => {seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function gaussian(rng) {return Math.sqrt(-2*Math.log(Math.max(1e-9,rng())))*Math.cos(2*Math.PI*rng());}
function choose(world, model, rng) {
  const height=world.height;
  const targets=world.objects.filter(o=>o.type==='target'&&o.y>25&&o.y<height-25).sort((a,b)=>b.y-a.y);
  if(!targets.length)return null;
  const candidates=model.strategy==='urgent'?targets.slice(0,1):targets.slice(0,8);
  const bars=world.objects.filter(o=>o.type==='bar').map(o=>({...o,
    y:o.y+o.speed*model.reaction*model.avoidance,
    angle:o.angle+o.rotation*model.reaction*model.avoidance}));
  let best=null, bestScore=-Infinity;
  for(const target of candidates)for(const slope of model.avoidance===1?[-.24,0,.24]:[0]) {
    const y=target.y+target.speed*model.reaction*model.prediction;
    const a={x:0,y:y-slope*target.x},b={x:W,y:y+slope*(W-target.x)};
    if(a.y<0||a.y>height||b.y<0||b.y>height)continue;
    let left=1,right=1;
    if(model.avoidance)for(const bar of bars){const l=barHit(a,b,bar),r=barHit(b,a,bar);if(l!==null)left=Math.min(left,l);if(r!==null)right=Math.min(right,r);}
    const endA={x:W*left,y:a.y+(b.y-a.y)*left},endB={x:W*(1-right),y:b.y+(a.y-b.y)*right};
    let score=target.y/height;
    if(model.strategy==='cluster')for(const o of targets){
      const p={x:o.x,y:o.y+o.speed*model.reaction*model.prediction};
      const l=circleHit(a,endA,p,o.radius)!==null,r=circleHit(b,endB,p,o.radius)!==null;
      if(l||r)score+=1;if(l&&r)score+=.65;
    }
    if(score>bestScore){bestScore=score;best={left:a.y,right:b.y};}
  }
  if(!best)return null;
  // Independent thumb endpoint errors alter both height and angle.
  best.left=Math.max(0,Math.min(height,best.left+gaussian(rng)*model.accuracy));
  best.right=Math.max(0,Math.min(height,best.right+gaussian(rng)*model.accuracy));
  return best;
}
function attempt(level, model, seed, dt=1/60, height=573) {
  const world=new World(random(seed));
  world.height=height;
  world.fragments=()=>{}; // Cosmetic-only work is omitted; collision/spawning code is unchanged.
  const session=new ArcadeSession(world);session.setMode('arcade');session.begin(level);
  const rng=random(seed^0xa5366b4d);
  let nextDecision=.15, pending=null, lastFire=-Infinity;
  while(session.state==='playing') {
    if(pending&&world.time+1e-8>=pending.at){
      if(world.fire(pending.left,pending.right)){lastFire=world.time;world.effects.length=0;}
      pending=null;nextDecision=lastFire+Math.max(model.interval,world.settings.cooldown);
    }
    if(!pending&&world.time+1e-8>=nextDecision){
      const aim=choose(world,model,rng);
      if(aim)pending={...aim,at:world.time+model.reaction};else nextDecision=world.time+.1;
    }
    session.step(dt);
  }
  return {passed:session.lastResult.passed,targets:world.stats.targets,shots:world.stats.shots,blocked:world.stats.blockedShots};
}
function simulate(attempts=100, height=573) {
  const results=[];
  for(let level=1;level<=CONFIG.levelCount;level++)for(let m=0;m<MODELS.length;m++){
    let wins=0,targets=0,shots=0,blocked=0,min=Infinity,max=0;const histogram={};
    for(let trial=0;trial<attempts;trial++){
      const r=attempt(level,MODELS[m],(level*1000003+trial*9176+71)>>>0,1/60,height);
      histogram[r.targets]=(histogram[r.targets]||0)+1;
      wins+=Number(r.passed);targets+=r.targets;shots+=r.shots;blocked+=r.blocked;min=Math.min(min,r.targets);max=Math.max(max,r.targets);
    }
    results.push({level,model:MODELS[m].name,attempts,completion:wins/attempts,targets:targets/attempts,shots:shots/attempts,blocked:blocked/attempts,min,max,histogram});
  }
  return {simulation:{attemptsPerLevelModel:attempts,seedFormula:'(level * 1000003 + trial * 9176 + 71) >>> 0',playerSeedXor:'0xa5366b4d',cosmeticWorkOmitted:true},geometry:{width:W,height,dt:1/60},config:CONFIG,models:MODELS,levels:Array.from({length:CONFIG.levelCount},(_,i)=>generateLevel(i+1)),results};
}
if(require.main===module){
  const attempts=Number(process.argv[2]||100);
  if(!Number.isInteger(attempts)||attempts<1)throw Error('Attempt count must be positive');
  const report=simulate(attempts,Number(process.argv[4]||573));
  const output=process.argv[3]||path.join(__dirname,'arcade-simulation.json');
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  for(const r of report.results)console.log(`L${r.level} ${r.model.padEnd(9)} ${(r.completion*100).toFixed(0)}% targets=${r.targets.toFixed(1)} required=${report.levels[r.level-1].required} shots=${r.shots.toFixed(1)} blocked=${r.blocked.toFixed(1)}`);
}
module.exports={MODELS,random,choose,attempt,simulate};
