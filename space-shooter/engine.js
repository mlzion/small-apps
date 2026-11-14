/* Galactix simulation: fixed logical coordinates, deterministic RNG, no DOM. */
(function (root) {
  'use strict';
  const W = 360, H = 480;
  const LEVELS = Object.freeze(Array.from({length:10}, (_, i) => Object.freeze({
    number:i+1, columns:4+Math.floor(i/3), rows:2+Math.floor(i/4),
    sway:12+i*1.5, diveInterval:4.6-i*.27, diveSpeed:83+i*10,
    shotInterval:2.8-i*.17, bulletSpeed:100+i*9,
    armored:i < 3 ? 0 : Math.min(2+i-3, 8)
  })));
  function create(level=1, seed=17) {
    const config=LEVELS[Math.max(0,Math.min(9,level-1))];
    let rng=seed>>>0;
    const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
    const world={level:config.number,config,time:0,state:'playing',score:0,lives:3,shield:false,
      player:{x:180,y:424},target:{x:180,y:424},invulnerable:1.5,fireCooldown:0,
      shotClock:config.shotInterval+1.7,diveClock:config.diveInterval+1.7,
      enemies:[],bullets:[],shots:[],particles:[],pickup:null,kills:0,random,events:[]};
    for(let row=0;row<config.rows;row++) for(let col=0;col<config.columns;col++) {
      const id=row*config.columns+col;
      const x=46+col*(268/(config.columns-1));
      world.enemies.push({id,homeX:x,homeY:58+row*40,x,y:-50-row*40,
        hp:id<config.armored?2:1,armored:id<config.armored,mode:'entry',age:0,delay:id*.07});
    }
    world.total=world.enemies.length;
    return world;
  }
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function move(world,x,y){world.target.x=clamp(x,18,W-18);world.target.y=clamp(y,H*.52,H-25);}
  function burst(w,x,y,color){for(let i=0;i<10;i++){const a=w.random()*Math.PI*2,s=25+w.random()*85;w.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.45+w.random()*.2,color});}}
  function damage(w){
    if(w.invulnerable>0||w.state!=='playing')return;
    w.invulnerable=1.8;
    if(w.shield){w.shield=false;w.events.push('Shield absorbed a hit');burst(w,w.player.x,w.player.y,'#a0c4ff');return;}
    w.lives--;burst(w,w.player.x,w.player.y,'#9eb6dc');
    w.events.push(w.lives?'Hull hit · '+w.lives+' remaining':'Ship lost');
    if(!w.lives)w.state='lost';
  }
  function hit(shot,obj,radius){return Math.abs(shot.x-obj.x)<radius && Math.min(shot.previousY,shot.y)<obj.y+radius && Math.max(shot.previousY,shot.y)>obj.y-radius;}
  function step(w,dt,input={}) {
    if(w.state!=='playing')return;
    dt=clamp(dt,0,1/60);w.time+=dt;w.invulnerable=Math.max(0,w.invulnerable-dt);
    const c=w.config,p=w.player;
    if(input.dx||input.dy)move(w,w.target.x+(input.dx||0)*260*dt,w.target.y+(input.dy||0)*260*dt);
    const d=Math.hypot(w.target.x-p.x,w.target.y-p.y),speed=Math.min(1,520*dt/(d||1));
    p.x+=(w.target.x-p.x)*speed;p.y+=(w.target.y-p.y)*speed;
    w.fireCooldown-=dt;
    if(input.fire&&w.fireCooldown<=0){w.shots.push({x:p.x,y:p.y-18,previousY:p.y-18});w.fireCooldown=.19;}
    w.diveClock-=dt;w.shotClock-=dt;
    const ready=w.enemies.filter(e=>e.mode==='formation');
    if(w.diveClock<=0&&ready.length){const e=ready[Math.floor(w.random()*ready.length)];e.mode='dive';e.age=0;e.diveX=e.x;w.diveClock=c.diveInterval;}
    if(w.shotClock<=0&&ready.length){const e=ready[Math.floor(w.random()*ready.length)];w.bullets.push({x:e.x,y:e.y+12,previousY:e.y+12});w.shotClock=c.shotInterval;}
    for(const e of w.enemies){
      e.age+=dt;
      const hx=e.homeX+Math.sin(w.time*1.1)*c.sway;
      if(e.mode==='entry'){
        const t=clamp((w.time-e.delay)/1.7,0,1);
        e.x=hx;e.y=-60+(e.homeY+60)*(1-Math.pow(1-t,3));
        if(t>=1)e.mode='formation';
      }else if(e.mode==='formation'){e.x=hx;e.y=e.homeY+Math.sin(w.time*1.6+e.id*.4)*4;}
      else if(e.mode==='dive'){
        e.x=clamp(e.diveX+Math.sin(e.age*2.8)*65,18,W-18);e.y+=c.diveSpeed*dt;
        if(e.y>H+25){e.mode='return';e.y=-25;}
      }else{
        e.x+=(hx-e.x)*Math.min(1,dt*3);e.y+=100*dt;
        if(e.y>=e.homeY){e.y=e.homeY;e.mode='formation';}
      }
      if(Math.hypot(e.x-p.x,e.y-p.y)<23)damage(w);
    }
    for(const s of w.shots){
      s.previousY=s.y;s.y-=440*dt;
      const e=w.enemies.find(e=>hit(s,e,e.armored?16:14));
      if(e){s.y=-100;e.hp--;burst(w,e.x,e.y,e.armored?'#b4a4d9':'#789df4');
        if(e.hp<=0){w.score+=e.armored?200:100;w.kills++;w.enemies.splice(w.enemies.indexOf(e),1);
          if(w.kills===Math.ceil(w.total/2)){w.pickup={x:e.x,y:e.y};w.events.push('Shield pickup incoming');}}
      }
    }
    for(const b of w.bullets){b.previousY=b.y;b.y+=c.bulletSpeed*dt;if(hit(b,p,12)){damage(w);b.y=H+100;}}
    w.shots=w.shots.filter(s=>s.y>-20);w.bullets=w.bullets.filter(b=>b.y<H+20);
    if(w.pickup){w.pickup.y+=68*dt;if(Math.hypot(w.pickup.x-p.x,w.pickup.y-p.y)<27){w.shield=true;w.pickup=null;w.events.push('Shield online · absorbs one hit');}else if(w.pickup.y>H+20)w.pickup=null;}
    for(const q of w.particles){q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt;}w.particles=w.particles.filter(q=>q.life>0);
    if(w.enemies.length===0&&w.state==='playing'){w.score+=w.lives*250;w.state='cleared';w.bullets=[];w.events.push('Sector cleared');}
  }
  const api={W,H,LEVELS,create,move,step};
  if(typeof module!=='undefined')module.exports=api;else root.Galactix=api;
})(typeof globalThis!=='undefined'?globalThis:this);
