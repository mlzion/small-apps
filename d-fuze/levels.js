(function (root, factory) {
  const api = factory(
    typeof module === "object" ? require("./rings.js") : root.DFuzeRings,
  );
  if (typeof module === "object") module.exports = api;
  else root.DFuzeLevels = api;
})(globalThis, (ringSystem) => {
  "use strict";
  const { GEOMETRY } = ringSystem;
  const SETTINGS = Object.freeze({
    turretSpeed: 120,
    fireRate: 4,
    minTimer: 36,
  });
  // time, bomb health, ammo, gate degrees, gate health, category, playback multiplier
  const INITIAL = [
    [48, 3, 24, 100, 2, "easy", 1],
    [44, 5, 32, 80, 3, "medium", 1.05],
    [40, 7, 40, 64, 4, "hard", 1.12],
  ];
  function levelConfig(level) {
    const row = INITIAL[level - 1] || [
      Math.max(SETTINGS.minTimer, 40 - (level - 3)),
      Math.min(9, 7 + Math.floor((level - 3) / 2)),
      44,
      Math.max(48, 64 - (level - 3) * 2),
      Math.min(5, 4 + Math.floor((level - 3) / 3)),
      "hard",
      Math.min(1.25, 1.12 + Math.floor((level - 3) / 2) * 0.025),
    ];
    const [
      time,
      hits,
      ammo,
      gateDegrees,
      gateHealth,
      difficulty,
      animationPlaybackSpeed,
    ] = row;
    return {
      time,
      hits,
      ammo,
      turretSpeed: SETTINGS.turretSpeed,
      fireRate: SETTINGS.fireRate,
      minimumHits: hits + gateHealth,
      animationPlaybackSpeed,
      rings: {
        count: 1,
        radius: GEOMETRY.ringRadius,
        thickness: GEOMETRY.ringThickness,
        spacing: GEOMETRY.ringSpacing,
        gateArc: (gateDegrees * Math.PI) / 180,
        gateHealth,
        difficulty,
        profileFamily: "shared-16",
        alignmentWindowDuration: 2,
        referenceOffset: GEOMETRY.referenceOffset,
        assemblyRotation: 0,
      },
    };
  }
  return { SETTINGS, levelConfig };
});
