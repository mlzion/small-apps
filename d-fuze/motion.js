(function (root, factory) {
  const api = factory();
  if (typeof module === "object") module.exports = api;
  else root.DFuzeMotion = api;
})(globalThis, () => {
  "use strict";
  // All tracks in this family hold zero at the same points. Angles are unwrapped
  // degrees: a 360-degree key intentionally travels a full turn, not the short arc.
  const FAMILY = Object.freeze({
    name: "shared-16",
    duration: 16,
    alignmentWindows: [
      [0, 0.75],
      [6, 8],
      [14, 16],
    ],
  });
  const track = (name, difficulty, first, second, easing = "smooth") => ({
    name,
    difficulty,
    family: FAMILY,
    keyframes: [
      [0, 0, "linear"],
      [0.75, 0, easing],
      ...first,
      [6, 0, "linear"],
      [8, 0, easing],
      ...second,
      [14, 0, "linear"],
      [16, 0, "linear"],
    ],
  });
  const PROFILES = [
    track(
      "Gentle sweep",
      "easy",
      [
        [2.5, 100, "smooth"],
        [4, -55, "smooth"],
      ],
      [
        [10, -100, "smooth"],
        [12, 55, "smooth"],
      ],
    ),
    track(
      "Slow pendulum",
      "easy",
      [
        [2.5, -110, "smooth"],
        [3.5, -110, "smooth"],
        [5, 40, "smooth"],
      ],
      [
        [10, 110, "smooth"],
        [11, 110, "smooth"],
        [13, -40, "smooth"],
      ],
    ),
    track(
      "Double turn",
      "medium",
      [
        [2, 180, "linear"],
        [3, -100, "smooth"],
        [4.5, 70, "smooth"],
      ],
      [
        [9.5, -180, "linear"],
        [11, 100, "smooth"],
        [12.5, -70, "smooth"],
      ],
    ),
    track(
      "Switchback",
      "medium",
      [
        [2, -160, "smooth"],
        [3, -160, "linear"],
        [4.5, 130, "smooth"],
      ],
      [
        [9.5, 160, "smooth"],
        [10.5, 160, "linear"],
        [12.5, -130, "smooth"],
      ],
    ),
    track(
      "Snap reversal",
      "hard",
      [
        [1.8, 240, "linear"],
        [2.8, -160, "linear"],
        [3.4, -160, "linear"],
        [4.8, 160, "linear"],
      ],
      [
        [9, 240, "linear"],
        [10.2, -180, "linear"],
        [11, -180, "linear"],
        [12.7, 160, "linear"],
      ],
      "linear",
    ),
    track(
      "Full circuit",
      "hard",
      [
        [2.5, -360, "linear"],
        [3.2, -360, "linear"],
        [4.7, 150, "smooth"],
      ],
      [
        [10, 360, "linear"],
        [10.8, 360, "linear"],
        [12.7, -150, "smooth"],
      ],
      "linear",
    ),
  ];
  function sampleProfile(profile, time) {
    const t =
      ((time % profile.family.duration) + profile.family.duration) %
      profile.family.duration;
    const keys = profile.keyframes;
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i],
        b = keys[i + 1];
      if (t >= a[0] && t <= b[0]) {
        let u = (t - a[0]) / (b[0] - a[0]);
        if (a[2] === "smooth") u = u * u * (3 - 2 * u);
        return ((a[1] + (b[1] - a[1]) * u) * Math.PI) / 180;
      }
    }
    return 0;
  }
  function validateProfile(profile) {
    const keys = profile.keyframes,
      f = profile.family;
    if (keys[0][0] !== 0 || keys.at(-1)[0] !== f.duration)
      throw new Error("Incomplete profile");
    keys.forEach((k, i) => {
      if (
        !Number.isFinite(k[0]) ||
        !Number.isFinite(k[1]) ||
        (i && k[0] <= keys[i - 1][0]) ||
        !["linear", "smooth"].includes(k[2])
      )
        throw new Error("Invalid keyframe");
    });
    for (const [start, end] of f.alignmentWindows) {
      if (
        !keys.some((k) => k[0] === start && k[1] === 0) ||
        !keys.some((k) => k[0] === end && k[1] === 0) ||
        keys.some((k) => k[0] >= start && k[0] <= end && k[1] !== 0)
      )
        throw new Error("Misaligned profile");
    }
    return true;
  }
  PROFILES.forEach(validateProfile);
  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }
  function selectProfile(difficulty, random, familyName = FAMILY.name) {
    const pool = PROFILES.filter(
      (p) => p.difficulty === difficulty && p.family.name === familyName,
    );
    if (!pool.length) throw new Error("No compatible motion profile");
    return pool[Math.floor(random() * pool.length)];
  }
  return {
    FAMILY,
    PROFILES,
    sampleProfile,
    validateProfile,
    seededRandom,
    selectProfile,
  };
});
