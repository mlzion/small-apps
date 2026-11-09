(function (root, factory) {
  const api = factory(
    typeof module === "object" ? require("./rings.js") : root.DFuzeRings,
    typeof module === "object" ? require("./levels.js") : root.DFuzeLevels,
    typeof module === "object"
      ? require("./level-schema.js")
      : root.DFuzeSchema,
    typeof module === "object" ? require("./assembly.js") : root.DFuzeAssembly,
  );
  if (typeof module === "object") module.exports = api;
  else root.DFuze = api;
})(globalThis, (ringSystem, levels, schema, assemblyMotion) => {
  "use strict";
  const STATES = Object.freeze(
    Object.fromEntries(
      [
        "MAIN_MENU",
        "PLAYING",
        "PAUSED",
        "DEFUSING",
        "EXPLODING",
        "LEVEL_COMPLETE",
        "LEVEL_FAILED",
        "GAME_OVER",
      ].map((s) => [s, s]),
    ),
  );
  const { levelConfig } = levels;
  const { resolveShot, GEOMETRY, Ring } = ringSystem;
  class Game {
    constructor(
      emit = () => {},
      resolver = resolveShot,
      {
        seed = undefined,
        testLevel = null,
        assemblyProfiles = assemblyMotion.defaults(),
        ringProfiles = undefined,
      } = {},
    ) {
      if (testLevel)
        schema.toRuntime(testLevel, seed, assemblyProfiles, ringProfiles);
      this.testLevel = testLevel ? schema.clone(testLevel) : null;
      this.testMode = !!testLevel;
      // Capture the complete published document once per session. Starting,
      // retrying or advancing never consults a later loader revision.
      const published = this.testMode ? null : levels.publishedDocument();
      this.levels = this.testMode ? [this.testLevel] : published.levels;
      this.assemblyProfiles = this.testMode
        ? schema.clone(assemblyProfiles)
        : published.assemblyProfiles;
      this.ringProfiles = this.testMode
        ? ringProfiles
          ? schema.clone(ringProfiles)
          : undefined
        : published.ringProfiles;
      this.seedOverride = seed !== undefined;
      this.seed =
        (seed ?? this.testLevel?.seed ?? this.levels[0].seed) >>> 0;
      this.emit = emit;
      this.resolver = resolver;
      this.state = STATES.MAIN_MENU;
      this.level = this.testLevel?.number ?? 1;
      this.lives = 3;
      this.resetLevel();
    }
    transition(next) {
      if (this.state === next) return;
      this.state = next;
      this.emit("state", next);
    }
    get levelCount() {
      return this.levels.length;
    }
    get hasNextLevel() {
      return !this.testMode && this.level < this.levelCount;
    }
    resetLevel() {
      const level = this.testMode ? this.testLevel : this.levels[this.level - 1];
      if (!level) throw new Error(`Published Level ${this.level} is missing.`);
      if (!this.testMode && !this.seedOverride) this.seed = level.seed;
      const experimental = schema.toRuntime(
        level,
        this.seed,
        this.assemblyProfiles,
        this.ringProfiles,
      );
      this.config = experimental.config;
      this.remaining = this.config.time;
      this.health = this.config.hits;
      this.ammo = this.config.ammo;
      this.angle = -Math.PI / 2;
      this.elapsed = 0;
      this.nextShot = 0;
      this.nextPulse = 1;
      this.pulseAt = -Infinity;
      this.hitAt = -Infinity;
      this.shotAt = -Infinity;
      this.effectTime = 0;
      this.animationTime = 0;
      this.lastShot = null;
      this.rings = Array.from(
        { length: this.config.rings.count },
        (_, i) =>
          new Ring(
            i + 1,
            {
              ...this.config.rings,
              ...experimental?.ringSettings[i],
              radius: this.config.rings.radius + i * this.config.rings.spacing,
            },
            experimental.profiles[i],
          ),
      );
      this.assembly = new assemblyMotion.RingsAssembly(
        this.rings,
        this.config.assembly,
        experimental.assemblyProfile,
      );
      this.updateRings();
    }
    updateRings() {
      this.animationTime = this.elapsed * this.config.animationPlaybackSpeed;
      this.assembly.update(this.elapsed);
      this.assemblyAngle = this.assembly.angle;
      for (const ring of this.rings) ring.update(this.animationTime);
    }
    newGame() {
      this.level = this.testLevel?.number ?? 1;
      this.lives = 3;
      this.startLevel();
    }
    startLevel() {
      this.resetLevel();
      this.transition(STATES.PLAYING);
      this.emit("begin");
    }
    nextLevel() {
      if (!this.hasNextLevel || this.state !== STATES.LEVEL_COMPLETE) return;
      this.level++;
      this.startLevel();
    }
    retry() {
      if (
        this.testMode &&
        [STATES.LEVEL_COMPLETE, STATES.LEVEL_FAILED, STATES.GAME_OVER].includes(
          this.state,
        )
      ) {
        this.lives = 3;
        this.startLevel();
        return;
      }
      if (this.state === STATES.LEVEL_FAILED) this.startLevel();
    }
    pause() {
      if (this.state === STATES.PLAYING) this.transition(STATES.PAUSED);
    }
    resume() {
      if (this.state === STATES.PAUSED) this.transition(STATES.PLAYING);
    }
    menu() {
      this.transition(STATES.MAIN_MENU);
    }
    fire() {
      if (
        this.state !== STATES.PLAYING ||
        this.ammo <= 0 ||
        this.elapsed + 1e-9 < this.nextShot
      )
        return false;
      this.ammo--;
      this.nextShot = this.elapsed + 1 / this.config.fireRate;
      this.shotAt = this.elapsed;
      this.emit("fire");
      this.updateRings();
      const result = this.resolver(
        {
          angle: this.angle,
          origin: {
            x: Math.cos(this.angle) * GEOMETRY.muzzleRadius,
            y: Math.sin(this.angle) * GEOMETRY.muzzleRadius,
          },
          direction: { x: -Math.cos(this.angle), y: -Math.sin(this.angle) },
        },
        { bomb: this, rings: this.rings },
      );
      this.lastShot = result
        ? {
            kind: result.kind,
            point: result.point,
            angle: this.angle,
            time: this.elapsed,
          }
        : null;
      if (result?.kind === "gate" && result.target.damage(this.elapsed)) {
        this.emit("gateHit");
        if (result.target.health === 0) this.emit("gateBreak");
      }
      if (result?.kind === "wall") this.emit("wallHit");
      if (result?.target === this) {
        this.health = Math.max(0, this.health - result.damage);
        this.hitAt = this.elapsed;
        this.emit("hit");
      }
      if (this.health === 0) {
        this.effectTime = 0;
        this.transition(STATES.DEFUSING);
        this.emit("defuse");
      } else if (this.ammo === 0) this.fail();
      return true;
    }
    fail() {
      if (this.state !== STATES.PLAYING) return;
      this.lives--;
      this.effectTime = 0;
      this.transition(STATES.EXPLODING);
      this.emit("explode");
      this.emit("destroy");
    }
    update(dt, input = {}) {
      if (!Number.isFinite(dt) || dt < 0) return;
      if (this.state === STATES.DEFUSING || this.state === STATES.EXPLODING) {
        this.effectTime += dt;
        if (this.effectTime >= (this.state === STATES.DEFUSING ? 1 : 1.3))
          this.transition(
            this.state === STATES.DEFUSING
              ? STATES.LEVEL_COMPLETE
              : this.lives
                ? STATES.LEVEL_FAILED
                : STATES.GAME_OVER,
          );
        return;
      }
      if (this.state !== STATES.PLAYING) return;
      const end = Math.min(this.config.time, this.elapsed + dt);
      // Process scheduled events on the gameplay clock, independent of rendering frequency.
      if (input.fire) this.fire();
      while (this.state === STATES.PLAYING && this.elapsed < end - 1e-9) {
        const shot = input.fire ? this.nextShot : Infinity;
        const next = Math.min(end, this.nextPulse, shot);
        const step = Math.max(0, next - this.elapsed);
        this.angle +=
          ((((input.cw ? 1 : 0) - (input.ccw ? 1 : 0)) *
            this.config.turretSpeed *
            Math.PI) /
            180) *
          step;
        this.elapsed = next;
        this.updateRings();
        this.remaining = Math.max(0, this.config.time - next);
        if (this.remaining <= 1e-9) {
          this.remaining = 0;
          this.fail();
          break;
        }
        if (this.elapsed + 1e-9 >= this.nextPulse) {
          this.pulseAt = this.elapsed;
          this.emit("pulse", this.remaining <= 5);
          this.nextPulse += this.remaining <= 5 ? 0.5 : 1;
        }
        if (input.fire && this.elapsed + 1e-9 >= this.nextShot) this.fire();
      }
    }
  }
  return { Game, STATES, levelConfig, resolveShot };
});
