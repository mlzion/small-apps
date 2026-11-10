const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const load = name => import(pathToFileURL(path.join(__dirname, name)).href);
class Param {
  constructor() { this.value = 0; this.events = []; }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['ramp', value, time]); }
  setTargetAtTime(value, time) { this.value = value; this.events.push(['target', value, time]); }
  cancelAndHoldAtTime(time) { this.events.push(['hold', time]); }
}
class Node {
  constructor() { this.gain = new Param(); this.frequency = new Param(); }
  connect(node) { this.output = node; }
  disconnect() { this.disconnected = true; }
  start() { this.started = true; }
  stop(time) { this.stopTime = time; }
}
class Context {
  constructor() { this.state = 'suspended'; this.currentTime = 3; this.destination = {}; this.oscillators = []; }
  async resume() { this.state = 'running'; }
  createGain() { return new Node(); }
  createAnalyser() { return new Node(); }
  createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
}
test('frequency accuracy, lazy unlock, signal routing, attack and independent release', async () => {
  const { SynthEngine, frequencyForNote } = await load('engine.js');
  assert.equal(frequencyForNote(69), 440);
  assert.equal(frequencyForNote(81), 880);
  assert.ok(Math.abs(frequencyForNote(60) - 261.625565) < .000001);
  assert.equal(frequencyForNote(69, 432), 432);
  const context = new Context(), synth = new SynthEngine(() => context);
  assert.equal(synth.context, undefined); assert.equal(synth.noteOn('early', 60), false);
  await synth.enable(); assert.equal(context.state, 'running'); assert.equal(synth.master.gain.value, .2);
  assert.equal(synth.master.output, synth.analyser); assert.equal(synth.analyser.output, context.destination);
  synth.noteOn('a', 69); synth.noteOn('b', 69); synth.noteOn('c', 81);
  assert.equal(synth.voices.size, 3); assert.equal(synth.noteOn('a', 72), false);
  assert.equal(context.oscillators[0].frequency.value, 440);
  const voice = synth.voices.get('a');
  assert.deepEqual(voice.gain.gain.events, [['set', 0, 3], ['ramp', 1/16, 3.015]]);
  synth.noteOff('a'); assert.equal(synth.voices.size, 2);
  assert.deepEqual(voice.gain.gain.events.slice(-2), [['hold',3],['ramp',0,3.06]]);
  assert.equal(voice.oscillator.stopTime, 3.065);
  voice.oscillator.onended(); assert.ok(voice.oscillator.disconnected); assert.ok(voice.gain.disconnected);
  synth.allNotesOff(); assert.equal(synth.voices.size, 0);
  assert.ok(context.oscillators.every(node => node.stopTime));
});
test('all waveform selections, live reference tuning, volume and voice limit', async () => {
  const { SynthEngine, WAVEFORMS } = await load('engine.js');
  const synth = new SynthEngine(() => new Context()); await synth.enable(); synth.noteOn('a', 69);
  for (const type of WAVEFORMS) { synth.setWaveform(type); assert.equal(synth.voices.get('a').oscillator.type, type); }
  assert.throws(() => synth.setWaveform('noise'), RangeError);
  synth.setReference(432); assert.equal(synth.voices.get('a').oscillator.frequency.value, 432);
  synth.setVolume(.5); assert.equal(synth.master.gain.value, .5);
  for (let i=0;i<30;i++) synth.noteOn(i,60+i);
  assert.equal(synth.voices.size,16); synth.allNotesOff();
});
test('tutorial gating, manual skip, navigation, mode preservation and completion', async () => {
  const { Tutorial } = await load('tutorial.js'); const { oscillatorLesson } = await load('lessons.js');
  const entries = []; const lesson = new Tutorial(oscillatorLesson, { onEnter: x => entries.push(x) });
  lesson.next(); assert.equal(lesson.index,1); assert.deepEqual(entries,['sine']);
  lesson.next(); assert.equal(lesson.index,1);
  lesson.setMode('free'); lesson.setMode('guided'); assert.equal(lesson.index,1); assert.equal(entries.length,1);
  lesson.notify('note'); assert.ok(lesson.canNext); lesson.next(); assert.equal(lesson.index,2);
  lesson.back(); assert.equal(lesson.index,1); assert.equal(lesson.canNext,false); lesson.skip(); assert.equal(lesson.index,2);
  lesson.next(); lesson.next(); lesson.next(); assert.ok(lesson.complete);
  lesson.restart(); assert.equal(lesson.index,0); assert.equal(lesson.mode,'guided'); assert.equal(lesson.complete,false);
});
