'use strict';
const E=require('./engine.js'),W=require('./weapons.js'),DT=1/120;
function tick(w,n,input={}){for(let i=0;i<n;i++)E.step(w,DT,input);}
function quiet(w){w.shotClock=w.diveClock=w.bossShotClock=w.bossDiveClock=w.bossMineClock=w.fieldMineClock=1e6;w.invulnerable=100;return w;}
function controlled(level=1,seed=17){const w=quiet(E.create(level,seed));w.enemies.forEach(e=>{e.mode='formation';e.x=e.homeX;e.y=e.homeY;});return w;}
function action(w){if(w.fireBlocked)tick(w,1);w.fireCooldown=0;E.step(w,DT,{fire:true});return w.shots.filter(s=>s.action.id===w.actionId);}
function impact(w,s,e){s.x=e.x;s.y=e.y+1;s.vx=0;s.vy=-440;tick(w,1);}
function hit(w,e){w.weapon=W.normal();impact(w,action(w)[0],e);}
function waitAnnouncement(w){if(w.state==='celebrating')tick(w,180);}
function killAll(w,onKill=()=>{}){
  let guard=0;
  while(w.state==='playing'||w.state==='celebrating'){
    if(++guard>500)throw Error('sector did not finish');
    if(w.state==='celebrating'){waitAnnouncement(w);continue;}
    const e=w.enemies[0];if(!e){tick(w,1);continue;}
    if(e.mode==='boss-entry'){tick(w,265);quiet(w);}
    while(e.hp>0&&w.state==='playing')hit(w,e);
    onKill(w);
  }
}
module.exports={E,W,DT,tick,quiet,controlled,action,impact,hit,waitAnnouncement,killAll};
