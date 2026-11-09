(function (root, factory) {
  const api = factory();
  if (typeof module === "object") module.exports = api;
  else root.DFuzeAssembly = api;
})(globalThis, () => {
  "use strict";
  const defaults = () => [
    {
      id: "gentle-drift",
      name: "Gentle Drift",
      duration: 25,
      keyframes: [
        [0, 0],
        [5, 24],
        [10, 12],
        [16, -18],
        [21, -8],
        [25, 0],
      ],
    },
  ];
  function validateProfile(p) {
    const errors = [];
    if (!p || typeof p !== "object" || Array.isArray(p))
      return ["Assembly profile must be an object."];
    if (
      Object.keys(p).some(
        (k) => !["id", "name", "duration", "keyframes"].includes(k),
      )
    )
      errors.push("Unknown assembly profile field.");
    if (typeof p.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(p.id))
      errors.push(
        "Assembly profile ID must contain lowercase letters, numbers or hyphens.",
      );
    if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 80)
      errors.push("Assembly profile name must be 1–80 characters.");
    if (!Number.isFinite(p.duration) || p.duration < 1 || p.duration > 300)
      errors.push("Assembly duration must be 1–300 seconds.");
    if (
      !Array.isArray(p.keyframes) ||
      p.keyframes.length < 2 ||
      p.keyframes.length > 100
    )
      return [...errors, "Assembly profile needs 2–100 keyframes."];
    p.keyframes.forEach((k, i) => {
      if (
        !Array.isArray(k) ||
        k.length !== 2 ||
        !Number.isFinite(k[0]) ||
        !Number.isFinite(k[1]) ||
        Math.abs(k[1]) > 100000 ||
        k[0] < 0 ||
        k[0] > p.duration ||
        (i && k[0] <= p.keyframes[i - 1]?.[0])
      )
        errors.push(
          `Assembly key ${i + 1}: use increasing finite times and angles within ±100000°.`,
        );
    });
    if (p.keyframes[0]?.[0] !== 0 || p.keyframes.at(-1)?.[0] !== p.duration)
      errors.push(
        "Assembly keys must start at 0 and end at the cycle duration.",
      );
    return errors;
  }
  function validateLibrary(profiles) {
    if (
      !Array.isArray(profiles) ||
      profiles.length < 1 ||
      profiles.length > 256
    )
      return ["Provide 1–256 assembly profiles."];
    const errors = profiles.flatMap((p, i) =>
      validateProfile(p).map((e) => `Assembly profile ${i + 1}: ${e}`),
    );
    if (new Set(profiles.map((p) => p?.id)).size !== profiles.length)
      errors.push("Assembly profile IDs must be unique.");
    return errors;
  }
  // Shape-preserving cubic Hermite interpolation (weighted harmonic tangents).
  // Opposing slopes get a zero tangent, avoiding overshoot at reversals. Both
  // endpoints use the same periodic tangent for continuous velocity at the seam.
  function harmonic(a, b, ha, hb) {
    if (a * b <= 0) return 0;
    const w1 = 2 * hb + ha,
      w2 = hb + 2 * ha;
    return (w1 + w2) / (w1 / a + w2 / b);
  }
  function sampleProfile(p, time) {
    const keys = p.keyframes,
      n = keys.length - 1,
      cycles = Math.floor(time / p.duration),
      t = time - cycles * p.duration;
    const h = Array.from({ length: n }, (_, i) => keys[i + 1][0] - keys[i][0]),
      d = h.map((v, i) => (keys[i + 1][1] - keys[i][1]) / v);
    const seam = harmonic(d[n - 1], d[0], h[n - 1], h[0]);
    let i = 0;
    while (i < n - 1 && t > keys[i + 1][0]) i++;
    const m0 = i === 0 ? seam : harmonic(d[i - 1], d[i], h[i - 1], h[i]);
    const m1 = i === n - 1 ? seam : harmonic(d[i], d[i + 1], h[i], h[i + 1]);
    const u = (t - keys[i][0]) / h[i],
      u2 = u * u,
      u3 = u2 * u;
    const angle =
      (2 * u3 - 3 * u2 + 1) * keys[i][1] +
      (u3 - 2 * u2 + u) * h[i] * m0 +
      (-2 * u3 + 3 * u2) * keys[i + 1][1] +
      (u3 - u2) * h[i] * m1;
    return ((angle + cycles * (keys[n][1] - keys[0][1])) * Math.PI) / 180;
  }
  class RingsAssembly {
    constructor(children, settings, profile) {
      this.children = children;
      this.settings = settings;
      this.profile = profile;
      this.time = 0;
      this.angle = 0;
      for (const ring of children)
        Object.defineProperty(ring, "parent", {
          value: this,
          configurable: true,
        });
      this.update(0);
    }
    update(gameTime) {
      this.time = gameTime * this.settings.playbackSpeed;
      this.angle = sampleProfile(this.profile, this.time);
    }
  }
  return {
    defaults,
    validateProfile,
    validateLibrary,
    sampleProfile,
    RingsAssembly,
  };
});
