export class Tutorial {
  constructor(lesson, { onEnter = () => {}, onRender = () => {} } = {}) {
    this.lesson = lesson; this.onEnter = onEnter; this.onRender = onRender;
    this.index = 0; this.mode = 'guided'; this.events = new Set();
  }
  get step() { return this.lesson.steps[this.index]; }
  get complete() { return this.index >= this.lesson.steps.length; }
  get canNext() { return !this.step?.requires || this.events.has(this.step.requires); }
  render() { this.onRender(this); }
  enter() { if (this.step?.enter) this.onEnter(this.step.enter); this.render(); }
  notify(event) { this.events.add(event); this.render(); }
  next() { if (!this.complete && this.canNext) { this.index++; this.events.clear(); this.enter(); } }
  back() { if (this.index > 0) { this.index--; this.events.clear(); this.enter(); } }
  skip() { if (!this.complete) { this.index++; this.events.clear(); this.enter(); } }
  setMode(mode) { this.mode = mode; this.render(); } // Mode switches preserve sound settings and lesson position.
  restart() { this.index = 0; this.mode = 'guided'; this.events.clear(); this.enter(); }
}
