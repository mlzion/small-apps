/* Original LaserBreak simulation. Browser global + Node export; no dependencies. */
(function (root) {
  'use strict';
  const defaults = Object.freeze({ blastMultiplier: 3, sound: true, cooldown: .75, targetSize: 40, targetSpeed: 45,
    barPercentage: 40, barLength: 100, barSpeed: 32, barRotation: 65, density: 20, debug: false });
  const W = 1000, H = 500, MAX_OBJECTS = 60, BAR_THICKNESS = 12, SPAWN_CLEARANCE = 5, MAX_EFFECTS = 160, MAX_PARTICLES = 128;
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
    constructor(fire,ready) { this.fire=fire;this.ready=ready;this.points=new Map();this.locked=false;this.height=H; }
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
    }
    move(id,y) { const p=this.points.get(id);if(p)p.y=clamp(y,0,this.height); }
    up(id,cancel=false) {
      if(!this.points.has(id))return;
      const [a,b]=this.pair();
      if(!this.locked && a&&b && [a,b].includes(this.points.get(id))) {
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
      this.particles = [];
      this.time = 0;
      this.lastShot = -Infinity;
      this.spawnClock = 0;
      this.nextId = 1;
      this.paused = false;
      this.running = true;
      this.orientationBlocked = false;
      this.settingsOpen = false;
      this.arcadeBlocked = false;
      this.trackEscapes = false;
      this.stats = {targets: 0, escaped: 0, shots: 0, blockedShots: 0};
      this.bag = [];
      this.lastShotSounds = null;
    }
    ready() {
      return this.running && !this.paused && !this.orientationBlocked && !this.settingsOpen && !this.arcadeBlocked &&
        this.time - this.lastShot >= this.settings.cooldown;
    }
    configure(key, value) {
      // Object properties are snapshots, assigned only by spawn().
      if (key === 'barPercentage') value = clamp(Math.round(value / 10) * 10, 0, 100);
      const changed = this.settings[key] !== value;
      this.settings[key] = value;
      if (key === 'density') this.spawnClock = 0;
      if (key === 'barPercentage' && changed) this.refillBag();
    }
    refillBag() {
      const bars = this.settings.barPercentage / 10;
      this.bag = Array.from({length: 10}, (_, i) => i < 10 - bars ? 'target' : 'bar');
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    spawn(initialY) {
      if (!this.running || this.settings.density === 0 || this.objects.length >= MAX_OBJECTS) return false;
      if (!this.bag.length) this.refillBag();
      const target = this.bag[this.bag.length - 1] === 'target';
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
          this.bag.pop();
          return true;
        }
      }
      return false;
    }
    fire(left, right) {
      if (!this.ready()) return false;
      this.lastShot = this.time;
      const multiplier = this.settings.blastMultiplier;
      const sounds = {single: 0, double: 0, bars: 0};
      const a = {x: 0, y: left}, b = {x: W, y: right};
      let leftStop = 1, rightStop = 1;
      // Both instantaneous beams cross the field, independently stopping at the first bar.
      for (const o of this.objects) {
        if (o.type !== 'bar') continue;
        const l = barHit(a, b, o), r = barHit(b, a, o);
        if (l !== null && l < leftStop) leftStop = l;
        if (r !== null && r < rightStop) rightStop = r;
      }
      const endA = {x: W * leftStop, y: a.y + (b.y - a.y) * leftStop};
      const endB = {x: W * (1 - rightStop), y: b.y + (a.y - b.y) * rightStop};
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
          r: o.radius * (double ? multiplier : 1), color: o.color, age: 0, life: double ? .35 : .22});
        sounds[double ? 'double' : 'single']++;
        this.fragments(o, double);
        if (double) blasts.push(o);
      }
      // Only direct double hits produce blasts; victims never propagate them.
      for (const center of blasts) {
        for (const o of this.objects) {
          if (!destroyed.has(o) && blastHits(center, center.radius * multiplier, o)) {
            destroyed.add(o);
            sounds[o.type === 'bar' ? 'bars' : 'single']++;
            this.fragments(o, false);
            this.effects.push({type: 'dissolve', x: o.x, y: o.y, r: o.type === 'target' ? o.radius : 8,
              color: o.color || '#8da5b7', age: 0, life: .22});
          }
        }
      }
      let live = 0;
      for (const o of this.objects) if (!destroyed.has(o)) this.objects[live++] = o;
      this.stats.shots++;
      if (leftStop < 1 || rightStop < 1) this.stats.blockedShots++;
      for (const o of destroyed) if (o.type === 'target') this.stats.targets++;
      this.objects.length = live;
      if (this.effects.length > MAX_EFFECTS) this.effects.splice(0, this.effects.length - MAX_EFFECTS);
      this.lastShotSounds = sounds;
      return true;
    }
    fragments(o, dramatic) {
      // D::FUZE-style outward shards: bounded creation, no particle collisions or runtime blur.
      const bar = o.type === 'bar';
      const count = dramatic ? 14 : bar ? 8 : 6;
      const life = dramatic ? .42 : bar ? .32 : .26;
      const speed = dramatic ? 220 : 110;
      const bx = bar ? Math.cos(o.angle) : 0, by = bar ? Math.sin(o.angle) : 0;
      for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
        const angle = i * 2.399 + o.id * .71;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const offset = bar ? ((i + .5) / count - .5) * o.length : o.radius * .65;
        const velocity = speed * (.7 + (i % 4) * .15);
        this.particles.push({
          x: o.x + (bar ? bx : dx) * offset, y: o.y + (bar ? by : dy) * offset,
          vx: dx * velocity, vy: dy * velocity, size: dramatic ? 4 : bar ? 4.5 : 3,
          color: o.color || '#9bb9cd', age: 0, life
        });
      }
    }
    clear() {
      this.objects.length = 0;
      this.effects.length = 0;
      this.particles.length = 0;
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
      this.bag.length = 0;
      this.stats = {targets: 0, escaped: 0, shots: 0, blockedShots: 0};
      for (let n = 0; n < 3; n++) this.spawn(40);
    }
    step(dt) {
      if (!this.running || this.paused || this.orientationBlocked || this.settingsOpen || this.arcadeBlocked || !(dt > 0)) return;
      this.time += dt;
      let live = 0;
      // One movement/rotation update per object per frame. No collision scans here.
      for (const o of this.objects) {
        o.y += dt * o.speed;
        if (o.type === 'bar') o.angle = (o.angle + dt * o.rotation) % (Math.PI * 2);
        if (o.y - o.extent <= this.height) this.objects[live++] = o;
        else if (this.trackEscapes && o.type === 'target') {
          // Keep the original interception window: resolve after the whole circle exits.
          this.stats.escaped++;
          if (this.effects.length < MAX_EFFECTS) this.effects.push({type:'escape',x:o.x,y:this.height,r:o.radius,age:0,life:.24});
        }
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
      live = 0;
      for (const p of this.particles) {
        p.age += dt;
        if (p.age >= p.life) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        this.particles[live++] = p;
      }
      this.particles.length = live;
    }
  }
  const api = {defaults, W, H, MAX_OBJECTS, MAX_PARTICLES, BAR_THICKNESS, SPAWN_CLEARANCE, Input, World,
    circleHit, barHit, blastHits, spawnOverlaps, entryOverlaps};
  if (typeof module !== 'undefined') module.exports = api;
  else root.LaserBreak = api;
})(typeof window === 'undefined' ? globalThis : window);
