/* ChordMidi's serializable music model. One step is an eighth note. */
(function (root, factory) {
  const api = factory(
    typeof module === "object" && module.exports
      ? require("./presets.js")
      : root.ChordInstruments,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ChordMidi = api;
})(globalThis, (instruments) => {
  "use strict";
  const keys = [
    "C",
    "C♯",
    "D",
    "E♭",
    "E",
    "F",
    "F♯",
    "G",
    "A♭",
    "A",
    "B♭",
    "B",
  ];
  const scales = {
    Major: [0, 2, 4, 5, 7, 9, 11],
    Minor: [0, 2, 3, 5, 7, 8, 10],
  };
  const qualities = [
    {
      id: "diatonic",
      name: "Triad ◇",
      full: "diatonic triad",
      steps: [0, 2, 4],
    },
    { id: "third", name: "Dyad 1–3", full: "third dyad", steps: [0, 2] },
    {
      id: "fifth",
      name: "Power 1–5",
      full: "fifth dyad",
      intervals: [0, 7],
      letters: [0, 4],
    },
    {
      id: "major",
      name: "Major",
      full: "major",
      intervals: [0, 4, 7],
      letters: [0, 2, 4],
    },
    {
      id: "minor",
      name: "Minor",
      full: "minor",
      intervals: [0, 3, 7],
      letters: [0, 2, 4],
    },
    {
      id: "dim",
      name: "Diminished",
      full: "diminished",
      intervals: [0, 3, 6],
      letters: [0, 2, 4],
    },
    {
      id: "aug",
      name: "Augmented",
      full: "augmented",
      intervals: [0, 4, 8],
      letters: [0, 2, 4],
    },
    {
      id: "sus2",
      name: "sus2",
      full: "suspended second",
      intervals: [0, 2, 7],
      letters: [0, 1, 4],
    },
    {
      id: "sus4",
      name: "sus4",
      full: "suspended fourth",
      intervals: [0, 5, 7],
      letters: [0, 3, 4],
    },
    {
      id: "sixth",
      name: "Major 6",
      full: "major sixth",
      intervals: [0, 4, 7, 9],
      letters: [0, 2, 4, 5],
    },
    {
      id: "min6",
      name: "Minor 6",
      full: "minor sixth",
      intervals: [0, 3, 7, 9],
      letters: [0, 2, 4, 5],
    },
    {
      id: "seventh",
      name: "7th ◇",
      full: "diatonic seventh",
      steps: [0, 2, 4, 6],
    },
    {
      id: "maj7",
      name: "Major 7",
      full: "major seventh",
      intervals: [0, 4, 7, 11],
      letters: [0, 2, 4, 6],
    },
    {
      id: "min7",
      name: "Minor 7",
      full: "minor seventh",
      intervals: [0, 3, 7, 10],
      letters: [0, 2, 4, 6],
    },
    {
      id: "dom7",
      name: "Dominant 7",
      full: "dominant seventh",
      intervals: [0, 4, 7, 10],
      letters: [0, 2, 4, 6],
    },
    {
      id: "halfDim7",
      name: "Half-dim 7",
      full: "half-diminished seventh",
      intervals: [0, 3, 6, 10],
      letters: [0, 2, 4, 6],
    },
    {
      id: "dim7",
      name: "Dim 7",
      full: "diminished seventh",
      intervals: [0, 3, 6, 9],
      letters: [0, 2, 4, 6],
    },
  ];
  const lanes = ["RH Chords", "LH Chords", "Passing Notes"];
  const inversions = ["Root", "1st", "2nd", "3rd"];
  const meters = ["2/4", "3/4", "4/4", "6/8"];
  const stepsPerBar = (meter) => {
    const [n, d] = meter.split("/").map(Number);
    return (n * 8) / d;
  };
  const totalSteps = (p) => p.bars * stepsPerBar(p.meter);
  const mod = (v, n) => ((v % n) + n) % n;
  function spell(pc, letter) {
    const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter];
    let delta = mod(pc - natural + 6, 12) - 6;
    return letter + (delta > 0 ? "♯".repeat(delta) : "♭".repeat(-delta));
  }
  function scale(key, mode) {
    const letters = "CDEFGAB",
      start = letters.indexOf(keys[key][0]);
    return scales[mode].map((v, i) => ({
      pc: mod(key + v, 12),
      name: spell(mod(key + v, 12), letters[(start + i) % 7]),
    }));
  }
  function degreeName(key, mode, i) {
    const s = scales[mode],
      at = (j) => s[j % 7] + 12 * Math.floor(j / 7);
    const third = at(i + 2) - at(i),
      fifth = at(i + 4) - at(i);
    const roman = ["I", "II", "III", "IV", "V", "VI", "VII"][i];
    return (
      (third === 3 ? roman.toLowerCase() : roman) + (fifth === 6 ? "°" : "")
    );
  }
  function chord(key, mode, b) {
    const q = qualities.find((q) => q.id === b.quality),
      s = scales[mode],
      sc = scale(key, mode);
    const at = (i) => s[i % 7] + 12 * Math.floor(i / 7);
    const root = 12 * (b.octave + 1) + key + s[b.degree];
    let intervals = q.steps
      ? q.steps.map((i) => at(b.degree + i) - at(b.degree))
      : q.intervals;
    const letters = "CDEFGAB",
      start = letters.indexOf(sc[b.degree].name[0]);
    const names = intervals.map((v, i) =>
      spell(
        mod(root + v, 12),
        letters[(start + (q.steps || q.letters)[i]) % 7],
      ),
    );
    const pitches = intervals.map((v) => root + v);
    for (let i = 0; i < b.inversion; i++) {
      pitches.push(pitches.shift() + 12);
      names.push(names.shift());
    }
    const triad =
      intervals[1] === 3
        ? intervals[2] === 6
          ? "diminished"
          : "minor"
        : "major";
    const full =
      q.id === "diatonic"
        ? triad
        : q.id === "seventh"
          ? {
              "0,4,7,11": "major seventh",
              "0,3,7,10": "minor seventh",
              "0,4,7,10": "dominant seventh",
              "0,3,6,10": "half-diminished seventh",
            }[intervals.join(",")] || q.full
          : q.full;
    return {
      pitches,
      names,
      name: `${sc[b.degree].name} ${full}`,
      label: `${sc[b.degree].name} ${q.id === "diatonic" ? { major: "Maj", minor: "min", diminished: "dim" }[triad] : q.name.replace(" ◇", "")}`,
    };
  }
  const builder = (octave = 4) => ({
    degree: 0,
    quality: "diatonic",
    inversion: 0,
    octave,
  });
  const fresh = () => ({
    format: "chordmidi",
    version: 1,
    name: "ChordMidi Project",
    key: 0,
    mode: "Major",
    bpm: 120,
    bars: 4,
    meter: "4/4",
    program: 0,
    instrumentName: instruments.presets[0].name,
    loop: true,
    metronome: false,
    builders: [builder(4), builder(3)],
    passing: { source: "scale", index: 0, octave: 4 },
    events: [],
  });
  const int = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
  function validBuilder(b) {
    const q = qualities.find((q) => q.id === b?.quality);
    return (
      q &&
      int(b.degree, 0, 6) &&
      int(b.octave, 1, 6) &&
      int(b.inversion, 0, (q.steps || q.intervals).length - 1)
    );
  }
  function validate(p) {
    const fail = () => {
      throw Error(
        "Invalid ChordMidi v1 project. Check settings, instrument name/program, pitches and event bounds.",
      );
    };
    if (
      !p ||
      p.format !== "chordmidi" ||
      p.version !== 1 ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 160 ||
      !int(p.key, 0, 11) ||
      !["Major", "Minor"].includes(p.mode) ||
      !int(p.bpm, 30, 300) ||
      !int(p.bars, 1, 8) ||
      !meters.includes(p.meter) ||
      !int(p.program, 0, 127) ||
      p.instrumentName !== instruments.presets[p.program].name ||
      typeof p.loop !== "boolean" ||
      typeof p.metronome !== "boolean" ||
      !Array.isArray(p.builders) ||
      p.builders.length !== 2 ||
      !p.builders.every(validBuilder)
    )
      fail();
    const pn = p.passing;
    if (
      !pn ||
      !["scale", "chord"].includes(pn.source) ||
      !int(
        pn.index,
        0,
        pn.source === "scale"
          ? 6
          : chord(p.key, p.mode, p.builders[0]).pitches.length - 1,
      ) ||
      !int(pn.octave, 1, 6) ||
      !Array.isArray(p.events) ||
      p.events.length > 4096
    )
      fail();
    const ids = new Set();
    for (const e of p.events) {
      if (
        !e ||
        typeof e.id !== "string" ||
        !e.id ||
        e.id.length > 80 ||
        ids.has(e.id) ||
        !int(e.lane, 0, 2) ||
        !int(e.start, 0, totalSteps(p) - 1) ||
        !int(e.duration, 1, totalSteps(p) - e.start) ||
        !Array.isArray(e.pitches) ||
        e.pitches.length < 1 ||
        e.pitches.length > (e.lane === 2 ? 1 : 4) ||
        !e.pitches.every((n) => int(n, 0, 127)) ||
        new Set(e.pitches).size !== e.pitches.length ||
        typeof e.label !== "string" ||
        e.label.length > 100 ||
        !int(e.key, 0, 11) ||
        !["Major", "Minor"].includes(e.mode) ||
        !(e.lane === 2
          ? e.passing &&
            ["scale", "chord"].includes(e.passing.source) &&
            int(e.passing.index, 0, 6) &&
            int(e.passing.octave, 1, 6) &&
            (e.sourceBuilder === undefined || validBuilder(e.sourceBuilder))
          : validBuilder(e.builder))
      )
        fail();
      ids.add(e.id);
    }
    return JSON.parse(JSON.stringify(p));
  }
  function makeEvent(p, lane, start, duration = 1) {
    const b = p.builders[lane === 1 ? 1 : 0];
    let c = chord(p.key, p.mode, b),
      passing = { ...p.passing };
    if (lane === 2) {
      const options = passingOptions(p),
        n = options[passing.index] || options[0];
      c = { pitches: [n.pitch], label: n.label };
    }
    return {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      lane,
      start,
      duration,
      pitches: c.pitches.slice(),
      label: c.label,
      key: p.key,
      mode: p.mode,
      ...(lane === 2
        ? { passing, sourceBuilder: { ...p.builders[0] } }
        : { builder: { ...b } }),
    };
  }
  function passingOptions(p) {
    const o = p.passing.octave;
    const label = (pitch, name) => {
      const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[name[0]];
      const accidental = Array.from(name.slice(1)).reduce(
        (sum, c) => sum + (c === "♯" ? 1 : -1),
        0,
      );
      return name + (Math.round((pitch - natural - accidental) / 12) - 1);
    };
    if (p.passing.source === "scale")
      return scale(p.key, p.mode).map((n, i) => {
        const pitch = 12 * (o + 1) + p.key + scales[p.mode][i];
        return { pitch, label: label(pitch, n.name) };
      });
    const c = chord(p.key, p.mode, { ...p.builders[0], octave: o });
    return c.pitches.map((pitch, i) => ({
      pitch,
      label: label(pitch, c.names[i]),
    }));
  }
  const vlq = (v) => {
    const a = [v & 127];
    while ((v = Math.floor(v / 128))) a.unshift((v & 127) | 128);
    return a;
  };
  const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));
  const u32 = (n) => [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ];
  const chunk = (s, b) => [...ascii(s), ...u32(b.length), ...b];
  // Union same-pitch overlaps within each lane so DAWs do not cut a held note short.
  function noteSpans(events) {
    const pitches = new Map();
    for (const e of events)
      for (const pitch of e.pitches) {
        if (!pitches.has(pitch)) pitches.set(pitch, []);
        pitches
          .get(pitch)
          .push({ pitch, start: e.start, end: e.start + e.duration });
      }
    const out = [];
    for (const list of pitches.values()) {
      list.sort((a, b) => a.start - b.start);
      let last;
      for (const n of list)
        if (last && n.start < last.end) last.end = Math.max(last.end, n.end);
        else {
          last = { ...n };
          out.push(last);
        }
    }
    return out;
  }
  function midi(p) {
    validate(p);
    const end = totalSteps(p) * 240,
      tempo = Math.round(60000000 / p.bpm),
      [num, den] = p.meter.split("/").map(Number);
    const tracks = lanes.map((name, lane) => {
      const text = ascii(name),
        data = [0, 255, 3, text.length, ...text];
      if (lane === 0) {
        const preview = ascii("Preview instrument: " + p.instrumentName);
        data.push(0, 255, 1, ...vlq(preview.length), ...preview);
      }
      if (lane === 0)
        data.push(
          0,
          255,
          81,
          3,
          (tempo >> 16) & 255,
          (tempo >> 8) & 255,
          tempo & 255,
          0,
          255,
          88,
          4,
          num,
          Math.log2(den),
          p.meter === "6/8" ? 36 : 24,
          8,
        );
      const ev = noteSpans(p.events.filter((e) => e.lane === lane))
        .flatMap((n) => [
          { t: n.start * 240, b: [144 + lane, n.pitch, 96], order: 1 },
          { t: n.end * 240, b: [128 + lane, n.pitch, 0], order: 0 },
        ])
        .sort((a, b) => a.t - b.t || a.order - b.order);
      let last = 0;
      for (const e of ev) {
        data.push(...vlq(e.t - last), ...e.b);
        last = e.t;
      }
      data.push(...vlq(end - last), 255, 47, 0);
      return chunk("MTrk", data);
    });
    return new Uint8Array([
      ...chunk("MThd", [0, 1, 0, 3, 1, 224]),
      ...tracks.flat(),
    ]);
  }
  return {
    keys,
    scales,
    qualities,
    lanes,
    inversions,
    meters,
    stepsPerBar,
    totalSteps,
    scale,
    degreeName,
    chord,
    fresh,
    validate,
    makeEvent,
    passingOptions,
    midi,
    noteSpans,
  };
});
