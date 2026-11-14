/* Galactix: deterministic simulation, logical coordinates, no DOM or wall clock. */
(function (root) {
  'use strict';
  const A = typeof module !== 'undefined' ? require('./attacks.js') : root.GalactixAttacks;
  const W = 360, H = 480;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const TYPES = Object.freeze({
    1: Object.freeze({hp: 1, points: 100, speed: 1, fireWeight: 1, diveWeight: 1}),
    2: Object.freeze({hp: 2, points: 200, speed: 1.1, fireWeight: 1.5, diveWeight: 1.35}),
    3: Object.freeze({hp: 2, points: 300, speed: 1.04, fireWeight: 1.3, diveWeight: 1.8}),
    4: Object.freeze({hp: 4, points: 500, speed: 1, fireWeight: 1, diveWeight: 0})
  });
  const DURATIONS = Object.freeze({rapid: 8, spread: 10});
  const LEVELS = Object.freeze(Array.from({length: 30}, (_, i) => {
    const early = Math.min(i, 9), late = Math.min(10, Math.max(0, i - 9)), extra = Math.max(0, i - 19);
    return Object.freeze({
      number: i + 1, columns: 4 + Math.floor(early / 3), rows: 2 + Math.floor(early / 4),
      sway: 12 + early * 1.5 + late * .5 + extra * .2,
      diveInterval: 4.6 - early * .27 - late * .052 - extra * .018,
      diveSpeed: 83 + early * 10 + late * 3.2 + extra * 1.4,
      shotInterval: 2.8 - early * .17 - late * .032 - extra * .008,
      bulletSpeed: 100 + early * 9 + late * 3.4 + extra * 1.5,
      armored: i < 3 ? 0 : Math.min(2 + i - 3, 8) + Math.floor(late / 5),
      loopers: late ? Math.min(2 + Math.floor((late - 1) / 2), 6) : 0,
      loops: i >= 12, groupSize: i >= 18 ? 3 : i >= 14 ? 2 : 1,
      // Sector 20 fires 18% more often than sector 1, without a breakpoint at 11.
      playerCooldown: .285 / (1 + .18 * Math.min(i, 19) / 19),
      kamikazeChance: extra ? .18 + (extra - 1) * .022 : 0,
      fileChance: i >= 23 ? .18 + (i - 23) * .02 : 0,
      fileCount: i >= 29 ? 5 : i >= 26 ? 4 : 3
    });
  }));
  function create(level = 1, seed = 17) {
    const config = LEVELS[clamp(Math.floor(level) || 1, 1, LEVELS.length) - 1];
    let rng = seed >>> 0;
    const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
    const world = {
      level: config.number, config, time: 0, state: 'playing', score: 0, killScore: 0, clearBonus: 0,
      lives: 3, shield: false, player: {x: 180, y: 424}, target: {x: 180, y: 424}, control: 'direct',
      invulnerable: 1.5, fireCooldown: 0, attempts: 0, actionId: 0,
      effects: {rapid: 0, spread: 0},
      shotClock: config.shotInterval + 1.7, diveClock: config.diveInterval + 1.7,
      bossShotClock: 5.2 - config.number / 5 * .15, bossDiveClock: 10 - config.number / 5 * .4,
      attackStats: {classic: 0, kamikaze: 0, file: 0, boss: 0}, lastAttack: null,
      attackId: 0, enemies: [], bullets: [], shots: [], particles: [], pickups: [],
      kills: 0, random, events: [], cues: [], lastAward: null
    };
    for (let row = 0; row < config.rows; row++) for (let col = 0; col < config.columns; col++) {
      const id = row * config.columns + col;
      const type = id < config.loopers ? 3 : id < config.loopers + config.armored ? 2 : 1;
      const x = 46 + col * (268 / (config.columns - 1));
      world.enemies.push({id, type, hp: TYPES[type].hp, homeX: x, homeY: 58 + row * 40 + (A.BOSSES[config.number] ? 20 : 0),
        x, y: -50 - row * 40, mode: 'entry', age: 0, delay: id * .07});
    }
    const boss = A.makeBoss(config.number);
    if (boss) world.enemies.unshift(boss);
    world.total = world.enemies.length;
    return world;
  }
  function move(w, x, y, source = 'direct') {
    w.target.x = clamp(x, 18, W - 18); w.target.y = clamp(y, H * .52, H - 25); w.control = source;
  }
  function burst(w, x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const a = w.random() * Math.PI * 2, s = 25 + w.random() * 85;
      w.particles.push({x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .45 + w.random() * .2, color});
    }
    w.particles = w.particles.slice(-240);
  }
  function damage(w) {
    if (w.invulnerable > 0 || w.state !== 'playing') return;
    w.invulnerable = 1.8;
    if (w.shield) {
      w.shield = false; w.events.push('Shield absorbed a hit'); w.cues.push('shield');
      burst(w, w.player.x, w.player.y, '#80e5a5'); return;
    }
    w.lives--; burst(w, w.player.x, w.player.y, '#9eb6dc'); w.cues.push('damage');
    w.events.push(w.lives ? 'Hull hit · ' + w.lives + ' remaining' : 'Ship lost');
    if (!w.lives) { w.state = 'lost'; w.cues.push('defeat'); }
  }
  // Closest point on a swept segment also handles the spread's horizontal motion.
  function collisionTime(s, obj, radius) {
    const x = s.previousX ?? s.x, y = s.previousY ?? s.y, dx = s.x - x, dy = s.y - y;
    const t = clamp(((obj.x - x) * dx + (obj.y - y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(x + t * dx - obj.x, y + t * dy - obj.y) < radius ? t : Infinity;
  }
  function weighted(w, list, key) {
    let roll = w.random() * list.reduce((n, e) => n + TYPES[e.type][key], 0);
    return list.find(e => (roll -= TYPES[e.type][key]) < 0) || list[list.length - 1];
  }
  function scheduleDive(w, ready) {
    const late = w.level >= 11;
    const active = w.enemies.filter(e => ['telegraph', 'dive'].includes(e.mode)).length;
    // Later attacks have one visible group at a time; the lower lanes stay readable.
    if (late ? active > 0 : active >= 2) return;
    if (A.scheduleSpecial(w, ready)) return;
    w.attackStats.classic++;
    const count = late ? Math.min(w.config.groupSize, ready.length) : 1;
    const chosen = [], candidates = ready.slice();
    for (let i = 0; i < count; i++) {
      const e = weighted(w, candidates, 'diveWeight'); chosen.push(e); candidates.splice(candidates.indexOf(e), 1);
    }
    chosen.sort((a, b) => a.x - b.x);
    const lanes = count === 3 ? [48, 180, 312] : count === 2 ? [84, 276] : [90 + w.random() * 180];
    const groupLoop = count > 1 && w.config.loops && chosen.some(e => e.type === 3);
    w.attackId++;
    chosen.forEach((e, i) => {
      e.mode = 'telegraph'; e.age = 0; e.attack = w.attackId;
      e.curved = late || e.type === 3; e.loop = groupLoop || (e.type === 3 && w.config.loops);
      e.lane = lanes[i]; e.diveX = e.x;
      // A group shares its launch clock and duration, even with mixed enemy types.
      e.speed = w.config.diveSpeed * (count > 1 ? 1 : TYPES[e.type].speed);
    });
    w.diveClock = w.config.diveInterval;
  }
  function updateEnemy(w, e, dt) {
    if (A.update(w, e, dt)) {
      if (Math.hypot(e.x - w.player.x, e.y - w.player.y) < (e.boss ? 32 : 23)) damage(w);
      return;
    }
    const c = w.config, hx = e.homeX + Math.sin(w.time * 1.1) * c.sway;
    e.age += dt;
    if (e.mode === 'entry') {
      const t = clamp((w.time - e.delay) / 1.7, 0, 1);
      e.x = hx; e.y = -60 + (e.homeY + 60) * (1 - Math.pow(1 - t, 3));
      if (t >= 1) e.mode = 'formation';
    } else if (e.mode === 'formation' || e.mode === 'telegraph') {
      e.x = hx; e.y = e.homeY + Math.sin(w.time * 1.6 + e.id * .4) * 4;
      if (e.mode === 'telegraph' && e.age >= .75) {
        e.mode = 'dive'; w.cues.push('dive'); e.age = 0; e.startX = e.x; e.startY = e.y; e.diveX = e.x;
      }
    } else if (e.mode === 'dive') {
      if (e.curved) {
        // Original piecewise curves: lane approach, optional upper-field loop, descent.
        const approach = .8, loopTime = e.loop ? 1.4 : 0, diveTime = (H + 30 - 110) / e.speed;
        if (e.age < approach) {
          const t = ease(e.age / approach); e.x = e.startX + (e.lane - e.startX) * t; e.y = e.startY + (110 - e.startY) * t;
        } else if (e.loop && e.age < approach + loopTime) {
          const theta = Math.PI * 2 * ease((e.age - approach) / loopTime);
          e.x = e.lane + Math.sin(theta) * 22; e.y = 110 + (1 - Math.cos(theta)) * 38;
        } else {
          const u = (e.age - approach - loopTime) / diveTime;
          e.x = e.lane + Math.sin(clamp(u, 0, 1) * Math.PI * 2) * 20;
          e.y = 110 + (H + 30 - 110) * ease(u);
          if (u >= 1) { e.mode = 'return'; e.age = 0; e.returnX = e.x; e.y = -25; }
        }
      } else {
        e.x = clamp(e.diveX + Math.sin(e.age * 2.8) * 65, 18, W - 18); e.y += e.speed * dt;
        if (e.y > H + 25) { e.mode = 'return'; e.y = -25; }
      }
    } else if (e.curved) {
      const t = ease(e.age / 1.3), hy = e.homeY + Math.sin(w.time * 1.6 + e.id * .4) * 4;
      e.x = e.returnX + (hx - e.returnX) * t; e.y = -25 + (hy + 25) * t;
      if (e.age >= 1.3) e.mode = 'formation';
    } else {
      e.x += (hx - e.x) * Math.min(1, dt * 3); e.y += 100 * dt;
      if (e.y >= e.homeY) { e.y = e.homeY; e.mode = 'formation'; }
    }
    if (Math.hypot(e.x - w.player.x, e.y - w.player.y) < 23) damage(w);
  }
  const accuracy = attempts => Math.max(.4, 1 - .15 * (Math.max(1, attempts) - 1));
  function fireAction(w) {
    const action = Object.freeze({id: ++w.actionId, attempt: ++w.attempts, multiplier: accuracy(w.attempts)});
    const angles = w.effects.spread > 0 ? [-2.5, 2.5] : [0];
    for (const degrees of angles) {
      const angle = degrees * Math.PI / 180;
      w.shots.push({x: w.player.x, y: w.player.y - 18, previousX: w.player.x, previousY: w.player.y - 18,
        vx: Math.sin(angle) * 440, vy: -Math.cos(angle) * 440, action});
    }
    w.cues.push('fire');
  }
  function drop(w, kind, e) { w.pickups.push({kind, x: e.x, y: e.y, age: 0}); w.events.push(kind === 'shield' ? 'Shield pickup incoming' : 'Weapon pickup incoming'); }
  function destroy(w, e, action) {
    const points = Math.round((e.points ?? TYPES[e.type].points) * action.multiplier);
    w.score += points; w.killScore += points;
    w.lastAward = {type: e.type, points, actionId: action.id, attempt: action.attempt, multiplier: action.multiplier};
    w.kills++; w.enemies.splice(w.enemies.indexOf(e), 1); w.cues.push(e.boss ? 'bossDestroy' : 'destroy');
    if (e.boss) burst(w, e.x, e.y, '#ffc994', 44);
    // Bounded drops: one shield plus at most one of each weapon in a sector.
    if (w.kills === Math.ceil(w.total / 2)) drop(w, 'shield', e);
    if (w.kills === Math.ceil(w.total * .25) && w.random() < .65) drop(w, 'rapid', e);
    if (w.kills === Math.ceil(w.total * .75) && w.random() < .55) drop(w, 'spread', e);
  }
  function step(w, dt, input = {}) {
    if (w.state !== 'playing') { w.cues = []; return; }
    dt = clamp(dt, 0, 1 / 60); w.time += dt; w.cues = [];
    w.invulnerable = Math.max(0, w.invulnerable - dt);
    for (const kind of Object.keys(DURATIONS)) {
      const old = w.effects[kind]; w.effects[kind] = Math.max(0, old - dt);
      if (old > 0 && !w.effects[kind]) w.events.push((kind === 'rapid' ? 'Rapid fire' : 'Dual spread') + ' expired');
    }
    const c = w.config, p = w.player;
    if (input.dx || input.dy) move(w, w.target.x + (input.dx || 0) * 260 * dt, w.target.y + (input.dy || 0) * 260 * dt);
    const d = Math.hypot(w.target.x - p.x, w.target.y - p.y);
    // Small drag noise gets ~28ms damping; a dodge immediately approaches the old
    // speed cap. Direct/keyboard input keeps v0.1's response, with no event-rate filter.
    const tau = .028 - .022 * clamp(d / 24, 0, 1);
    const blend = w.control === 'drag' ? 1 - Math.exp(-dt / tau) : 1;
    const amount = Math.min(blend, 520 * dt / (d || 1));
    p.x += (w.target.x - p.x) * amount; p.y += (w.target.y - p.y) * amount;
    w.fireCooldown = Math.max(-dt, w.fireCooldown - dt);
    if (input.fire && w.fireCooldown <= 0) {
      fireAction(w); w.fireCooldown += c.playerCooldown * (w.effects.rapid > 0 ? .5 : 1);
    }
    w.diveClock -= dt; w.shotClock -= dt;
    const boss = w.enemies.find(e => e.boss);
    w.bossShotClock -= dt; w.bossDiveClock -= dt;
    if (boss?.mode === 'formation' && w.bossDiveClock <= 0 && !A.busy(w)) A.startBoss(w, boss);
    if (boss?.mode === 'formation' && w.bossShotClock <= 0) { A.bossFire(w, boss); w.bossShotClock = 5.2 - boss.rank * .15; }
    const ready = w.enemies.filter(e => e.mode === 'formation' && !e.boss);
    if (w.diveClock <= 0 && ready.length) scheduleDive(w, ready);
    if (w.shotClock <= 0 && ready.length && w.bullets.length < 14) {
      const e = weighted(w, ready, 'fireWeight');
      w.bullets.push({x: e.x, y: e.y + 12, previousX: e.x, previousY: e.y + 12,
        speed: c.bulletSpeed * (e.type === 2 ? 1.08 : 1), sourceType: e.type});
      w.cues.push('enemyFire'); w.shotClock = c.shotInterval;
    }
    for (const e of w.enemies) updateEnemy(w, e, dt);
    for (const s of w.shots) {
      s.previousX = s.x; s.previousY = s.y; s.x += s.vx * dt; s.y += s.vy * dt;
      let victim = null, first = Infinity;
      for (const e of w.enemies) { const t = collisionTime(s, e, e.boss ? 24 : e.type === 1 ? 14 : 16); if (t < first) { first = t; victim = e; } }
      if (victim) {
        s.y = -100; victim.hp--; w.attempts = 0; w.cues.push(victim.boss ? 'bossHit' : 'hit');
        burst(w, victim.x, victim.y, victim.type === 3 ? '#81e0d4' : victim.type === 2 ? '#b4a4d9' : '#789df4');
        if (victim.hp <= 0) destroy(w, victim, s.action);
      }
    }
    for (const b of w.bullets) {
      b.previousX = b.x; b.previousY = b.y; b.x += (b.vx || 0) * dt; b.y += (b.vy ?? b.speed) * dt;
      if (collisionTime(b, p, 12) !== Infinity) { damage(w); b.y = H + 100; }
    }
    w.shots = w.shots.filter(s => s.y > -20 && s.x > -20 && s.x < W + 20);
    w.bullets = w.bullets.filter(b => b.y < H + 20 && b.x > -30 && b.x < W + 30);
    w.pickups = w.pickups.filter(pickup => {
      pickup.y += 68 * dt; pickup.age += dt;
      if (Math.hypot(pickup.x - p.x, pickup.y - p.y) < 27) {
        if (pickup.kind === 'shield') { w.shield = true; w.events.push('Shield online · absorbs one hit'); }
        else { w.effects[pickup.kind] = DURATIONS[pickup.kind]; w.events.push(pickup.kind === 'rapid' ? 'Rapid fire · 8 seconds' : 'Dual spread · 10 seconds'); }
        w.cues.push('pickup'); return false;
      }
      return pickup.y < H + 20;
    });
    for (const q of w.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
    w.particles = w.particles.filter(q => q.life > 0);
    if (!w.enemies.length && w.state === 'playing') {
      w.clearBonus = w.lives * 250; w.score += w.clearBonus; w.state = 'cleared'; w.bullets = []; w.events.push('Sector cleared'); w.cues.push(w.level === LEVELS.length ? 'finalVictory' : 'victory');
    }
  }
  const api = {W, H, LEVELS, TYPES, DURATIONS, create, move, step, accuracy};
  if (typeof module !== 'undefined') module.exports = api; else root.Galactix = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
