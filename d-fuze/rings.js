(function (root, factory) {
  const api = factory(
    typeof module === "object" ? require("./motion.js") : root.DFuzeMotion,
  );
  if (typeof module === "object") module.exports = api;
  else root.DFuzeRings = api;
})(globalThis, (motion) => {
  "use strict";
  const TAU = Math.PI * 2,
    EPS = 1e-8;
  const GEOMETRY = Object.freeze({
    bombRadius: 75,
    turretRadius: 235,
    muzzleRadius: 216,
    ringRadius: 108,
    ringSpacing: 30,
    ringThickness: 8,
    referenceOffset: -Math.PI / 2,
  });
  const normalize = (a) => ((a % TAU) + TAU) % TAU;
  function angleInArc(angle, start, sweep) {
    return sweep >= TAU - EPS || normalize(angle - start) <= sweep + EPS;
  }
  // Intersect the actual annular sector, including its radial end faces. This is
  // reusable for noncentral rays; it is not an angular shooting-permission flag.
  function rayArc(origin, direction, radius, thickness, start, sweep) {
    const inner = Math.max(0, radius - thickness / 2),
      outer = radius + thickness / 2,
      candidates = [0];
    const a = direction.x ** 2 + direction.y ** 2;
    if (a < EPS) return null;
    const dot = origin.x * direction.x + origin.y * direction.y;
    for (const r of [inner, outer]) {
      const disc = dot ** 2 - a * (origin.x ** 2 + origin.y ** 2 - r * r);
      if (disc >= -EPS) {
        const d = Math.sqrt(Math.max(0, disc));
        candidates.push((-dot - d) / a, (-dot + d) / a);
      }
    }
    if (sweep < TAU - EPS)
      for (const angle of [start, start + sweep]) {
        const ux = Math.cos(angle),
          uy = Math.sin(angle),
          cross = direction.x * uy - direction.y * ux;
        if (Math.abs(cross) > EPS)
          candidates.push(-(origin.x * uy - origin.y * ux) / cross);
      }
    for (const distance of candidates
      .filter((t) => t >= -EPS)
      .sort((a, b) => a - b)) {
      const t = Math.max(0, distance),
        point = {
          x: origin.x + direction.x * t,
          y: origin.y + direction.y * t,
        },
        r = Math.hypot(point.x, point.y);
      if (
        r >= inner - EPS &&
        r <= outer + EPS &&
        angleInArc(Math.atan2(point.y, point.x), start, sweep)
      )
        return { distance: t, point };
    }
    return null;
  }
  class Gate {
    constructor(ring, health) {
      Object.defineProperty(this, "ring", { value: ring });
      this.health = health;
      this.maxHealth = health;
      this.hitAt = -Infinity;
    }
    get angle() {
      return this.ring.displayAngle;
    }
    get opacity() {
      return this.health === 0 ? 0 : 0.3 + (0.7 * this.health) / this.maxHealth;
    }
    damage(time) {
      if (this.health <= 0) return false;
      this.health--;
      this.hitAt = time;
      return true;
    }
  }
  class Ring {
    constructor(number, settings, profile) {
      this.number = number;
      this.radius = settings.radius;
      this.thickness = settings.thickness;
      this.gateArc = settings.gateArc;
      this.referenceOffset = settings.referenceOffset;
      this.profile = profile;
      this.relativeAngle = 0;
      this.assemblyAngle = 0;
      this.gate = new Gate(this, settings.gateHealth);
    }
    get displayAngle() {
      return this.relativeAngle + this.assemblyAngle + this.referenceOffset;
    }
    update(animationTime) {
      this.relativeAngle = motion.sampleProfile(this.profile, animationTime);
    }
    intersect(shot) {
      const gateStart = this.displayAngle - this.gateArc / 2;
      const wall = rayArc(
        shot.origin,
        shot.direction,
        this.radius,
        this.thickness,
        gateStart + this.gateArc,
        TAU - this.gateArc,
      );
      const gate =
        this.gate.health > 0
          ? rayArc(
              shot.origin,
              shot.direction,
              this.radius,
              this.thickness,
              gateStart,
              this.gateArc,
            )
          : null;
      // A ray touching a shared boundary hits the indestructible wall.
      if (wall && (!gate || wall.distance <= gate.distance + EPS))
        return { ...wall, kind: "wall", target: this, ring: this };
      return gate
        ? { ...gate, kind: "gate", target: this.gate, ring: this }
        : null;
    }
  }
  function resolveShot(shot, world) {
    let nearest = null;
    // Ring numbers run inward to outward; physical radius controls encounter order.
    for (const ring of [...(world.rings || [])].sort(
      (a, b) => b.radius - a.radius,
    )) {
      const hit = ring.intersect(shot);
      if (hit && (!nearest || hit.distance < nearest.distance - EPS))
        nearest = hit;
    }
    const bomb = rayArc(
      shot.origin,
      shot.direction,
      GEOMETRY.bombRadius / 2,
      GEOMETRY.bombRadius,
      0,
      TAU,
    );
    if (bomb && (!nearest || bomb.distance < nearest.distance - EPS))
      nearest = { ...bomb, kind: "bomb", target: world.bomb, damage: 1 };
    return nearest;
  }
  return { GEOMETRY, normalize, angleInArc, rayArc, Gate, Ring, resolveShot };
});
