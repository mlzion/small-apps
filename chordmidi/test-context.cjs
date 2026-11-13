"use strict";
const assert = require("node:assert/strict"),
  D = require("./core.js");
let cases = 0;
for (let songKey = 0; songKey < 12; songKey++)
  for (const songMode of ["Major", "Minor"])
    for (let key = 0; key < 12; key++)
      for (const mode of ["Major", "Minor"])
        for (const lane of [0, 1])
          for (const quality of ["diatonic", "octave", "dom7"]) {
            const source = D.fresh();
            source.key = key;
            source.mode = mode;
            source.builders[lane] = {
              degree: key % 7,
              quality,
              inversion: quality === "octave" ? 0 : 1,
              octave: lane ? 3 : 4,
            };
            const event = D.makeEvent(source, lane, 0, 4),
              p = D.fresh();
            p.key = songKey;
            p.mode = songMode;
            p.events = [event];
            const saved = JSON.stringify(event),
              midi = D.midi(p);
            p.builders[lane] = D.restoreBuilder(p, event);
            assert.equal(p.key, songKey);
            assert.equal(p.mode, songMode);
            assert.equal(JSON.stringify(event), saved);
            assert.deepEqual(
              D.builderChord(p, p.builders[lane]).pitches,
              event.pitches,
            );
            assert.deepEqual(D.contextFor(p, p.builders[lane]), { key, mode });
            assert.equal(p.builders[lane].quality, quality);
            assert.equal(p.builders[lane].inversion, event.builder.inversion);
            assert.equal(p.builders[lane].octave, event.builder.octave);
            const placed = D.makeEvent(p, lane, 4, 4);
            assert.deepEqual(placed.pitches, event.pitches);
            assert.equal(placed.key, key);
            assert.equal(placed.mode, mode);
            assert(!placed.builder.context && !placed.builder.voicing);
            assert.deepEqual(D.validate(JSON.parse(JSON.stringify(p))), p);
            assert.deepEqual(D.midi(p), midi);
            cases++;
          }
for (const lane of [0, 1]) {
  const source = D.fresh();
  source.key = 2;
  source.mode = "Minor";
  const e = D.makeEvent(source, lane, 0, 4);
  e.pitches = [0, 64, 127];
  e.label = "Custom stored voicing";
  const p = D.fresh();
  p.events = [e];
  const original = JSON.stringify(e);
  p.builders[lane] = D.restoreBuilder(p, e);
  const view = D.builderChord(p, p.builders[lane]);
  assert(!view.templateMatches);
  assert.deepEqual(view.pitches, [0, 64, 127]);
  assert.match(view.name, /stored voicing/);
  assert.deepEqual(D.makeEvent(p, lane, 4).pitches, e.pitches);
  assert.deepEqual(D.validate(JSON.parse(JSON.stringify(p))), p);
  assert.equal(p.key, 0);
  assert.equal(p.mode, "Major");
  assert.equal(JSON.stringify(e), original);
  delete p.builders[lane].voicing;
  p.builders[lane].degree = 1;
  assert.deepEqual(
    D.builderChord(p, p.builders[lane]).pitches,
    D.chord(2, "Minor", p.builders[lane]).pitches,
  );
  assert.equal(JSON.stringify(e), original);
  cases++;
}
// Passing-note context stays independent of the song; chord-tone selections
// can restore their RH source template without changing the song key/mode.
for (const sourceType of ["scale", "chord"]) {
  const source = D.fresh();
  source.key = 1;
  source.mode = "Major";
  source.passing.source = sourceType;
  source.passing.index = 1;
  source.builders[0].quality = "octave";
  source.builders[0].degree = 6;
  const e = D.makeEvent(source, 2, 0),
    p = D.fresh();
  p.key = 7;
  p.mode = "Minor";
  p.events = [e];
  if (sourceType === "chord")
    p.builders[0] = {
      ...e.sourceBuilder,
      context: { key: e.key, mode: e.mode },
    };
  p.passing = D.restorePassing(p, e);
  assert.equal(p.key, 7);
  assert.equal(p.mode, "Minor");
  assert.equal(D.passingOptions(p)[p.passing.index].pitch, e.pitches[0]);
  assert.deepEqual(D.makeEvent(p, 2, 1).pitches, e.pitches);
  e.pitches = [126];
  e.label = "F♯9";
  p.passing = D.restorePassing(p, e);
  assert.deepEqual(p.passing.voicing.pitches, [126]);
  assert.deepEqual(D.makeEvent(p, 2, 1).pitches, [126]);
  assert.deepEqual(D.validate(JSON.parse(JSON.stringify(p))), p);
  cases++;
}
const spellingSource = D.fresh();
spellingSource.builders[0].quality = "dim7";
const spellingEvent = D.makeEvent(spellingSource, 0, 0);
spellingEvent.pitches = spellingEvent.pitches.map((n) => n + 12);
const spellingBuilder = D.restoreBuilder(spellingSource, spellingEvent);
assert.deepEqual(D.builderChord(spellingSource, spellingBuilder).noteLabels, [
  "C5",
  "E♭5",
  "G♭5",
  "B♭♭5",
]);
for (const mutate of [
  (p) => (p.builders[0].context = { key: 12, mode: "Major" }),
  (p) => (p.builders[0].context = null),
  (p) => (p.builders[0].context = { key: 0, mode: "Dorian" }),
  (p) => (p.builders[0].voicing = { pitches: [128], label: "bad" }),
  (p) => (p.builders[0].voicing = { pitches: [60, 60], label: "duplicate" }),
  (p) => (p.passing.voicing = { pitches: [60, 64], label: "two" }),
  (p) => (p.passing.context = { key: 0, mode: "wrong" }),
]) {
  const p = D.fresh();
  mutate(p);
  assert.throws(() => D.validate(p));
}
console.log(
  `PASS: ${cases} song/original-context cases across all keys, both modes/hands, diatonic triads/octave dyads/sevenths, custom immutable voicings, Drop/placement pitch equality, passing-note contexts, JSON persistence, unchanged MIDI and optional-context validation.`,
);
