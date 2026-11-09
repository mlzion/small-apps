(function (root, factory) {
  const api = factory(
    typeof module === "object" ? require("./motion.js") : root.DFuzeMotion,
  );
  if (typeof module === "object") module.exports = api;
  else root.DFuzeExperimentalMotion = api;
})(globalThis, (legacy) => {
  "use strict";
  const LIBRARY_ID = "builder-10-v1";
  const FAMILIES = {
    easy: {
      name: "builder-easy-10",
      label: "Easy",
      duration: 10,
      alignmentWindows: [
        [3.5, 5],
        [8.5, 10],
      ],
    },
    medium: {
      name: "builder-medium-10",
      label: "Medium",
      duration: 10,
      alignmentWindows: [
        [4, 5],
        [9, 10],
      ],
    },
    hard: {
      name: "builder-hard-10",
      label: "Hard",
      duration: 10,
      alignmentWindows: [
        [4.5, 5],
        [9.5, 10],
      ],
    },
  };
  function profile(id, name, difficulty, first, second, easing = "smooth") {
    const family = FAMILIES[difficulty],
      middle = family.alignmentWindows[0][0],
      final = family.alignmentWindows[1][0];
    return {
      id,
      name,
      difficulty,
      family,
      keyframes: [
        [0, 0, easing],
        ...first,
        [middle, 0, "linear"],
        [5, 0, easing],
        ...second,
        [final, 0, "linear"],
        [10, 0, "linear"],
      ],
    };
  }
  // These are authored tracks, not generated level-dependent or stretched legacy keys.
  const PROFILES = [
    profile(
      "easy-01",
      "Broad pendulum",
      "easy",
      [
        [1.2, 100, "smooth"],
        [2.5, -45, "smooth"],
      ],
      [
        [6.1, -90, "smooth"],
        [7.4, 40, "smooth"],
      ],
    ),
    profile(
      "easy-02",
      "Clockwise excursion",
      "easy",
      [
        [1.5, 170, "smooth"],
        [2.2, 170, "smooth"],
      ],
      [
        [6.3, 220, "smooth"],
        [7.2, 220, "smooth"],
      ],
    ),
    profile(
      "easy-03",
      "Counterclockwise staircase",
      "easy",
      [
        [0.8, -70, "linear"],
        [1.4, -70, "smooth"],
        [2.5, -190, "smooth"],
      ],
      [
        [5.9, -100, "linear"],
        [6.5, -100, "smooth"],
        [7.5, -240, "smooth"],
      ],
    ),
    profile(
      "easy-04",
      "Uneven figure eight",
      "easy",
      [
        [0.9, 60, "smooth"],
        [1.8, -120, "smooth"],
        [2.8, 30, "smooth"],
      ],
      [
        [6.4, -140, "smooth"],
        [7.7, 65, "smooth"],
      ],
    ),
    profile(
      "easy-05",
      "Patient reversal",
      "easy",
      [
        [0.8, -110, "linear"],
        [2, -110, "smooth"],
        [2.8, 80, "smooth"],
      ],
      [
        [5.8, 130, "linear"],
        [7, 130, "smooth"],
        [7.8, -60, "smooth"],
      ],
    ),
    profile(
      "medium-01",
      "Double switchback",
      "medium",
      [
        [1, 180, "linear"],
        [2, -150, "smooth"],
        [3.1, 90, "smooth"],
      ],
      [
        [6, -200, "linear"],
        [7.1, 150, "smooth"],
        [8.2, -80, "smooth"],
      ],
    ),
    profile(
      "medium-02",
      "Long clockwise return",
      "medium",
      [
        [1.8, 330, "linear"],
        [2.5, 330, "smooth"],
      ],
      [
        [6.2, 120, "linear"],
        [7.6, 310, "smooth"],
        [8.2, 310, "smooth"],
      ],
    ),
    profile(
      "medium-03",
      "Broken counterturn",
      "medium",
      [
        [1.1, -240, "linear"],
        [1.8, -240, "linear"],
        [2.8, 120, "smooth"],
      ],
      [
        [6, -160, "smooth"],
        [6.8, -160, "linear"],
        [8, 210, "smooth"],
      ],
    ),
    profile(
      "medium-04",
      "Three-part weave",
      "medium",
      [
        [0.7, 80, "smooth"],
        [1.6, -130, "linear"],
        [2.5, 220, "smooth"],
        [3.2, -45, "smooth"],
      ],
      [
        [5.8, -100, "smooth"],
        [6.9, 180, "linear"],
        [8, -90, "smooth"],
      ],
    ),
    profile(
      "medium-05",
      "Offset brakes",
      "medium",
      [
        [0.9, -90, "linear"],
        [1.6, -90, "smooth"],
        [2.8, -280, "linear"],
        [3.3, 60, "smooth"],
      ],
      [
        [6.5, 270, "smooth"],
        [7.4, 270, "linear"],
        [8.2, -110, "smooth"],
      ],
    ),
    profile(
      "hard-01",
      "Snap pendulum",
      "hard",
      [
        [0.8, 250, "linear"],
        [1.6, -220, "linear"],
        [2.5, 300, "linear"],
        [3.5, -120, "linear"],
      ],
      [
        [5.9, -270, "linear"],
        [6.8, 230, "linear"],
        [8, -310, "linear"],
        [8.9, 90, "linear"],
      ],
      "linear",
    ),
    profile(
      "hard-02",
      "Orbit and recoil",
      "hard",
      [
        [1.8, 540, "linear"],
        [2.5, 540, "linear"],
        [3.6, -180, "smooth"],
      ],
      [
        [6.2, -240, "linear"],
        [7.5, -600, "linear"],
        [8.7, 130, "smooth"],
      ],
      "linear",
    ),
    profile(
      "hard-03",
      "Four-way feint",
      "hard",
      [
        [0.7, -160, "linear"],
        [1.5, 80, "linear"],
        [2.2, -290, "linear"],
        [3.1, 200, "linear"],
        [3.8, -50, "smooth"],
      ],
      [
        [5.8, 160, "linear"],
        [6.7, -90, "linear"],
        [7.5, 300, "linear"],
        [8.4, -190, "smooth"],
      ],
      "linear",
    ),
    profile(
      "hard-04",
      "Charged pause",
      "hard",
      [
        [1, -300, "linear"],
        [2.4, -300, "linear"],
        [3.1, 340, "linear"],
        [3.6, 340, "smooth"],
      ],
      [
        [6, 320, "linear"],
        [7.2, 320, "linear"],
        [8, -250, "linear"],
        [8.7, -250, "smooth"],
      ],
      "linear",
    ),
    profile(
      "hard-05",
      "Rolling cascade",
      "hard",
      [
        [0.9, 210, "smooth"],
        [1.8, 450, "linear"],
        [2.7, 150, "smooth"],
        [3.7, -330, "smooth"],
      ],
      [
        [5.8, -200, "smooth"],
        [6.9, -510, "linear"],
        [7.8, -130, "smooth"],
        [8.8, 290, "smooth"],
      ],
    ),
  ];
  const BY_ID = new Map(PROFILES.map((p) => [p.id, p]));
  const COMMON_WINDOWS = [
    [4.5, 5],
    [9.5, 10],
  ];
  function validateExperimentalProfile(p) {
    legacy.validateProfile(p);
    const expected = FAMILIES[p.difficulty];
    if (
      !expected ||
      p.family !== expected ||
      p.family.duration !== 10 ||
      !/^((easy|medium|hard)-0[1-5])$/.test(p.id)
    )
      throw new Error("Invalid experimental profile identity");
    for (const [a, b] of COMMON_WINDOWS)
      for (let t = a; t <= b; t += 0.05)
        if (legacy.sampleProfile(p, t) !== 0)
          throw new Error("Mixed-family alignment drift");
    return true;
  }
  function freeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  PROFILES.forEach(validateExperimentalProfile);
  freeze(FAMILIES);
  freeze(PROFILES);
  freeze(COMMON_WINDOWS);
  function eligible(family) {
    return PROFILES.filter((p) => p.difficulty === family);
  }
  function assignProfiles(level, seed = level.seed) {
    const random = legacy.seededRandom(seed);
    return level.rings.map((r) =>
      BY_ID.get(r.profiles[Math.floor(random() * r.profiles.length)]),
    );
  }
  return {
    LIBRARY_ID,
    FAMILIES,
    COMMON_WINDOWS,
    PROFILES,
    BY_ID,
    eligible,
    assignProfiles,
    validateExperimentalProfile,
    sampleProfile: legacy.sampleProfile,
  };
});
