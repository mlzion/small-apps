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
      id: "octave",
      name: "Octave 1–8",
      full: "octave dyad",
      intervals: [0, 12],
      letters: [0, 7],
      inversionCount: 1,
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
  const inversionCount = (quality) => {
    const q = qualities.find((q) => q.id === quality);
    return q.inversionCount ?? (q.steps || q.intervals).length;
  };
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
  // rootOffset is relative to the original key, never a replacement for the
  // legacy seven-degree field. Missing rootOffset keeps old JSON semantics.
  function chromaticRoots(key, mode) {
    const sc = scale(key, mode),
      letters = "CDEFGAB",
      start = letters.indexOf(keys[key][0]);
    // Chromatic alterations: bII, bIII, #IV, bVI and bVII; actual
    // scale spellings take precedence (including minor and B# / Cb).
    const chromaticLetters = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];
    return Array.from({ length: 12 }, (_, offset) => {
      const pc = mod(key + offset, 12),
        degree = scales[mode].indexOf(offset);
      const name =
        degree >= 0
          ? sc[degree].name
          : spell(pc, letters[(start + chromaticLetters[offset]) % 7]);
      return {
        offset,
        pc,
        degree,
        name,
        label: degree >= 0 ? `${degreeName(key, mode, degree)} ${name}` : name,
      };
    });
  }
  const rootInfo = (key, mode, b) =>
    chromaticRoots(key, mode)[b.rootOffset ?? scales[mode][b.degree]];
  const qualityAvailable = (key, mode, b, quality = b.quality) =>
    !qualities.find((q) => q.id === quality).steps ||
    rootInfo(key, mode, b).degree >= 0;
  function noteLabel(pitch, name) {
    const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[name[0]];
    const accidental = Array.from(name.slice(1)).reduce(
      (sum, c) => sum + (c === "♯" ? 1 : -1),
      0,
    );
    return name + (Math.round((pitch - natural - accidental) / 12) - 1);
  }
  function chord(key, mode, b) {
    const q = qualities.find((q) => q.id === b.quality),
      s = scales[mode],
      info = rootInfo(key, mode, b),
      degree = info.degree;
    if (q.inversionCount === 1 && b.inversion !== 0)
      throw Error("Octave 1–8 supports root position only.");
    if (!qualityAvailable(key, mode, b))
      return {
        pitches: [],
        names: [],
        noteLabels: [],
        available: false,
        name: `${info.name} · Choose an explicit quality`,
        label: `${info.name} (choose quality)`,
      };
    const at = (i) => s[i % 7] + 12 * Math.floor(i / 7);
    const root = 12 * (b.octave + 1) + key + info.offset;
    let intervals = q.steps
      ? q.steps.map((i) => at(degree + i) - at(degree))
      : q.intervals;
    const letters = "CDEFGAB",
      start = letters.indexOf(info.name[0]);
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
      available: true,
      pitches,
      names,
      noteLabels: pitches.map((pitch, i) => noteLabel(pitch, names[i])),
      name: `${info.name} ${full}`,
      label: `${info.name} ${q.id === "diatonic" ? { major: "Maj", minor: "min", diminished: "dim" }[triad] : q.name.replace(" ◇", "")}`,
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
  const validContext = (c) =>
    c === undefined ||
    (!!c && int(c.key, 0, 11) && ["Major", "Minor"].includes(c.mode));
  const validVoicing = (v, max) =>
    v === undefined ||
    (!!v &&
      Array.isArray(v.pitches) &&
      v.pitches.length >= 1 &&
      v.pitches.length <= max &&
      v.pitches.every((n) => int(n, 0, 127)) &&
      new Set(v.pitches).size === v.pitches.length &&
      typeof v.label === "string" &&
      v.label.length <= 100);
  function basicSettings(settings) {
    const { context, voicing, ...basic } = settings;
    return basic;
  }
  const contextFor = (p, settings) =>
    settings.context || { key: p.key, mode: p.mode };
  const passingContext = (p) =>
    p.passing.source === "chord"
      ? contextFor(p, p.builders[0])
      : contextFor(p, p.passing);
  function builderChord(p, b) {
    const context = contextFor(p, b),
      generated = chord(context.key, context.mode, b);
    if (!b.voicing) return { ...generated, context, templateMatches: true };
    const pitches = b.voicing.pitches.slice();
    const templateMatches =
      pitches.length === generated.pitches.length &&
      pitches.every((n, i) => n === generated.pitches[i]);
    const notes = scale(context.key, context.mode);
    const names = pitches.map((pitch) => {
      const original = generated.pitches.findIndex(
        (n) => n % 12 === pitch % 12,
      );
      return original >= 0
        ? generated.names[original]
        : notes.find((n) => n.pc === pitch % 12)?.name || keys[pitch % 12];
    });
    return {
      ...generated,
      available: true,
      context,
      pitches,
      names,
      noteLabels: pitches.map((pitch, i) => noteLabel(pitch, names[i])),
      label: b.voicing.label,
      name: templateMatches
        ? generated.name
        : `${b.voicing.label} (stored voicing)`,
      templateMatches,
    };
  }
  function restoreBuilder(p, e) {
    const b = basicSettings(e.builder);
    if (e.key !== p.key || e.mode !== p.mode)
      b.context = { key: e.key, mode: e.mode };
    const generated = chord(e.key, e.mode, b).pitches;
    if (
      generated.length !== e.pitches.length ||
      generated.some((n, i) => n !== e.pitches[i])
    )
      b.voicing = { pitches: e.pitches.slice(), label: e.label };
    return b;
  }
  function restorePassing(p, e) {
    const passing = basicSettings(e.passing);
    if (passing.source === "scale" && (e.key !== p.key || e.mode !== p.mode))
      passing.context = { key: e.key, mode: e.mode };
    const candidate = passingOptions({ ...p, passing })[passing.index];
    if (!candidate || candidate.pitch !== e.pitches[0])
      passing.voicing = { pitches: e.pitches.slice(), label: e.label };
    return passing;
  }
  function validBuilder(b) {
    const q = qualities.find((q) => q.id === b?.quality);
    return (
      q &&
      int(b.degree, 0, 6) &&
      (b.rootOffset === undefined || int(b.rootOffset, 0, 11)) &&
      // Transposition may move template registers beyond the normal 1–6 UI.
      // Allow a full MIDI span in either direction; actual snapshots stay 0–127.
      int(b.octave, -10, 17) &&
      int(b.inversion, 0, inversionCount(q.id) - 1) &&
      validContext(b.context) &&
      validVoicing(b.voicing, 4)
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
          : Math.max(0, builderChord(p, p.builders[0]).pitches.length - 1),
      ) ||
      !int(pn.octave, -10, 17) ||
      !validContext(pn.context) ||
      !validVoicing(pn.voicing, 1) ||
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
            int(e.passing.octave, -10, 17) &&
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
    let c = builderChord(p, b),
      context = c.context;
    if (lane === 2) {
      const n = passingOptions(p)[p.passing.index] || passingOptions(p)[0];
      if (!n && !p.passing.voicing)
        throw Error(
          "Choose an explicit RH chord quality for chord-tone passing notes.",
        );
      c = p.passing.voicing || { pitches: [n.pitch], label: n.label };
      context = passingContext(p);
    }
    if (!c.pitches.length)
      throw Error("Choose an explicit chord quality for a chromatic root.");
    return {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      lane,
      start,
      duration,
      pitches: c.pitches.slice(),
      label: c.label,
      key: context.key,
      mode: context.mode,
      ...(lane === 2
        ? {
            passing: basicSettings(p.passing),
            sourceBuilder: basicSettings(p.builders[0]),
          }
        : { builder: basicSettings(b) }),
    };
  }
  function passingOptions(p) {
    const o = p.passing.octave,
      context = passingContext(p);
    if (p.passing.source === "scale")
      return scale(context.key, context.mode).map((n, i) => {
        const pitch = 12 * (o + 1) + context.key + scales[context.mode][i];
        return { pitch, label: noteLabel(pitch, n.name) };
      });
    const b = p.builders[0],
      c = builderChord(p, b),
      shift = 12 * (o - b.octave);
    return c.pitches.map((original, i) => {
      let pitch = original + shift;
      while (pitch > 127) pitch -= 12;
      while (pitch < 0) pitch += 12;
      return { pitch, label: noteLabel(pitch, c.names[i]) };
    });
  }
  function transposeShift(from, to, direction = "shortest") {
    if (
      !int(from, 0, 11) ||
      !int(to, 0, 11) ||
      !["shortest", "up", "down"].includes(direction)
    )
      throw Error("Choose a destination key and direction.");
    const up = mod(to - from, 12);
    return direction === "up"
      ? up
      : direction === "down"
        ? up === 0
          ? 0
          : up - 12
        : up > 6
          ? up - 12
          : up;
  }
  function transpose(p, destination, direction = "shortest") {
    const original = validate(p);
    if (!original.events.length)
      throw Error("Place a chord or passing note before transposing.");
    const shift = transposeShift(original.key, destination, direction);
    if (shift === 0) return original;
    const checked = (pitches, where) =>
      pitches.map((pitch) => {
        const moved = pitch + shift;
        if (!int(moved, 0, 127))
          throw Error(
            `${where} would contain MIDI ${moved}, outside 0–127. Choose another key/direction or adjust its register.`,
          );
        return moved;
      });
    original.events.forEach((e) => checked(e.pitches, lanes[e.lane]));
    original.builders.forEach((b, i) =>
      checked(builderChord(original, b).pitches, `${lanes[i]} builder preview`),
    );
    const passingNote = passingOptions(original)[original.passing.index];
    const oldPassing =
      original.passing.voicing ||
      (passingNote ? { pitches: [passingNote.pitch] } : null);
    const movedPassing = oldPassing
      ? checked(oldPassing.pitches, "Passing-note preview")
      : null;
    const next = JSON.parse(JSON.stringify(original));
    next.key = destination;
    const shiftedContext = (c) => ({
      key: mod(c.key + shift, 12),
      mode: c.mode,
    });
    const shiftSettings = (settings, context, where) => {
      const moved = JSON.parse(JSON.stringify(settings)),
        to = shiftedContext(context);
      moved.octave += (context.key + shift - to.key) / 12;
      if (moved.context) moved.context = to;
      if (moved.voicing)
        moved.voicing.pitches = checked(moved.voicing.pitches, where);
      return moved;
    };
    // Template registers can cross 1–6, or sit outside playable registers for
    // custom voicings. Actual pitches are always checked; never wrap or clamp.
    const labelChord = (pitches, context, b) => {
      const settings = { ...b, context, voicing: { pitches, label: "" } };
      const view = builderChord(next, settings);
      return view.templateMatches
        ? chord(context.key, context.mode, b).label
        : `Stored ${view.noteLabels.join("–")}`;
    };
    const labelNote = (pitch, context, b) => {
      if (b)
        return builderChord(next, {
          ...b,
          context,
          voicing: { pitches: [pitch], label: "" },
        }).noteLabels[0];
      const name =
        scale(context.key, context.mode).find((n) => n.pc === mod(pitch, 12))
          ?.name || keys[mod(pitch, 12)];
      return noteLabel(pitch, name);
    };
    next.builders = original.builders.map((b, i) => {
      const context = contextFor(original, b),
        moved = shiftSettings(b, context, `${lanes[i]} builder snapshot`);
      if (moved.voicing)
        moved.voicing.label = labelChord(
          moved.voicing.pitches,
          shiftedContext(context),
          moved,
        );
      return moved;
    });
    const pc = passingContext(original);
    next.passing = shiftSettings(original.passing, pc, "Passing-note snapshot");
    if (next.passing.voicing)
      next.passing.voicing.label = labelNote(
        movedPassing[0],
        shiftedContext(pc),
        next.passing.source === "chord" ? next.builders[0] : null,
      );
    next.events = original.events.map((e) => {
      const context = { key: e.key, mode: e.mode },
        to = shiftedContext(context),
        moved = JSON.parse(JSON.stringify(e));
      moved.key = to.key;
      moved.pitches = checked(e.pitches, lanes[e.lane]);
      if (e.lane < 2) {
        moved.builder = shiftSettings(e.builder, context, "Chord snapshot");
        moved.label = labelChord(moved.pitches, to, moved.builder);
        if (moved.builder.voicing) moved.builder.voicing.label = moved.label;
      } else {
        moved.passing = shiftSettings(
          e.passing,
          context,
          "Passing-note snapshot",
        );
        if (e.sourceBuilder)
          moved.sourceBuilder = shiftSettings(
            e.sourceBuilder,
            context,
            "Passing source snapshot",
          );
        if (moved.sourceBuilder?.voicing)
          moved.sourceBuilder.voicing.label = labelChord(
            moved.sourceBuilder.voicing.pitches,
            to,
            moved.sourceBuilder,
          );
        moved.label = labelNote(
          moved.pitches[0],
          to,
          moved.passing.source === "chord" ? moved.sourceBuilder : null,
        );
        if (moved.passing.voicing) moved.passing.voicing.label = moved.label;
      }
      return moved;
    });
    // A selected custom note remains exact even if its source template cannot
    // represent it. Optional preview metadata also follows the same interval.
    const generated = passingOptions(next)[next.passing.index];
    if (movedPassing && (!generated || generated.pitch !== movedPassing[0]))
      next.passing.voicing = {
        pitches: movedPassing,
        label: labelNote(
          movedPassing[0],
          shiftedContext(pc),
          next.passing.source === "chord" ? next.builders[0] : null,
        ),
      };
    return validate(next);
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
    inversionCount,
    meters,
    stepsPerBar,
    totalSteps,
    scale,
    degreeName,
    chromaticRoots,
    rootInfo,
    qualityAvailable,
    chord,
    contextFor,
    passingContext,
    builderChord,
    restoreBuilder,
    restorePassing,
    fresh,
    validate,
    makeEvent,
    passingOptions,
    midi,
    noteSpans,
    transposeShift,
    transpose,
  };
});
