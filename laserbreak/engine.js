/* Original LaserBreak simulation. Browser global + Node export; no dependencies. */
(function (root) {
  'use strict';
  const defaults = Object.freeze({ mode: 'touch', cooldown: .75, targetSize: 15, targetSpeed: 45,
    barLength: 100, barThickness: 9, barSpeed: 32, barRotation: 65, density: 20, debug: false });
  const W = 1000, H = 500, MAX_OBJECTS = 90, PULSE_SPEED = 2800;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // Return first segment parameter inside a circle, including tangencies and starts inside.
  function circleHit(a, b, c, r) {
    const dx=b.x-a.x, dy=b.y-a.y, ox=a.x-c.x, oy=a.y-c.y;
    const q=ox*ox+oy*oy-r*r, aa=dx*dx+dy*dy;
    if(q<=0) return 0;
    if(!aa) return null;
    const bb=ox*dx+oy*dy, disc=bb*bb-aa*q;
    if(disc<0) return null;
    const t=(-bb-Math.sqrt(disc))/aa;
    return t>=0 && t<=1 ? t : null;
  }
  function local(p, bar) {
    const c=Math.cos(bar.angle), s=Math.sin(bar.angle), x=p.x-bar.x, y=p.y-bar.y;
    return {x:x*c+y*s,y:-x*s+y*c};
  }
  function barHit(a,b,bar) {
    a=local(a,bar); b=local(b,bar);
    let lo=0, hi=1;
    for(const [axis,extent] of [['x',bar.length/2],['y',bar.thickness/2]]) {
      const d=b[axis]-a[axis];
      if(Math.abs(d)<1e-10) { if(Math.abs(a[axis])>extent) return null; }
      else { const t1=(-extent-a[axis])/d,t2=(extent-a[axis])/d;
        lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2)); }
    }
    return lo<=hi ? lo : null;
  }
  function blastHits(center,r,o) {
    if(o.type==='target') return Math.hypot(center.x-o.x,center.y-o.y)<=r+o.radius;
    const p=local(center,o);
    return Math.hypot(p.x-clamp(p.x,-o.length/2,o.length/2),p.y-clamp(p.y,-o.thickness/2,o.thickness/2))<=r;
  }
  class Input {
    constructor(fire,ready,mode) { this.fire=fire;this.ready=ready;this.mode=mode;this.points=new Map();this.locked=false; }
    pair() { return ['left','right'].map(side=>[...this.points.values()].find(p=>p.side===side)); }
    down(id,side,y) {
      if(this.points.has(id)) return;
      this.points.set(id,{side,y:clamp(y,0,H)});
      if(this.locked) return;
      const [a,b]=this.pair();
      if(a&&b && this.mode()==='touch') { this.locked=true;if(this.ready()) this.fire(a.y,b.y); }
    }
    move(id,y) { const p=this.points.get(id);if(p)p.y=clamp(y,0,H); }
    up(id,cancel=false) {
      if(!this.points.has(id))return;
      const [a,b]=this.pair();
      if(!this.locked && a&&b && [a,b].includes(this.points.get(id)) && this.mode()==='release') {
        this.locked=true;if(!cancel&&this.ready())this.fire(a.y,b.y);
      }
      if(cancel)this.locked=true;
      this.points.delete(id);
      if(!this.points.size)this.locked=false;
    }
    reset() { this.points.clear();this.locked=false; }
  }
  class World {
    constructor(random=Math.random) { this.settings={...defaults};this.random=random;this.objects=[];this.shots=[];this.effects=[];this.time=0;this.lastShot=-Infinity;this.spawnClock=0;this.nextId=1;this.paused=false; }
    ready() { return !this.paused && this.time-this.lastShot>=this.settings.cooldown; }
    configure(key,value) {
      this.settings[key]=value;
      for(const o of this.objects) {
        if(o.type==='target')o.radius=this.settings.targetSize;
        else {o.length=this.settings.barLength;o.thickness=this.settings.barThickness;}
      }
      if(key==='density')this.spawnClock=0;
    }
    spawn() {
      if(this.objects.length>=MAX_OBJECTS)return;
      const target=this.random()<.65, margin=target?this.settings.targetSize:Math.hypot(this.settings.barLength,this.settings.barThickness)/2;
      this.objects.push({id:this.nextId++,type:target?'target':'bar',x:margin+this.random()*(W-2*margin),y:-margin,
        radius:this.settings.targetSize,length:this.settings.barLength,thickness:this.settings.barThickness,
        angle:this.random()*Math.PI,color:this.random()<.5?'#65f5ef':'#f5e67a'});
    }
    fire(left,right) {
      if(!this.ready())return false;
      this.lastShot=this.time;
      const a={x:0,y:left},b={x:W,y:right},length=Math.hypot(W,right-left);
      this.shots.push({a,b,length,hits:new Map(),pulses:[{from:a,to:b,distance:0,done:false},{from:b,to:a,distance:0,done:false}]});
      return true;
    }
    clear() { this.objects=[];this.shots=[];this.effects=[];this.spawnClock=0; }
    step(dt) {
      if(this.paused)return;
      // Small simulation slices bound falling/rotation error; ray segments never tunnel through bars.
      while(dt>1e-9) { const slice=Math.min(dt,1/240);this.tick(slice);dt-=slice; }
    }
    tick(dt) {
      this.time+=dt;
      if(this.settings.density>0) {
        this.spawnClock+=dt;
        const interval=1/(.05+5.95*this.settings.density/100);
        while(this.spawnClock>=interval) {this.spawnClock-=interval;this.spawn();}
      }
      for(const o of this.objects) {
        o.y+=dt*(o.type==='target'?this.settings.targetSpeed:this.settings.barSpeed);
        if(o.type==='bar')o.angle+=dt*this.settings.barRotation*Math.PI/180;
      }
      for(const shot of this.shots) {
        shot.pulses.forEach((p,index)=>{
          if(p.done)return;
          const point=d=>({x:p.from.x+(p.to.x-p.from.x)*d/shot.length,y:p.from.y+(p.to.y-p.from.y)*d/shot.length});
          const end=Math.min(shot.length,p.distance+PULSE_SPEED*dt),a=point(p.distance),b=point(end);
          let stop=1, blocked=false;
          for(const o of this.objects)if(o.type==='bar') {const t=barHit(a,b,o);if(t!==null && t<=stop){stop=t;blocked=true;}}
          for(const o of this.objects)if(o.type==='target') {
            const t=circleHit(a,b,o,o.radius);
            if(t!==null && t<=stop) {
              const hit=shot.hits.get(o.id)||{object:o,sides:new Set()};hit.sides.add(index);shot.hits.set(o.id,hit);
            }
          }
          p.distance+=(end-p.distance)*stop;
          p.position=point(p.distance);
          p.done=blocked||end>=shot.length;
          if(blocked)this.effects.push({type:'spark',x:p.position.x,y:p.position.y,r:12,age:0,life:.22});
        });
        if(shot.pulses.every(p=>p.done))this.resolve(shot);
      }
      this.shots=this.shots.filter(s=>!s.resolved);
      this.objects=this.objects.filter(o=>o.y-(o.type==='target'?o.radius:Math.hypot(o.length,o.thickness)/2)<=H);
      this.effects=this.effects.filter(e=>(e.age+=dt)<e.life);
    }
    resolve(shot) {
      shot.resolved=true;
      const destroyed=new Set(),blasts=[];
      for(const {object:o,sides} of shot.hits.values()) {
        if(!this.objects.includes(o))continue;
        destroyed.add(o.id);
        const double=sides.size===2;
        this.effects.push({type:double?'explosion':'dissolve',x:o.x,y:o.y,r:o.radius*(double?2:1),age:0,life:double?.45:.28,color:o.color});
        if(double)blasts.push({x:o.x,y:o.y,r:o.radius*2});
      }
      // Only direct double hits create blasts. Blast victims never create another blast.
      for(const blast of blasts)for(const o of this.objects)if(blastHits(blast,blast.r,o))destroyed.add(o.id);
      this.objects=this.objects.filter(o=>!destroyed.has(o.id));
      this.effects.push({type:'flash',a:shot.a,b:shot.b,pulses:shot.pulses.map(p=>({...p})),age:0,life:.1});
    }
  }
  const api={defaults,W,H,MAX_OBJECTS,Input,World,circleHit,barHit,blastHits};
  if(typeof module!=='undefined')module.exports=api;else root.LaserBreak=api;
})(typeof window==='undefined'?globalThis:window);
