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
  const VERSION = 3,
    FORMAT = "d-fuze-levels",
    TEST_KEY = "d-fuze-test-v1";
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
    };
  }
  function defaults() {
    return {
      format: FORMAT,
      version: VERSION,
      motionLibrary: motion.LIBRARY_ID,
      assemblyProfiles: assemblyMotion.defaults(),
      ringProfiles: motion.defaults(),
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
            gateWidth: Math.round((110 - stage * 15 - r * 4) / 10) * 10,
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
    ringProfiles = motion.defaults(),
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
      Object.keys(level.assembly).some(
        (k) => !["profileId", "playbackSpeed"].includes(k),
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
          if (!["number", "gateWidth", "gateHealth", "family"].includes(k))
            fail(`Ring ${i + 1}: unknown field “${k}”.`);
        if (ring.number !== i + 1)
          fail("rings must be numbered consecutively from the inside outward.");
        if (!number(ring.gateWidth, 10, 120) || ring.gateWidth % 10 !== 0)
          fail(
            `Ring ${i + 1}: gate width must be 10–120 degrees in 10-degree steps.`,
          );
        if (!number(ring.gateHealth, 1, 50, true))
          fail(`Ring ${i + 1}: gate health must be 1–50.`);
        if (!Object.hasOwn(motion.FAMILIES, ring.family))
          fail(`Ring ${i + 1}: unknown motion family.`);
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
          "ringProfiles",
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
    errors.push(...motion.validateLibrary(doc.ringProfiles));
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
    const result = clone(doc);
    if (doc.migrationNotes)
      Object.defineProperty(result, "migrationNotes", {
        value: doc.migrationNotes,
      });
    return result;
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
  function toRuntime(
    level,
    seed = level.seed,
    assemblyProfiles = assemblyMotion.defaults(),
    ringProfiles = motion.defaults(),
  ) {
    const errors = [
      ...assemblyMotion.validateLibrary(assemblyProfiles),
      ...motion.validateLibrary(ringProfiles),
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
      profiles: motion.assignProfiles(level, seed, ringProfiles),
    };
  }
  function testPayload(
    level,
    assemblyProfiles = assemblyMotion.defaults(),
    ringProfiles = motion.defaults(),
  ) {
    toRuntime(level, level.seed, assemblyProfiles, ringProfiles);
    return JSON.stringify({
      format: "d-fuze-test",
      version: VERSION,
      motionLibrary: motion.LIBRARY_ID,
      level: clone(level),
      assemblyProfiles: clone(assemblyProfiles),
      ringProfiles: clone(ringProfiles),
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
      ![1, 2, 3].includes(value.version) ||
      Object.keys(value).some(
        (k) =>
          ![
            "format",
            "version",
            "motionLibrary",
            "level",
            "assemblyProfiles",
            "ringProfiles",
          ].includes(k),
      )
    )
      throw new Error("Invalid Test Mode transfer.");
    const doc = requireValid({
      format: FORMAT,
      version: value.version,
      motionLibrary: value.motionLibrary,
      levels: [value.level],
      ...(value.version === 3 ? { ringProfiles: value.ringProfiles } : {}),
      ...(value.version >= 2
        ? { assemblyProfiles: value.assemblyProfiles }
        : {}),
    });

    toRuntime(
      doc.levels[0],
      doc.levels[0].seed,
      doc.assemblyProfiles,
      doc.ringProfiles,
    );
    return {
      level: doc.levels[0],
      assemblyProfiles: doc.assemblyProfiles,
      ringProfiles: doc.ringProfiles,
      migrationNotes: doc.migrationNotes ?? [],
    };
  }
  function readTest(text) {
    return readTestData(text).level;
  }
  function migrateV1(doc) {
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
    next.version = 2;
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
  function migrate(doc) {
    if (!doc || ![1, 2].includes(doc.version)) return doc;
    if (
      doc.version === 2 &&
      (doc.format !== FORMAT ||
        doc.motionLibrary !== motion.LIBRARY_ID ||
        !Array.isArray(doc.levels) ||
        doc.levels.length > 200 ||
        Object.keys(doc).some(
          (k) =>
            ![
              "format",
              "version",
              "motionLibrary",
              "levels",
              "assemblyProfiles",
            ].includes(k),
        ))
    )
      throw Error("Invalid version 2 configuration.");
    const notes = [];
    let next = doc.version === 1 ? migrateV1(doc) : clone(doc);
    if (next.version !== 2) throw Error("Unsupported configuration version.");
    const libraryErrors = assemblyMotion.validateLibrary(next.assemblyProfiles);
    if (libraryErrors.length) throw Error(libraryErrors.join("\n"));
    next.version = VERSION;
    next.ringProfiles = motion.defaults();
    for (const l of next.levels) {
      if (
        !l.assembly ||
        Object.keys(l.assembly).some(
          (k) => !["enabled", "profileId", "playbackSpeed"].includes(k),
        ) ||
        (l.assembly.enabled !== undefined &&
          typeof l.assembly.enabled !== "boolean")
      )
        throw Error("Invalid legacy assembly configuration.");
      delete l.assembly.enabled;
      if (!l.assembly.profileId) {
        l.assembly.profileId = "gentle-drift";
        if (!next.assemblyProfiles.some((p) => p.id === "gentle-drift"))
          next.assemblyProfiles.push(assemblyMotion.defaults()[0]);
        notes.push(`Level ${l.number}: selected default Gentle Drift.`);
      }
      if (l.assembly.playbackSpeed === undefined) l.assembly.playbackSpeed = 1;
      if (!Array.isArray(l.rings)) throw Error("Missing legacy ring settings.");
      for (const r of l.rings) {
        if (
          !r ||
          !Array.isArray(r.profiles) ||
          !r.profiles.length ||
          r.profiles.length > 5 ||
          new Set(r.profiles).size !== r.profiles.length ||
          r.profiles.some((id) => motion.BY_ID.get(id)?.difficulty !== r.family)
        )
          throw Error("Invalid legacy ring profile selection.");
        if (
          !Number.isFinite(r.gateWidth) ||
          r.gateWidth < 10 ||
          r.gateWidth > 180
        )
          throw Error("Invalid legacy gate width.");
        const width = Math.min(
          120,
          Math.max(10, Math.round(r.gateWidth / 10) * 10),
        );
        if (width !== r.gateWidth)
          notes.push(
            `Level ${l.number}, Ring ${r.number}: gate width ${r.gateWidth}° adjusted to ${width}°.`,
          );
        r.gateWidth = width;
        delete r.profiles;
      }
    }
    notes.push(
      "Migrated to schema v3: all family profiles are eligible; assembly motion is active on every level.",
    );
    Object.defineProperty(next, "migrationNotes", { value: notes });
    return next;
  }
  return {
    VERSION,
    FORMAT,
    TEST_KEY,
    FIELDS,
    clone,
    defaultRing,
    defaults,
    validateLevel,
    validateDocument,
    requireValid,
    importJSON,
    exportJSON,
    toRuntime,
    testPayload,
    readTest,
    readTestData,
    migrate,
  };
});
