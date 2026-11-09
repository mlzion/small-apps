(function (root, factory) {
  const api = factory(
    typeof module === "object"
      ? require("./experimental-motion.js")
      : root.DFuzeExperimentalMotion,
    typeof module === "object" ? require("./rings.js") : root.DFuzeRings,
    typeof module === "object" ? require("./assembly.js") : root.DFuzeAssembly,
  );
  if (typeof module === "object") module.exports = api;
  else root.DFuzeSchema = api;
})(globalThis, (motion, ringSystem, assemblyMotion) => {
  "use strict";
  const VERSION = 2,
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
      assemblyProfiles: assemblyMotion.defaults(),
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
          assembly: {
            enabled: false,
            profileId: "gentle-drift",
            playbackSpeed: 1,
          },
          rings,
        };
      }),
    };
  }
  function validateLevel(
    level,
    label = "Level",
    assemblyProfiles = assemblyMotion.defaults(),
  ) {
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
        (k) => !["enabled", "profileId", "playbackSpeed"].includes(k),
      ) ||
      !number(level.assembly.playbackSpeed, 0.1, 4) ||
      !assemblyProfiles.some((p) => p?.id === level.assembly.profileId)
    )
      fail(
        "assembly requires an existing profile ID and playback multiplier 0.1–4.",
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
      if (
        ![
          "format",
          "version",
          "motionLibrary",
          "levels",
          "assemblyProfiles",
        ].includes(k)
      )
        errors.push(`Unknown document field “${k}”.`);
    if (
      !Array.isArray(doc.levels) ||
      doc.levels.length < 1 ||
      doc.levels.length > 200
    )
      return [...errors, "Provide 1–200 levels."];
    errors.push(...assemblyMotion.validateLibrary(doc.assemblyProfiles));
    doc.levels.forEach((l, i) =>
      errors.push(
        ...validateLevel(
          l,
          `Row ${i + 1}`,
          Array.isArray(doc.assemblyProfiles) ? doc.assemblyProfiles : [],
        ),
      ),
    );
    const numbers = doc.levels.map((l) => l?.number);
    if (new Set(numbers).size !== numbers.length)
      errors.push("Level numbers must be unique.");
    return errors;
  }
  function requireValid(doc) {
    doc = migrate(doc);
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
  function toRuntime(
    level,
    seed = level.seed,
    assemblyProfiles = assemblyMotion.defaults(),
  ) {
    const errors = [
      ...assemblyMotion.validateLibrary(assemblyProfiles),
      ...validateLevel(level, "Level", assemblyProfiles),
    ];
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
        assembly: clone(level.assembly),
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
      assemblyProfile: clone(
        assemblyProfiles.find((p) => p?.id === level.assembly.profileId),
      ),
      ringSettings: level.rings.map((r) => ({
        gateArc: (r.gateWidth * Math.PI) / 180,
        gateHealth: r.gateHealth,
      })),
      profiles: motion.assignProfiles(level, seed),
    };
  }
  function testPayload(level, assemblyProfiles = assemblyMotion.defaults()) {
    toRuntime(level, level.seed, assemblyProfiles);
    return JSON.stringify({
      format: "d-fuze-test",
      version: VERSION,
      motionLibrary: motion.LIBRARY_ID,
      level: clone(level),
      assemblyProfiles: clone(assemblyProfiles),
    });
  }
  function readTestData(text) {
    if (typeof text !== "string" || text.length > 1000000)
      throw new Error("Missing or oversized Test Mode transfer.");
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("Invalid Test Mode JSON.");
    }
    if (
      !value ||
      value.format !== "d-fuze-test" ||
      ![1, 2].includes(value.version) ||
      Object.keys(value).some(
        (k) =>
          ![
            "format",
            "version",
            "motionLibrary",
            "level",
            "assemblyProfiles",
          ].includes(k),
      )
    )
      throw new Error("Invalid Test Mode transfer.");
    const doc = requireValid({
      format: FORMAT,
      version: value.version,
      motionLibrary: value.motionLibrary,
      levels: [value.level],
      ...(value.version === 2
        ? { assemblyProfiles: value.assemblyProfiles }
        : {}),
    });
    toRuntime(doc.levels[0], doc.levels[0].seed, doc.assemblyProfiles);
    return { level: doc.levels[0], assemblyProfiles: doc.assemblyProfiles };
  }
  function readTest(text) {
    return readTestData(text).level;
  }
  function migrate(doc) {
    if (!doc || doc.version !== 1) return doc;
    if (
      doc.format !== FORMAT ||
      doc.motionLibrary !== motion.LIBRARY_ID ||
      !Array.isArray(doc.levels) ||
      doc.levels.length > 200 ||
      Object.keys(doc).some(
        (k) => !["format", "version", "motionLibrary", "levels"].includes(k),
      )
    )
      throw new Error("Invalid version 1 configuration.");
    const next = clone(doc);
    next.version = VERSION;
    next.assemblyProfiles = assemblyMotion.defaults();
    for (const l of next.levels) {
      const a = l?.assembly;
      if (
        !a ||
        typeof a.enabled !== "boolean" ||
        Object.keys(a).some((k) => !["enabled", "speed"].includes(k)) ||
        (a.speed !== undefined &&
          (!Number.isFinite(a.speed) || Math.abs(a.speed) > 180)) ||
        (a.enabled && a.speed === undefined)
      )
        throw new Error("Invalid version 1 assembly settings.");
      let id = "gentle-drift";
      if (a.speed !== undefined) {
        id = `migrated-constant-${a.speed < 0 ? "negative-" : ""}${String(Math.abs(a.speed)).replace(".", "-")}`;
        if (!next.assemblyProfiles.some((p) => p.id === id))
          next.assemblyProfiles.push({
            id,
            name: `Migrated constant ${a.speed}°/s`,
            duration: 25,
            keyframes: [
              [0, 0],
              [25, a.speed * 25],
            ],
          });
      }
      l.assembly = { enabled: a.enabled, profileId: id, playbackSpeed: 1 };
    }
    return next;
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
    readTestData,
    migrate,
    saveDraft,
    loadDraft,
  };
});
