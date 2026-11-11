/* One step = one 64th note; 64 steps/bar. Shared browser/Node model. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DruMidi = api;
})(globalThis, () => {
  "use strict";
  const names = [
    "Acoustic Kick",
    "Kick",
    "Side Stick",
    "Snare",
    "Hand Clap",
    "Electric Snare",
    "Low Floor Tom",
    "Closed Hi-hat",
    "High Floor Tom",
    "Pedal Hi-hat",
    "Low Tom",
    "Open Hi-hat",
    "Low Mid Tom",
    "High Mid Tom",
    "Crash",
    "High Tom",
    "Ride",
    "Chinese Cymbal",
    "Ride Bell",
    "Tambourine",
    "Splash Cymbal",
    "Cowbell",
    "Crash 2",
    "Vibraslap",
    "Ride 2",
    "High Bongo",
    "Low Bongo",
    "Mute High Conga",
    "Open High Conga",
    "Low Conga",
    "High Timbale",
    "Low Timbale",
    "High Agogo",
    "Low Agogo",
    "Cabasa",
    "Maracas",
    "Short Whistle",
    "Long Whistle",
    "Short Guiro",
    "Long Guiro",
    "Claves",
    "High Wood Block",
    "Low Wood Block",
    "Mute Cuica",
    "Open Cuica",
    "Mute Triangle",
    "Open Triangle",
  ];
  const catalog = names.map((name, i) => ({
    midi: i + 35,
    name,
    velocity: /hat|Ride/.test(name) ? 78 : /Kick|Snare/.test(name) ? 106 : 94,
  }));
  const fresh = () => ({
    format: "drumidi",
    version: 1,
    bpm: 120,
    drums: [35, 38, 42, 46, 51, 50, 47, 43, 49].map((m) => ({
      ...catalog[m - 35],
    })),
    patterns: Array.from({ length: 8 }, (_, i) => ({
      id: `P${i + 1}`,
      bars: 1,
      notes: [],
    })),
    arrangement: { bars: 8, lanes: [[], []] },
  });
  const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const error = (message) => {
    throw new Error(message);
  };
  function canPlace(project, lane, pattern, start, ignore) {
    const p = project.patterns.find((p) => p.id === pattern);
    return (
      !!p &&
      int(lane, 0, 1) &&
      int(start, 0, 7) &&
      start + p.bars <= project.arrangement.bars &&
      project.arrangement.lanes[lane].every(
        (c) =>
          c.id === ignore ||
          start + p.bars <= c.start ||
          start >=
            c.start + project.patterns.find((p) => p.id === c.pattern).bars,
      )
    );
  }
  function validate(raw) {
    if (!raw || raw.format !== "drumidi" || raw.version !== 1)
      error(
        "Unsupported project format or version. Choose a DruMidi version 1 JSON project.",
      );
    if (!int(raw.bpm, 30, 300))
      error("BPM must be a whole number from 30 to 300.");
    if (!Array.isArray(raw.drums) || !raw.drums.length || raw.drums.length > 47)
      error("Project must contain 1–47 drum instruments.");
    const used = new Set();
    const drums = raw.drums.map((d) => {
      if (
        !d ||
        !int(d.midi, 35, 81) ||
        used.has(d.midi) ||
        typeof d.name !== "string" ||
        !d.name.trim() ||
        d.name.length > 40 ||
        !int(d.velocity, 1, 127)
      )
        error("Invalid or duplicate GM drum assignment.");
      used.add(d.midi);
      return { midi: d.midi, name: d.name, velocity: d.velocity };
    });
    if (!Array.isArray(raw.patterns) || raw.patterns.length !== 8)
      error("Project must contain exactly eight patterns.");
    const patterns = raw.patterns.map((p, i) => {
      if (
        !p ||
        p.id !== `P${i + 1}` ||
        !int(p.bars, 1, 4) ||
        !Array.isArray(p.notes) ||
        p.notes.length > 12032
      )
        error(`Invalid pattern P${i + 1}.`);
      const seen = new Set();
      const notes = p.notes.map((n) => {
        if (
          !n ||
          !used.has(n.drum) ||
          !int(n.step, 0, 255) ||
          !int(n.velocity, 1, 127)
        )
          error(`Invalid note in ${p.id}.`);
        const key = `${n.drum}:${n.step}`;
        if (seen.has(key)) error(`Duplicate note in ${p.id}.`);
        seen.add(key);
        return { drum: n.drum, step: n.step, velocity: n.velocity };
      });
      return { id: p.id, bars: p.bars, notes };
    });
    const a = raw.arrangement;
    if (
      !a ||
      !int(a.bars, 1, 8) ||
      !Array.isArray(a.lanes) ||
      a.lanes.length !== 2
    )
      error("Arrangement must have 1–8 bars and two lanes.");
    const project = {
      format: "drumidi",
      version: 1,
      bpm: raw.bpm,
      drums,
      patterns,
      arrangement: { bars: a.bars, lanes: [[], []] },
    };
    const ids = new Set();
    a.lanes.forEach((lane, i) => {
      if (!Array.isArray(lane) || lane.length > 8)
        error("Invalid arrangement lane.");
      lane.forEach((c) => {
        if (
          !c ||
          typeof c.id !== "string" ||
          c.id.length > 80 ||
          !c.id ||
          ids.has(c.id) ||
          !canPlace(project, i, c.pattern, c.start)
        )
          error(
            "Arrangement contains overlapping, out-of-bounds, or invalid clips.",
          );
        ids.add(c.id);
        project.arrangement.lanes[i].push({
          id: c.id,
          pattern: c.pattern,
          start: c.start,
        });
      });
    });
    return project;
  }
  function events(project, page, selected = 0) {
    const expand = (p, offset, lane) =>
      p.notes
        .filter((n) => n.step < p.bars * 64)
        .map((n) => ({ ...n, step: n.step + offset, lane }));
    if (page === "pattern")
      return expand(project.patterns[selected], 0, 0).sort(
        (a, b) => a.step - b.step,
      );
    return project.arrangement.lanes
      .flatMap((lane, i) =>
        lane.flatMap((c) =>
          expand(
            project.patterns.find((p) => p.id === c.pattern),
            c.start * 64,
            i,
          ),
        ),
      )
      .sort((a, b) => a.step - b.step);
  }
  const vlq = (v) => {
    const out = [v & 127];
    while ((v = Math.floor(v / 128))) out.unshift((v & 127) | 128);
    return out;
  };
  const bytes = (n) => [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ];
  const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));
  const chunk = (type, data) => [
    ...ascii(type),
    ...bytes(data.length),
    ...data,
  ];
  function midi(project, page, selected = 0) {
    const bars =
        page === "pattern"
          ? project.patterns[selected].bars
          : project.arrangement.bars,
      end = bars * 3840,
      tempo = Math.round(60000000 / project.bpm);
    const track = (name, ev, meta = false) => {
      const text = ascii(name),
        data = [0, 255, 3, ...vlq(text.length), ...text];
      if (meta)
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
          4,
          2,
          24,
          8,
        );
      const sorted = ev
        .flatMap((n) => [
          { tick: n.step * 60, data: [153, n.drum, n.velocity], order: 1 },
          { tick: n.step * 60 + 30, data: [137, n.drum, 0], order: 0 },
        ])
        .sort((a, b) => a.tick - b.tick || a.order - b.order);
      let last = 0;
      for (const e of sorted) {
        data.push(...vlq(e.tick - last), ...e.data);
        last = e.tick;
      }
      data.push(...vlq(end - last), 255, 47, 0);
      return chunk("MTrk", data);
    };
    const ev = events(project, page, selected),
      tracks = [track("Tempo", [], true)];
    if (page === "pattern")
      tracks.push(track(project.patterns[selected].id, ev));
    else
      ["Lane A - Backbone", "Lane B - Fills"].forEach((name, i) =>
        tracks.push(
          track(
            name,
            ev.filter((n) => n.lane === i),
          ),
        ),
      );
    return new Uint8Array([
      ...chunk("MThd", [0, 1, 0, tracks.length, 3, 192]),
      ...tracks.flat(),
    ]);
  }
  return { catalog, fresh, validate, canPlace, events, midi };
});
