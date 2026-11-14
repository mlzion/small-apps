/* Weapon inventory, deterministic drops and emitted specials; no DOM/audio. */
(function(root){
  'use strict';
  const DEFS=Object.freeze({
    normal:Object.freeze({name:'Single Shot',rank:0,color:null,duration:0}),
    shield:Object.freeze({name:'Shield',rank:0,color:'#70e79c',duration:0}),
    rapid:Object.freeze({name:'Rapid Fire',rank:1,color:'#ffda63',duration:8,unlock:5}),
    spread:Object.freeze({name:'Dual Spread',rank:2,color:'#75acff',duration:10,unlock:10}),
    double:Object.freeze({name:'Double Barrel',rank:3,color:'#c497ff',duration:10,unlock:15}),
    laser:Object.freeze({name:'Laser',rank:4,color:'#ffac65',duration:0,unlock:20}),
    mine:Object.freeze({name:'Mine',rank:5,color:'#ff91cb',duration:0,unlock:25})
  });
  const OFFENSE=Object.freeze(['rapid','spread','double','laser','mine']);
  const normal=()=>({kind:'normal',remaining:0,charges:0});
  function campaignForSector(level){
    const unlocked=OFFENSE.filter(k=>DEFS[k].unlock<level);
    return {unlocked,rewarded:unlocked.map(k=>DEFS[k].unlock)};
  }
  function cloneCampaign(c){return {unlocked:OFFENSE.filter(k=>c.unlocked.includes(k)),rewarded:[...new Set(c.rewarded.filter(n=>[5,10,15,20,25].includes(n)))]};}
  function cancelSpecials(w){w.beam=null;w.playerMine=null;}
  function equip(w,kind){
    if(kind==='shield'){w.shield=true;return true;}
    if(!OFFENSE.includes(kind)||!w.campaign.unlocked.includes(kind))return false;
    cancelSpecials(w);w.fireCooldown=0;
    w.weapon={kind,remaining:DEFS[kind].duration,charges:DEFS[kind].duration?0:1};
    return true;
  }
  function tick(w,dt){
    if(w.weapon.remaining>0){
      w.weapon.remaining=Math.max(0,w.weapon.remaining-dt);
      if(!w.weapon.remaining){w.events.push(DEFS[w.weapon.kind].name+' expired');w.weapon=normal();}
    }
    for(const blast of w.blasts)blast.age+=dt;
    w.blasts=w.blasts.filter(b=>b.age<b.duration);
  }
  function fire(w,action){
    const kind=w.weapon.kind;
    if(kind==='laser'){
      cancelSpecials(w);w.beam={born:w.time,age:0,duration:.25,kills:0,limit:3,hit:[],action,width:8};
      w.weapon=normal();w.cues.push('laser');return;
    }
    if(kind==='mine'){
      cancelSpecials(w);w.playerMine={x:w.player.x,y:w.player.y-20,age:0,action,radius:72};
      w.weapon=normal();w.cues.push('mineDeploy');return;
    }
    const angles=kind==='spread'?[-2.5,2.5]:kind==='double'?[0,0]:[0];
    angles.forEach((degrees,i)=>{
      const angle=degrees*Math.PI/180,x=w.player.x+(kind==='double'?(i?6:-6):0);
      w.shots.push({x,y:w.player.y-18,previousX:x,previousY:w.player.y-18,vx:Math.sin(angle)*440,vy:-Math.cos(angle)*440,action});
    });
    w.cues.push('fire');
  }
  const radius=e=>e.boss?24:e.type===1?14:16;
  const visible=e=>e.y+radius(e)>=0;
  function updateSpecials(w,dt,hit){
    const beam=w.beam;
    if(beam){
      beam.age=Math.max(0,w.time-beam.born);
      // Visible for exactly .25s, including its activation step. One hit per target,
      // two HP damage; the budget counts destructions, including a weakened boss.
      if(beam.age<=beam.duration+1e-9){
        const candidates=w.enemies.filter(e=>visible(e)&&!beam.hit.includes(e.id)&&Math.abs(e.x-w.player.x)<=radius(e)+beam.width/2&&e.y<=w.player.y-18+radius(e)).sort((a,b)=>b.y-a.y||a.id-b.id);
        for(const e of candidates){
          if(beam.kills>=beam.limit||w.state!=='playing')break;
          beam.hit.push(e.id);if(hit(e,2,beam.action))beam.kills++;
        }
      }
      if(w.beam===beam&&beam.age>=beam.duration-1e-9)w.beam=null;
    }
    const mine=w.playerMine;
    if(mine&&w.state==='playing'){
      mine.age+=dt;mine.y-=210*dt;
      const close=w.enemies.some(e=>visible(e)&&Math.hypot(e.x-mine.x,e.y-mine.y)<=mine.radius);
      if((mine.age>=.25&&close)||mine.age>=1.6||mine.y<=100){
        w.playerMine=null;w.cues.push('mineBlast');
        w.blasts.push({kind:'player',x:mine.x,y:mine.y,radius:mine.radius,age:0,duration:.4});
        let kills=0;
        const candidates=w.enemies.filter(e=>visible(e)&&Math.hypot(e.x-mine.x,e.y-mine.y)<=mine.radius+radius(e)).sort((a,b)=>Math.hypot(a.x-mine.x,a.y-mine.y)-Math.hypot(b.x-mine.x,b.y-mine.y)||a.id-b.id);
        for(const e of candidates){if(kills>=4||w.state!=='playing')break;if(hit(e,2,mine.action))kills++;}
        w.lastMine={kills,actionId:mine.action.id};
      }
    }
  }
  function drop(w,kind,e){
    if(w.pickups.length>=3){
      if(kind!=='shield'){w.dropStats.skipped++;return;}
      w.pickups.shift();
    }
    w.pickups.push({kind,x:Math.max(42,Math.min(318,e.x)),y:Math.max(25,Math.min(220,e.y)),age:0});w.dropStats.spawned++;
    w.events.push(DEFS[kind].name+' pickup incoming');
  }
  function onOrdinaryKill(w,e){
    const n=w.ordinaryTotal,k=w.ordinaryKills;
    if(k===Math.ceil(n/2))drop(w,'shield',e);
    if(!w.dropPool.length)return;
    const thresholds=w.level<16?[.25]:w.level<26?[.25,.75]:[.25,.62,.85];
    const chance=w.level<16?.45:w.level<26?.5+(w.level-16)*.004:.55+(w.level-26)*.006;
    if(thresholds.some(t=>k===Math.ceil(n*t))&&w.random()<chance){
      const kind=w.random()<.15?'shield':w.dropPool[Math.floor(w.random()*w.dropPool.length)];drop(w,kind,e);
    }
  }
  const api={DEFS,OFFENSE,normal,campaignForSector,cloneCampaign,cancelSpecials,equip,tick,fire,updateSpecials,onOrdinaryKill};
  if(typeof module!=='undefined')module.exports=api;else root.GalactixWeapons=api;
})(typeof globalThis!=='undefined'?globalThis:this);
