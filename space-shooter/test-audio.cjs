'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/audio.js', 'utf8');
let contexts = 0, resumed = 0, started = 0, stopped = 0;
const storage = new Map();
class AudioContext {
  constructor() { contexts++; this.state = 'suspended'; this.currentTime = 1; this.destination = {}; }
  resume() { resumed++; this.state = 'running'; return Promise.resolve(); }
  createGain() { return {gain: {value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}}, connect() {}, disconnect() {}}; }
  createOscillator() { return {frequency: {setValueAtTime() {}, exponentialRampToValueAtTime() {}}, connect() {}, disconnect() {}, start() { started++; }, stop() { stopped++; }}; }
}
const window = {AudioContext};
const localStorage = {getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v)};
vm.runInNewContext(source, {window, localStorage});
let audio = window.GalactixAudio.create();
audio.unlock(); audio.play(['fire']); assert.equal(contexts, 0); assert.equal(started, 0, 'muted until a gesture');
audio.toggle(); assert.equal(audio.enabled, true); assert.equal(contexts, 1); assert.equal(resumed, 1);
audio.play(['fire', 'destroy', 'hit']); assert.equal(started, 1, 'one priority cue per step');
audio.play(['fire']); assert.equal(started, 2);
audio.stop(); assert.equal(stopped, 4, 'pause stops both scheduled voices');
audio.toggle(); assert.equal(audio.enabled, false); audio.play(['damage']); assert.equal(started, 2);
assert.equal(window.GalactixAudio.create().enabled, false);
audio.toggle(); assert.equal(window.GalactixAudio.create().enabled, true, 'saved preference');
vm.runInNewContext(source, {window: {}, localStorage});
// Missing Web Audio and blocked storage leave the game usable.
const noAudioWindow = {};
vm.runInNewContext(source, {window: noAudioWindow, localStorage: {getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }}});
audio = noAudioWindow.GalactixAudio.create(); audio.toggle(); audio.unlock(); audio.play(['fire']); audio.stop();
console.log('PASS: optional sound gesture, preference, cue priority, pause/mute cleanup and unsupported/blocked fallback');
