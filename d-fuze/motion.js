(function (root, factory) {
  const api = factory();
  if (typeof module === "object") module.exports = api;
  else root.DFuzeMotion = api;
})(globalThis, () => {
  "use strict";
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
        const touchesHold =
          profile.protected &&
          (a[0] === 0 ||
            b[0] === 10 ||
            profile.family.alignmentWindows.some(
              ([start, end]) =>
                (a[0] >= start && a[0] <= end) ||
                (b[0] >= start && b[0] <= end),
            ));
        if (a[2] === "smooth" || touchesHold) u = u * u * (3 - 2 * u);
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
  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }
  return { sampleProfile, validateProfile, seededRandom };
});
