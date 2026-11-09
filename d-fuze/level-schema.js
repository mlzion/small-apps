(function (root, factory) {
  const api = factory(
    typeof module === "object"
      ? require("./experimental-motion.js")
      : root.DFuzeExperimentalMotion,
    typeof module === "object" ? require("./rings.js") : root.DFuzeRings,
  );
  if (typeof module === "object") module.exports = api;
  else root.DFuzeSchema = api;
})(globalThis, (motion, ringSystem) => {
  "use strict";
  const VERSION = 1,
    FORMAT = "d-fuze-levels",
    TEST_KEY = "d-fuze-test-v1",
    SESSION_KEY = "d-fuze-editor-session-v1",
    DRAFT_KEY = "d-fuze-builder-draft-v1";
  const FIELDS = {
    timer: { label: "Timer (s)", min: 5, max: 300, step: 1 },
    bombHealth: { label: "Bomb HP", min: 1, max: 100, step: 1 },
    ammo: { label: "Ammo", min: 1, max: 999, step: 1 },
    turretSpeed: { label: "Turret °/s", min: 15, max: 360, step: 1 },
    fireRate: { label: "Shots/s", min: 1, max: 12, step: 0.25 },
    ringCount: { label: "Rings", min: 1, max: 4, step: 1 },
    playbackSpeed: { label: "Playback ×", min: 0.25, max: 3, step: 0.05 },
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function defaultRing(number, family = "easy") {
    return {
      number,
      gateWidth: 100,
      gateHealth: 2,
      family,
      profiles: motion.eligible(family).map((p) => p.id),
    };
  }
  function defaults() {
    return {
      format: FORMAT,
      version: VERSION,
      motionLibrary: motion.LIBRARY_ID,
      levels: Array.from({ length: 12 }, (_, i) => {
        const group = Math.floor(i / 3),
          stage = i % 3,
          count = group + 1;
        const rings = Array.from({ length: count }, (_, r) => {
          const family = ["easy", "medium", "hard"][
            Math.max(0, stage - Math.floor(r / 2))
          ];
          return {
            ...defaultRing(r + 1, family),
            gateWidth: 110 - stage * 15 - r * 4,
            gateHealth: 2 + stage,
          };
        });
        return {
          number: i + 1,
          name: `Draft ${i + 1}`,
          timer: 65 + group * 12 - stage * 6,
          bombHealth: 3 + stage * 2,
          ammo: 30 + count * 10 + stage * 8,
          turretSpeed: 120,
          fireRate: 4,
          ringCount: count,
          playbackSpeed: 1 + stage * 0.05,
          seed: 4200 + i,
          assembly: { enabled: false },
          rings,
        };
      }),
    };
  }
  function validateLevel(level, label = "Level") {
    const errors = [];
    const fail = (s) => errors.push(`${label}: ${s}`);
    if (!level || typeof level !== "object" || Array.isArray(level))
      return [`${label}: expected a level object.`];
    const allowed = [
      "number",
      "name",
      ...Object.keys(FIELDS),
      "seed",
      "assembly",
      "rings",
    ];
    for (const key of Object.keys(level))
      if (!allowed.includes(key)) fail(`unknown field “${key}”.`);
    const number = (value, min, max, integer = false) =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max &&
      (!integer || Number.isInteger(value));
    if (!number(level.number, 1, 999999, true))
      fail("level number must be a positive integer.");
    if (
      level.name !== undefined &&
      (typeof level.name !== "string" || level.name.length > 80)
    )
      fail("name must be text up to 80 characters.");
    for (const [key, field] of Object.entries(FIELDS))
      if (!number(level[key], field.min, field.max, field.step === 1))
        fail(
          `${field.label} must be ${field.min}–${field.max}${field.step === 1 ? " (whole numbers)" : ""}.`,
        );
    if (!number(level.seed, 0, 4294967295, true))
      fail("seed must be a whole number from 0 to 4294967295.");
    if (
      !level.assembly ||
      typeof level.assembly.enabled !== "boolean" ||
      Object.keys(level.assembly).some(
        (k) => !["enabled", "speed"].includes(k),
      ) ||
      (level.assembly.speed !== undefined &&
        !number(level.assembly.speed, -180, 180)) ||
      (level.assembly.enabled && level.assembly.speed === undefined)
    )
      fail(
        "assembly requires enabled and a constant speed from -180 to 180 degrees/second.",
      );
    if (!Array.isArray(level.rings) || level.rings.length !== level.ringCount)
      fail("ring configuration count must equal Rings.");
    if (Array.isArray(level.rings))
      level.rings.slice(0, 4).forEach((ring, i) => {
        if (!ring || typeof ring !== "object" || Array.isArray(ring)) {
          fail(`Ring ${i + 1} must be an object.`);
          return;
        }
        for (const k of Object.keys(ring))
          if (
            ![
              "number",
              "gateWidth",
              "gateHealth",
              "family",
              "profiles",
            ].includes(k)
          )
            fail(`Ring ${i + 1}: unknown field “${k}”.`);
        if (ring.number !== i + 1)
          fail("rings must be numbered consecutively from the inside outward.");
        if (!number(ring.gateWidth, 10, 180))
          fail(`Ring ${i + 1}: gate width must be 10–180 degrees.`);
        if (!number(ring.gateHealth, 1, 50, true))
          fail(`Ring ${i + 1}: gate health must be 1–50.`);
        if (!Object.hasOwn(motion.FAMILIES, ring.family))
          fail(`Ring ${i + 1}: unknown motion family.`);
        if (
          !Array.isArray(ring.profiles) ||
          ring.profiles.length === 0 ||
          ring.profiles.length > 5
        ) {
          fail(`Ring ${i + 1}: enable at least one of its five profiles.`);
          return;
        }
        if (new Set(ring.profiles).size !== ring.profiles.length)
          fail(`Ring ${i + 1}: duplicate profile IDs.`);
        for (const id of ring.profiles)
          if (
            typeof id !== "string" ||
            motion.BY_ID.get(id)?.difficulty !== ring.family
          )
            fail(
              `Ring ${i + 1}: profile “${String(id)}” does not belong to ${ring.family}.`,
            );
      });
    if (errors.length === 0) {
      const minimumHits =
        level.bombHealth + level.rings.reduce((s, r) => s + r.gateHealth, 0);
      if (level.ammo < minimumHits)
        fail(`ammo must be at least ${minimumHits} (gates + bomb).`);
      if ((minimumHits - 1) / level.fireRate >= level.timer)
        fail("timer is too short even for perfect cooldown-spaced hits.");
    }
    return errors;
  }
  function validateDocument(doc) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc))
      return ["Expected a configuration object."];
    const errors = [];
    if (
      doc.format !== FORMAT ||
      doc.version !== VERSION ||
      doc.motionLibrary !== motion.LIBRARY_ID
    )
      errors.push(
        "Unsupported configuration format, schema version, or motion library.",
      );
    for (const k of Object.keys(doc))
      if (!["format", "version", "motionLibrary", "levels"].includes(k))
        errors.push(`Unknown document field “${k}”.`);
    if (
      !Array.isArray(doc.levels) ||
      doc.levels.length < 1 ||
      doc.levels.length > 200
    )
      return [...errors, "Provide 1–200 levels."];
    doc.levels.forEach((l, i) =>
      errors.push(...validateLevel(l, `Row ${i + 1}`)),
    );
    const numbers = doc.levels.map((l) => l?.number);
    if (new Set(numbers).size !== numbers.length)
      errors.push("Level numbers must be unique.");
    return errors;
  }
  function requireValid(doc) {
    const errors = validateDocument(doc);
    if (errors.length) throw new Error(errors.join("\n"));
    return clone(doc);
  }
  function importJSON(text) {
    if (typeof text !== "string" || text.length > 1000000)
      throw new Error("JSON must be smaller than 1 MB.");
    let doc;
    try {
      doc = JSON.parse(text);
    } catch {
      throw new Error("Could not read JSON. Check its syntax.");
    }
    return requireValid(doc);
  }
  function exportJSON(doc) {
    return JSON.stringify(requireValid(doc), null, 2);
  }
  function exportCSV(doc) {
    requireValid(doc);
    const columns = ["number", "name", ...Object.keys(FIELDS), "seed"];
    const cell = (v) => {
      let text = String(v ?? "");
      if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
      return `"${text.replace(/"/g, '""')}"`;
    };
    return [
      columns.join(","),
      ...doc.levels.map((l) => columns.map((k) => cell(l[k])).join(",")),
    ].join("\r\n");
  }
  function toRuntime(level, seed = level.seed) {
    const errors = validateLevel(level);
    if (errors.length) throw new Error(errors.join("\n"));
    if (level.ringCount > 2)
      throw new Error(
        "Three- and four-ring gameplay arrives in Phase 5. Use animation preview.",
      );
    const r = level.rings[0],
      g = ringSystem.GEOMETRY;
    return {
      config: {
        time: level.timer,
        hits: level.bombHealth,
        ammo: level.ammo,
        minimumHits:
          level.bombHealth +
          level.rings.reduce((sum, r) => sum + r.gateHealth, 0),
        turretSpeed: level.turretSpeed,
        fireRate: level.fireRate,
        animationPlaybackSpeed: level.playbackSpeed,
        assemblySpeed: level.assembly.enabled ? level.assembly.speed : 0,
        rings: {
          count: level.ringCount,
          difficulty: r.family,
          radius: g.ringRadius,
          thickness: g.ringThickness,
          spacing: g.ringSpacing,
          gateArc: (r.gateWidth * Math.PI) / 180,
          gateHealth: r.gateHealth,
          referenceOffset: g.referenceOffset,
        },
      },
      ringSettings: level.rings.map((r) => ({
        gateArc: (r.gateWidth * Math.PI) / 180,
        gateHealth: r.gateHealth,
      })),
      profiles: motion.assignProfiles(level, seed),
    };
  }
  function testPayload(level) {
    toRuntime(level);
    return JSON.stringify({
      format: "d-fuze-test",
      version: VERSION,
      motionLibrary: motion.LIBRARY_ID,
      level: clone(level),
    });
  }
  function readTest(text) {
    if (typeof text !== "string" || text.length > 1000000)
      throw new Error("Missing or oversized Test Mode transfer.");
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("Invalid Test Mode JSON.");
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid Test Mode transfer.");
    if (
      value.format !== "d-fuze-test" ||
      value.version !== VERSION ||
      value.motionLibrary !== motion.LIBRARY_ID ||
      Object.keys(value).some(
        (k) => !["format", "version", "motionLibrary", "level"].includes(k),
      )
    )
      throw new Error("Invalid Test Mode transfer.");
    toRuntime(value.level);
    return clone(value.level);
  }
  function saveDraft(storage, doc) {
    storage.setItem(DRAFT_KEY, exportJSON(doc));
  }
  function loadDraft(storage) {
    const text = storage.getItem(DRAFT_KEY);
    if (!text) throw new Error("No draft saved in this browser.");
    return importJSON(text);
  }
  return {
    VERSION,
    FORMAT,
    TEST_KEY,
    SESSION_KEY,
    DRAFT_KEY,
    FIELDS,
    clone,
    defaultRing,
    defaults,
    validateLevel,
    validateDocument,
    requireValid,
    importJSON,
    exportJSON,
    exportCSV,
    toRuntime,
    testPayload,
    readTest,
    saveDraft,
    loadDraft,
  };
});
