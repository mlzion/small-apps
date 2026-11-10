/* Original LaserBreak simulation. Browser global + Node export; no dependencies. */
(function (root) {
  'use strict';
  const defaults = Object.freeze({ mode: 'touch', cooldown: .75, targetSize: 24, targetSpeed: 45,
    barLength: 100, barSpeed: 32, barRotation: 65, density: 20, debug: false });
  const W = 1000, H = 500, MAX_OBJECTS = 60, BAR_THICKNESS = 12, SPAWN_CLEARANCE = 5, MAX_EFFECTS = 160;
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
    constructor(fire,ready,mode) { this.fire=fire;this.ready=ready;this.mode=mode;this.points=new Map();this.locked=false;this.height=H; }
    pair() {
      let left, right;
      for (const point of this.points.values()) {
        if (point.side === 'left' && !left) left = point;
        if (point.side === 'right' && !right) right = point;
      }
      return [left, right];
    }
    down(id,side,y) {
      if(this.points.has(id)) return;
      this.points.set(id,{side,y:clamp(y,0,this.height)});
      if(this.locked) return;
      const [a,b]=this.pair();
      if(a&&b && this.mode()==='touch') { this.locked=true;if(this.ready()) this.fire(a.y,b.y); }
    }
    move(id,y) { const p=this.points.get(id);if(p)p.y=clamp(y,0,this.height); }
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
  // Rotation-safe spawn envelopes prevent even bar tips overlapping at entry.
  // Beam and blast tests still use the exact rotated rectangle, not this bound.
  function spawnOverlaps(a, b, clearance = SPAWN_CLEARANCE) {
    const extent = o => o.type === 'target' ? o.radius : Math.hypot(o.length, o.thickness) / 2;
    const distance = extent(a) + extent(b) + clearance;
    return (a.x-b.x)**2 + (a.y-b.y)**2 < distance*distance;
  }

  function entryOverlaps(a, b, clearance = SPAWN_CLEARANCE) {
    // Reserve the short vertical entry corridor until the new shape is fully inside.
    // This also avoids spawning directly above a stationary object at the top edge.
    const endY = Math.max(a.y, a.extent);
    const nearestY = clamp(b.y, a.y, endY);
    const radius = a.extent + b.extent + clearance;
    return (a.x - b.x) ** 2 + (nearestY - b.y) ** 2 < radius * radius;
  }

  class World {
    constructor(random = Math.random) {
      this.settings = {...defaults};
      this.height = H;
      this.random = random;
      this.objects = [];
      this.effects = [];
      this.time = 0;
      this.lastShot = -Infinity;
      this.spawnClock = 0;
      this.nextId = 1;
      this.paused = false;
      this.running = true;
      this.orientationBlocked = false;
    }
    ready() {
      return this.running && !this.paused && !this.orientationBlocked &&
        this.time - this.lastShot >= this.settings.cooldown;
    }
    configure(key, value) {
      // Object properties are snapshots, assigned only by spawn().
      this.settings[key] = value;
      if (key === 'density') this.spawnClock = 0;
    }
    spawn(initialY) {
      if (!this.running || this.settings.density === 0 || this.objects.length >= MAX_OBJECTS) return false;
      const target = this.random() < .65;
      const o = target ? {
        id: this.nextId, type: 'target', radius: this.settings.targetSize / 2,
        speed: this.settings.targetSpeed, color: this.random() < .5 ? '#36fff3' : '#fff04b'
      } : {
        id: this.nextId, type: 'bar', length: this.settings.barLength, thickness: BAR_THICKNESS,
        speed: this.settings.barSpeed, rotation: this.settings.barRotation * Math.PI / 180,
        angle: this.random() * Math.PI
      };
      o.extent = target ? o.radius : Math.hypot(o.length, o.thickness) / 2;
      o.y = initialY === undefined ? -o.extent : initialY;
      for (let attempt = 0; attempt < 12; attempt++) {
        o.x = o.extent + ((this.random() + attempt / 12) % 1) * (W - 2 * o.extent);
        let occupied = false;
        for (const other of this.objects) {
          // Rotation-safe envelopes include the occupied entry corridor.
          if (entryOverlaps(o, other)) {
            occupied = true;
            break;
          }
        }
        if (!occupied) {
          this.nextId++;
          this.objects.push(o);
          return true;
        }
      }
      return false;
    }
    fire(left, right) {
      if (!this.ready()) return false;
      this.lastShot = this.time;
      const a = {x: 0, y: left}, b = {x: W, y: right};
      const mid = {x: W / 2, y: (left + right) / 2};
      let leftStop = 1, rightStop = 1;
      // Both beams are bounded by their own half of the line.
      for (const o of this.objects) {
        if (o.type !== 'bar') continue;
        const l = barHit(a, mid, o), r = barHit(b, mid, o);
        if (l !== null && l < leftStop) leftStop = l;
        if (r !== null && r < rightStop) rightStop = r;
      }
      const endA = {x: mid.x * leftStop, y: a.y + (mid.y - a.y) * leftStop};
      const endB = {x: W + (mid.x - W) * rightStop, y: b.y + (mid.y - b.y) * rightStop};
      this.effects.push({type: 'flash', beams: [{from: a, to: endA}, {from: b, to: endB}], age: 0, life: .14});
      if (leftStop < 1) this.effects.push({type: 'spark', x: endA.x, y: endA.y, r: 10, age: 0, life: .18});
      if (rightStop < 1) this.effects.push({type: 'spark', x: endB.x, y: endB.y, r: 10, age: 0, life: .18});
      const destroyed = new Set(), blasts = [];
      for (const o of this.objects) {
        if (o.type !== 'target') continue;
        const l = circleHit(a, endA, o, o.radius) !== null;
        const r = circleHit(b, endB, o, o.radius) !== null;
        if (!l && !r) continue;
        destroyed.add(o);
        const double = l && r;
        this.effects.push({type: double ? 'explosion' : 'dissolve', x: o.x, y: o.y,
          r: o.radius * (double ? 2 : 1), color: o.color, age: 0, life: double ? .35 : .22});
        if (double) blasts.push(o);
      }
      // Only direct double hits produce blasts; victims never propagate them.
      for (const center of blasts) {
        for (const o of this.objects) {
          if (!destroyed.has(o) && blastHits(center, center.radius * 2, o)) {
            destroyed.add(o);
            this.effects.push({type: 'dissolve', x: o.x, y: o.y, r: o.type === 'target' ? o.radius : 8,
              color: o.color || '#8da5b7', age: 0, life: .22});
          }
        }
      }
      let live = 0;
      for (const o of this.objects) if (!destroyed.has(o)) this.objects[live++] = o;
      this.objects.length = live;
      if (this.effects.length > MAX_EFFECTS) this.effects.splice(0, this.effects.length - MAX_EFFECTS);
      return true;
    }
    clear() {
      this.objects.length = 0;
      this.effects.length = 0;
      this.spawnClock = 0;
    }
    stop() {
      this.clear();
      this.running = false;
      this.paused = false;
    }
    start() {
      this.clear();
      this.running = true;
      this.paused = false;
      this.time = 0;
      this.lastShot = -Infinity;
      for (let n = 0; n < 3; n++) this.spawn(40);
    }
    step(dt) {
      if (!this.running || this.paused || this.orientationBlocked || !(dt > 0)) return;
      this.time += dt;
      let live = 0;
      // One movement/rotation update per object per frame. No collision scans here.
      for (const o of this.objects) {
        o.y += dt * o.speed;
        if (o.type === 'bar') o.angle = (o.angle + dt * o.rotation) % (Math.PI * 2);
        if (o.y - o.extent <= this.height) this.objects[live++] = o;
      }
      this.objects.length = live;
      if (this.settings.density > 0) {
        this.spawnClock += dt;
        const interval = 1 / (.05 + 5.95 * this.settings.density / 100);
        if (this.spawnClock >= interval) {
          this.spawnClock %= interval;
          this.spawn(); // At most one bounded placement attempt per frame, no catch-up burst.
        }
      }
      live = 0;
      for (const e of this.effects) {
        e.age += dt;
        if (e.age < e.life) this.effects[live++] = e;
      }
      this.effects.length = live;
    }
  }
  const api = {defaults, W, H, MAX_OBJECTS, BAR_THICKNESS, SPAWN_CLEARANCE, Input, World,
    circleHit, barHit, blastHits, spawnOverlaps, entryOverlaps};
  if (typeof module !== 'undefined') module.exports = api;
  else root.LaserBreak = api;
})(typeof window === 'undefined' ? globalThis : window);
