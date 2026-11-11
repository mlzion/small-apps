/* Central progression configuration and session state; shared by browser and simulations. */
(function (root) {
  'use strict';
  const {defaults} = typeof module !== 'undefined' ? require('./engine.js') : root.LaserBreak;
  const CONFIG = Object.freeze({
    levelCount: 25, duration: 45, testingLevelSelect: true,
    speedRate: 1.02, targetSpeed: 50, barSpeed: 35,
    plateauEvery: 4,
    density: 20, densityStep: 3, maxDensity: 60,
    barPercentage: 20, barStep: 10, maxBars: 60,
    targetSize: 40, sizeStep: 2, minSize: 24,
    barRotation: 45, rotationStep: 8, maxRotation: 140,
    maxTargetSpeed: 140, maxBarSpeed: 110,
    requiredDestructionPercent: Object.freeze({start:40, end:80, rampLevels:25, plateauWeight:2, softWeight:1, hardWeight:0}),
    barLength: 100, cooldown: .75, blastMultiplier: 3
  });
  function generateLevel(levelNumber) {
    if (!Number.isSafeInteger(levelNumber) || levelNumber < 1) throw new RangeError('Level must be a positive integer');
    const n = levelNumber - 1;
    // Three budget points per four levels. Only one additional axis gets each point.
    const budget = n - Math.floor(n / CONFIG.plateauEvery);
    const points = axis => Math.floor(budget / 4) + (budget % 4 > axis ? 1 : 0);
    const settings = {
      ...defaults,
      targetSpeed: Math.min(CONFIG.maxTargetSpeed, CONFIG.targetSpeed * CONFIG.speedRate ** n),
      barSpeed: Math.min(CONFIG.maxBarSpeed, CONFIG.barSpeed * CONFIG.speedRate ** n),
      density: Math.min(CONFIG.maxDensity, CONFIG.density + CONFIG.densityStep * points(0)),
      barPercentage: Math.min(CONFIG.maxBars, CONFIG.barPercentage + CONFIG.barStep * points(1)),
      targetSize: Math.max(CONFIG.minSize, CONFIG.targetSize - CONFIG.sizeStep * points(2)),
      barRotation: Math.min(CONFIG.maxRotation, CONFIG.barRotation + CONFIG.rotationStep * points(3)),
      barLength: CONFIG.barLength, cooldown: CONFIG.cooldown, blastMultiplier: CONFIG.blastMultiplier
    };
    // Threshold budget pauses on bar-share/precision steps and grows most on physical plateaus.
    const policy = CONFIG.requiredDestructionPercent;
    const units = index => {
      const physical = index - Math.floor(index / CONFIG.plateauEvery);
      const axis = j => Math.floor(physical / 4) + (physical % 4 > j ? 1 : 0);
      return (index - physical) * policy.plateauWeight + (axis(0) + axis(3)) * policy.softWeight +
        (axis(1) + axis(2)) * policy.hardWeight;
    };
    const thresholdBudget = units(n), total = units(policy.rampLevels - 1);
    const requiredDestructionPercent = Math.round((policy.start + (policy.end - policy.start) * Math.min(1,thresholdBudget/total)) * 10) / 10;
    return {number:levelNumber,duration:CONFIG.duration,requiredDestructionPercent,budget,thresholdBudget,settings};
  }
  function defenseResult(stats, requiredDestructionPercent) {
    const resolved = stats.targets + stats.escaped;
    return {resolved,percent:resolved ? stats.targets/resolved*100 : null,
      passed:resolved>0 && stats.targets*1000 >= Math.round(requiredDestructionPercent*10)*resolved};
  }

  class ArcadeSession {
    constructor(world) {
      this.world = world;
      this.mode = 'free';
      this.state = 'playing';
      this.level = null;
      this.freeSettings = null;
      this.lastResult = null;
      this.elapsed = 0;
      this.warningCount = 0;
    }
    setMode(mode) {
      if (!['free', 'arcade'].includes(mode)) throw new RangeError('Unknown game mode');
      if (mode === this.mode) return;
      const w = this.world;
      const preferences = {sound: w.settings.sound, debug: w.settings.debug};
      if (mode === 'arcade') {
        this.freeSettings = {...w.settings};
        w.trackEscapes = true;
        this.mode = mode;
        this.level = generateLevel(1);
        w.settings = {...this.level.settings, ...preferences};
        w.start();
        w.clear();
        w.bag.length = 0;
        w.arcadeBlocked = true;
        this.state = 'ready';
      } else {
        this.mode = mode;
        w.trackEscapes = false;
        w.settings = {...this.freeSettings, ...preferences};
        w.arcadeBlocked = false;
        w.start();
        this.level = null;
        this.state = 'playing';
      }
      this.lastResult = null;
      this.elapsed = 0;
      this.warningCount = 0;
    }
    begin(levelNumber = 1) {
      if (this.mode !== 'arcade' || levelNumber < 1 || levelNumber > CONFIG.levelCount) throw new RangeError('Invalid Arcade level');
      this.level = generateLevel(levelNumber);
      const w = this.world;
      w.settings = {...this.level.settings, sound: w.settings.sound, debug: w.settings.debug};
      w.arcadeBlocked = false;
      w.trackEscapes = true;
      w.start();
      this.state = 'playing';
      this.lastResult = null;
      this.elapsed = 0;
      this.warningCount = 0;
    }
    get defense() {return defenseResult(this.world.stats,this.level ? this.level.requiredDestructionPercent : 100);}
    get remaining() {
      return this.level ? Math.max(0, this.level.duration - this.elapsed) : 0;
    }
    stop() {
      this.world.stop();
      if (this.mode === 'arcade') {this.state = 'stopped'; this.world.arcadeBlocked = true;}
    }
    start() {
      if (this.mode === 'arcade') this.begin(this.level.number);
      else this.world.start();
    }
    step(dt) {
      const w = this.world;
      if (this.mode === 'free') {w.step(dt); return;}
      if (this.state !== 'playing' || !w.running || w.paused || w.settingsOpen || w.orientationBlocked || w.arcadeBlocked || !(dt > 0)) return;
      const active = Math.min(dt, this.remaining), movement = Math.min(active, .1);
      const wasPassing = this.defense.passed;
      w.step(movement); // No catch-up movement/spawn burst after a slow frame.
      w.time += active - movement; // Cooldown and countdown track active elapsed time.
      this.elapsed += active;
      const defense = this.defense;
      if (wasPassing && !defense.passed && defense.resolved >= 5) this.warningCount++;
      if (this.elapsed + 1e-8 < this.level.duration) return;
      this.elapsed = this.level.duration;
      w.time = this.level.duration;
      const {passed,percent,resolved} = defense;
      this.lastResult = {level:this.level.number,requiredDestructionPercent:this.level.requiredDestructionPercent,...w.stats,percent,resolved,passed};
      this.state = passed ? (this.level.number === CONFIG.levelCount ? 'victory' : 'between') : 'retry';
      w.arcadeBlocked = true;
    }
  }
  const api = {CONFIG, generateLevel, defenseResult, ArcadeSession};
  if (typeof module !== 'undefined') module.exports = api;
  else root.LaserArcade = api;
})(typeof window === 'undefined' ? globalThis : window);
