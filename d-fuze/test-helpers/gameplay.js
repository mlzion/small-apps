// Test-only support shared by Node suites and injected Chromium tests.
// Deliberately aims at guaranteed openings to test mechanics, not human balance.
(function (root, factory) {
  const node = typeof module === 'object';
  const api = factory(
    node ? require('../experimental-motion.js') : root.DFuzeExperimentalMotion,
    node ? require('../assembly.js') : root.DFuzeAssembly,
    node ? require('../rings.js') : root.DFuzeRings,
  );
  if (node) module.exports = api;
  else root.DFuzeTestGameplay = api;
})(globalThis, (motion, assembly, rings) => {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const near = (actual, expected, label) => check(
    Number.isFinite(actual) && Math.abs(actual - expected) < 1e-7,
    `${label}: ${actual} != ${expected}`,
  );
  function context(game, options) {
    return {
      level: options.level ?? game.testLevel ?? game.levels[game.level - 1],
      ringProfiles: options.ringProfiles ?? game.ringProfiles,
      assemblyProfiles: options.assemblyProfiles ?? game.assemblyProfiles,
    };
  }
  function expectLevel(game, options = {}) {
    const {level} = context(game, options);
    for (const [runtime, source] of Object.entries({
      time: 'timer', hits: 'bombHealth', ammo: 'ammo',
      turretSpeed: 'turretSpeed', fireRate: 'fireRate', motionFamily: 'motionFamily',
    })) check(game.config[runtime] === level[source], `Wrong published ${source}`);
    check(game.rings.length === level.ringCount, 'Wrong ring count');
    check(game.config.assembly.profileId === level.assembly.profileId, 'Wrong assembly profile');
    check(game.config.assembly.playbackSpeed === level.assembly.playbackSpeed, 'Wrong assembly rate');
    check(game.config.minimumHits === level.bombHealth + level.rings.reduce((n,r) => n+r.gateHealth,0), 'Wrong minimum hits');
    game.rings.forEach((r,i) => {
      check(r.number === i+1 && r.parent === game.assembly, 'Wrong ring number/parent');
      near(r.radius, rings.GEOMETRY.ringRadius + i*rings.GEOMETRY.ringSpacing, 'Ring radius');
      near(r.thickness, rings.GEOMETRY.ringThickness, 'Ring thickness');
      near(r.gateArc, level.rings[i].gateWidth*Math.PI/180, 'Gate width');
      check(r.gate.maxHealth === level.rings[i].gateHealth, 'Wrong gate health');
    });
  }
  function expectMotion(game, options = {}) {
    const {level, ringProfiles, assemblyProfiles} = context(game, options);
    const profile = assemblyProfiles.find(p => p.id === level.assembly.profileId);
    check(!!profile, 'Selected assembly profile missing');
    const time = game.elapsed * level.assembly.playbackSpeed;
    const angle = assembly.sampleProfile(profile, time);
    near(game.assembly.time, time, 'Independent assembly clock');
    near(game.assembly.angle, angle, 'Published assembly angle');
    near(game.animationTime, game.elapsed, 'Shared ring clock');
    const assigned = motion.assignProfiles(level, game.seed, ringProfiles, Math.floor(game.elapsed/10));
    game.rings.forEach((r,i) => {
      check(r.profile.id === assigned[i].id, 'Wrong seeded profile/cycle');
      const local = motion.sampleProfile(assigned[i], game.elapsed);
      near(r.relativeAngle, local, 'Local ring angle');
      near(r.displayAngle, angle + local + rings.GEOMETRY.referenceOffset, 'World ring angle');
      near(r.gate.angle, r.displayAngle, 'Gate child angle');
    });
    return angle + rings.GEOMETRY.referenceOffset;
  }
  function nextHold(earliest, family) {
    const {duration, alignmentWindows} = motion.FAMILIES[family];
    const cycle = Math.floor(earliest/duration);
    // The next occurrence is within two cycles; use interiors to avoid edges.
    for (let n=cycle; n<=cycle+1; n++) for (const [start,end] of alignmentWindows) {
      const time = Math.max(earliest, n*duration+start+.001);
      if (time <= n*duration+end-.001) return time;
    }
    throw Error('No alignment hold found');
  }
  function finishLevel(game, options = {}) {
    const {level} = context(game, options);
    expectLevel(game, options);
    check(game.state === 'PLAYING', 'Expected active level');
    let health = level.bombHealth;
    const gateHealth = level.rings.map(r => r.gateHealth);
    const initialAmmo = level.ammo - (options.ammoSpent ?? 0);
    const cooldown = 1/level.fireRate;
    const totalHits = health + gateHealth.reduce((a,b)=>a+b,0);
    const sequence=[], beams=[], firedAt=[];
    let readyAt = Number.isFinite(game.shotAt) ? game.shotAt+cooldown : game.elapsed;
    const expectResources = () => {
      check(game.health === health, 'Wrong bomb health');
      check(game.ammo === initialAmmo-sequence.length, 'Wrong ammo consumption');
      game.rings.forEach((r,i)=>check(r.gate.health===gateHealth[i], `Wrong Ring ${i+1} health`));
    };
    expectResources();
    for (let shot=0; shot<totalHits; shot++) {
      const time = nextHold(Math.max(game.elapsed,readyAt), level.motionFamily);
      check(time < level.timer, 'Required hits do not fit countdown');
      game.update(time-game.elapsed);
      check(game.state === 'PLAYING', 'Level failed before required hit');
      game.angle = expectMotion(game, options);
      game.rings.forEach(r=>near(r.relativeAngle,0,'Alignment hold'));
      const target = gateHealth.findLastIndex(h=>h>0);
      const expectedKind = target>=0 ? 'gate' : 'bomb';
      const radius = target>=0 ? game.rings[target].radius+game.rings[target].thickness/2 : rings.GEOMETRY.bombRadius;
      check(game.fire(), 'Configured cooldown-spaced shot was rejected');
      firedAt.push(game.elapsed);
      near(game.nextShot, game.elapsed+cooldown, 'Configured fire interval');
      readyAt = game.elapsed+cooldown;
      if (target>=0) gateHealth[target]--;
      else health--;
      sequence.push(target>=0 ? target+1 : 'bomb');
      check(game.lastShot.kind === expectedKind, 'Incorrect first collision target');
      near(game.lastShot.point.x, Math.cos(game.angle)*radius, 'Beam endpoint X');
      near(game.lastShot.point.y, Math.sin(game.angle)*radius, 'Beam endpoint Y');
      beams.push(Math.hypot(game.lastShot.point.x,game.lastShot.point.y));
      expectResources(); // independent outside-in expected health, one target per shot
      if (health>0) {
        check(game.state==='PLAYING','Victory/failure before bomb destroyed');
        check(!game.fire(),'Immediate duplicate shot accepted');
        expectResources();
        game.update(cooldown/2);
        check(!game.fire(),'Shot accepted before configured cooldown');
        expectResources();
      }
    }
    check(game.state==='DEFUSING','No victory on final bomb hit');
    const elapsed=game.elapsed, remaining=game.remaining;
    check(!game.fire(),'Firing remains active after victory');
    game.update(1);
    check(game.state==='LEVEL_COMPLETE','Defusal animation did not complete');
    near(game.elapsed,elapsed,'Defused gameplay clock');
    near(game.remaining,remaining,'Defused countdown');
    expectResources();
    return {sequence,beams,firedAt,cooldown,remaining,ammo:game.ammo};
  }
  return {expectLevel,expectMotion,finishLevel};
});
