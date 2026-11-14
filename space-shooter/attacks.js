/* Original v0.3 attack paths. Simulation time/RNG only; no rendering or audio clocks. */
(function(root) {
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  const BOSSES=Object.freeze({5:[4,500],10:[6,750],15:[8,1000],20:[10,1250],25:[12,1500],30:[15,2000]});
  function makeBoss(level) {
    const stats=BOSSES[level]; if(!stats)return null;
    return {id:100,type:4,boss:true,rank:level/5,hp:stats[0],maxHp:stats[0],points:stats[1],
      homeX:180,homeY:38,x:180,y:-60,mode:'entry',age:0,delay:0};
  }
  const busy=w=>w.enemies.some(e=>e.mode==='telegraph'||e.mode==='dive');
  function beginReturn(e) {e.mode='return';e.age=0;e.returnX=clamp(e.x,-25,385);e.y=-30;}
  function returnToFormation(w,e) {
    const t=ease(e.age/1.3),hx=e.homeX+Math.sin(w.time*1.1)*w.config.sway;
    const hy=e.homeY+Math.sin(w.time*1.6+e.id*.4)*4;
    e.x=e.returnX+(hx-e.returnX)*t;e.y=-30+(hy+30)*t;
    if(e.age>=1.3){e.mode='formation';e.pattern=null;e.group=null;}
  }
  function scheduleSpecial(w,ready) {
    if(w.level<21||!ready.length)return false;
    const roll=w.random(),c=w.config;
    const kind=roll<c.fileChance?'file':roll<c.fileChance+c.kamikazeChance?'kamikaze':null;
    if(!kind)return false;
    let chosen,originY=130;
    if(kind==='file'){
      // Stage from one upper row, nearest-first. Mixed-row approaches can cross
      // each other before reaching the shared centerline, so they never queue.
      const row=[...new Set(ready.map(e=>e.homeY))].sort((a,b)=>a-b)
        .find(y=>y<=118&&ready.filter(e=>e.homeY===y).length>=3);
      if(row===undefined)return false;
      chosen=ready.filter(e=>e.homeY===row).sort((a,b)=>Math.abs(a.x-w.player.x)-Math.abs(b.x-w.player.x)).slice(0,c.fileCount);
      originY=row+72;
    }else chosen=[ready[Math.floor(w.random()*ready.length)]];
    const duration=2.8-(w.level-24)*.012;
    const group={id:++w.attackId,kind,launchAt:w.time+(kind==='kamikaze'?1.35:.9),target:null,
      origin:{x:clamp(w.player.x,70,290),y:originY},
      spacing:Math.max(.45,62/((520-originY)/duration)),duration,
      bend:w.player.x<180?52:-52};
    chosen.forEach((e,i)=>{
      e.mode='telegraph';e.pattern=kind;e.group=group;e.alignStart=null;e.origin=null;e.fileIndex=i;e.age=0;e.curved=true;
    });
    w.lastAttack=group;w.attackStats[kind]++;w.diveClock=c.diveInterval;
    return true;
  }
  function startBoss(w,e) {
    e.mode='telegraph';e.pattern='boss';e.age=0;
    e.group={id:++w.attackId,kind:'boss',launchAt:w.time+1.05,target:null};
    w.lastAttack=e.group;w.attackStats.boss++;
    w.bossDiveClock=12-e.rank*.5;
  }
  function bossFire(w,e,major=false) {
    // Ordinary enemies retain their own stream. All sources share a hard live cap.
    const count=e.rank>=4&&major?2:1;
    if(w.bullets.length+count>14)return;
    const target=e.group?.target;
    const center=major&&target?Math.atan2(target.x-e.x,Math.max(80,target.y-e.y)):0;
    for(let i=0;i<count;i++){
      const angle=center+(count===2?(i?1:-1)*.16:0),speed=w.config.bulletSpeed*.86;
      w.bullets.push({x:e.x,y:e.y+15,previousX:e.x,previousY:e.y+15,
        vx:Math.sin(angle)*speed,vy:Math.cos(angle)*speed,sourceType:4});
    }
    w.cues.push('enemyFire');
  }
  function filePoint(g,u){
    const targetU=(g.target.y-g.origin.y)/(520-g.origin.y);
    let x;
    if(u<=targetU){const t=clamp(u/targetU,0,1);x=g.origin.x+(g.target.x-g.origin.x)*ease(t)+Math.sin(Math.PI*t)*g.bend;}
    else{const t=clamp((u-targetU)/(1-targetU),0,1);x=g.target.x+Math.sin(Math.PI*t)*g.bend*.5;}
    return {x:clamp(x,18,342),y:g.origin.y+(520-g.origin.y)*u};
  }
  function update(w,e,dt) {
    if(!e.pattern)return false;
    e.age+=dt;
    const g=e.group;
    if(e.mode==='return'){returnToFormation(w,e);return true;}
    if(e.mode==='telegraph'){
      e.x=e.homeX+Math.sin(w.time*1.1)*w.config.sway;
      e.y=e.homeY+Math.sin(w.time*1.6+e.id*.4)*4;
      if(e.pattern==='kamikaze'&&w.time>=g.launchAt-.45){
        if(!e.alignStart){e.alignStart={x:e.x,y:e.y};e.origin={x:e.x,y:Math.min(e.y,105)};}
        e.x=e.origin.x;e.y=e.alignStart.y+(e.origin.y-e.alignStart.y)*ease((w.time-g.launchAt+.45)/.45);
      }
      if(w.time+1e-8>=g.launchAt&&!g.target)g.target=Object.freeze({x:w.player.x,y:w.player.y});
      const delay=e.pattern==='file'?e.fileIndex*g.spacing:0;
      if(w.time+1e-8>=g.launchAt+delay){
        e.mode='dive';e.age=0;e.startX=e.x;e.startY=e.y;
        if(e.pattern==='kamikaze'){
          e.origin=e.origin||{x:e.x,y:Math.min(e.y,105)};
          const distance=Math.hypot(g.target.x-e.origin.x,g.target.y-e.origin.y);
          e.direction={x:(g.target.x-e.origin.x)/distance,y:(g.target.y-e.origin.y)/distance};
        }
        w.cues.push(e.boss?'bossDive':'dive');
      }
      return true;
    }
    if(e.pattern==='kamikaze'){
      const t=e.age,a=380,max=430,cap=(max-70)/a;
      const distance=t<cap?70*t+a*t*t/2:70*cap+a*cap*cap/2+max*(t-cap);
      e.x=e.origin.x+e.direction.x*distance;e.y=e.origin.y+e.direction.y*distance;
      if(e.x<-30||e.x>390||e.y>515)beginReturn(e);
    }else if(e.pattern==='file'){
      if(e.age<.7){const t=ease(e.age/.7);e.x=e.startX+(g.origin.x-e.startX)*t;e.y=e.startY+(g.origin.y-e.startY)*t;}
      else{
        // A shared centerline, sampled at fixed offsets. Constant y speed guarantees
        // >60px separation in the player zone, even while the curve turns.
        const u=(e.age-.7)/g.duration;Object.assign(e,filePoint(g,u));
        if(u>=1)beginReturn(e);
      }
    }else if(e.pattern==='boss'){
      const duration=4.8-e.rank*.16,u=clamp(e.age/duration,0,1),arc=Math.sin(Math.PI*u)**2;
      const hx=e.homeX+Math.sin(w.time*1.1)*w.config.sway;
      const hy=e.homeY+Math.sin(w.time*1.6+e.id*.4)*4;
      e.x=e.startX+(hx-e.startX)*ease(u)+(clamp(g.target.x,80,280)-e.startX)*arc;
      e.x+=Math.sin(u*Math.PI*(e.rank>=4?4:2))*arc*(10+e.rank*2);
      e.y=e.startY+(hy-e.startY)*ease(u)+(190+e.rank*3-e.homeY)*arc;
      if(u>=.42&&!e.majorFired){e.majorFired=true;bossFire(w,e,true);}
      if(u>=1){e.mode='formation';e.pattern=null;e.group=null;e.majorFired=false;}
    }
    return true;
  }
  const api={BOSSES,makeBoss,busy,scheduleSpecial,startBoss,bossFire,filePoint,update};
  if(typeof module!=='undefined')module.exports=api;else root.GalactixAttacks=api;
})(typeof globalThis!=='undefined'?globalThis:this);
