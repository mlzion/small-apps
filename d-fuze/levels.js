(function (root, factory) {
  const api = factory(
    typeof module === "object"
      ? require("./level-schema.js")
      : root.DFuzeSchema,
  );
  if (typeof module === "object") module.exports = api;
  else root.DFuzeLevels = api;
})(globalThis, (schema) => {
  "use strict";
  const SETTINGS = Object.freeze({ turretSpeed: 120, fireRate: 4 });
  function publishedLevel(number) {
    if (!Number.isInteger(number) || number < 1 || number > 6)
      throw new Error("Only six published levels are available.");
    const level = schema.defaults().levels[number - 1];
    // Preserve established one-ring resources; only their motion library migrates.
    if (number <= 3) {
      const rows = [
        [48, 3, 24, 100, 2, "easy", 1],
        [44, 5, 32, 80, 3, "medium", 1.05],
        [40, 7, 40, 64, 4, "hard", 1.12],
      ];
      const [
        timer,
        bombHealth,
        ammo,
        gateWidth,
        gateHealth,
        family,
        playbackSpeed,
      ] = rows[number - 1];
      Object.assign(level, { timer, bombHealth, ammo, playbackSpeed });
      Object.assign(level.rings[0], schema.defaultRing(1, family), {
        gateWidth,
        gateHealth,
      });
    }
    return level;
  }
  function levelConfig(number) {
    return schema.toRuntime(publishedLevel(number)).config;
  }
  return { SETTINGS, publishedLevel, levelConfig };
});
