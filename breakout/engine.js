'use strict';
// Physics use a fixed logical playfield; rendering alone changes on resize.
class Breakout {
  constructor(sound = () => {}) { this.sound = sound; this.reset(); }
  reset() {
    this.score = 0; this.lives = 3; this.level = 1; this.state = 'idle';
    this.paddle = { x: 344, y: 512, w: 112, h: 14 };
    this.makeLevel(); this.dock();
  }
  get speed() { return Math.min(720, 300 + (this.level - 1) * 35); }
  makeLevel() {
    this.bricks = [];
    for (let row = 0; row < 5; row++) for (let col = 0; col < 10; col++)
      this.bricks.push({ x: 35 + col * 74, y: 60 + row * 30, w: 64, h: 20, row, alive: true });
  }
  dock() { this.ball = { x: this.paddle.x + this.paddle.w / 2, y: this.paddle.y - 9, r: 7, vx: 0, vy: 0 }; }
  move(x) { this.paddle.x = Math.max(0, Math.min(800 - this.paddle.w, x - this.paddle.w / 2)); if (['idle', 'ready'].includes(this.state)) this.dock(); }
  action() {
    if (this.state === 'idle' || this.state === 'over') { this.reset(); this.state = 'ready'; }
    else if (this.state === 'ready') { this.ball.vx = this.speed * .36; this.ball.vy = -this.speed * Math.sqrt(1 - .36 ** 2); this.state = 'playing'; this.sound('launch'); }
    else if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
  }
  // Circle/rectangle contact normal includes rounded corners, avoiding AABB corner hits.
  collide(rect) {
    const b = this.ball;
    const dx = b.x - Math.max(rect.x, Math.min(rect.x + rect.w, b.x));
    const dy = b.y - Math.max(rect.y, Math.min(rect.y + rect.h, b.y));
    const distance = Math.hypot(dx, dy);
    if (distance >= b.r || distance === 0) return false;
    const nx = dx / distance, ny = dy / distance;
    const dot = b.vx * nx + b.vy * ny;
    if (dot >= 0) return false;
    b.x += nx * (b.r - distance + .01); b.y += ny * (b.r - distance + .01);
    b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
    return true;
  }
  update(dt, direction = 0) {
    if (!['ready', 'playing'].includes(this.state)) return;
    // At most two pixels per step prevents tunneling even at maximum level speed.
    const steps = Math.max(1, Math.ceil(Math.max(this.speed, 520) * dt / 2));
    const step = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (direction) this.move(this.paddle.x + this.paddle.w / 2 + direction * 520 * step);
      if (this.state !== 'playing') continue;
      const b = this.ball;
      b.x += b.vx * step; b.y += b.vy * step;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); this.sound('wall'); }
      if (b.x > 800 - b.r) { b.x = 800 - b.r; b.vx = -Math.abs(b.vx); this.sound('wall'); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); this.sound('wall'); }
      if (b.vy > 0 && this.collide(this.paddle)) {
        // Edge contacts steer the ball, always upwards with a useful vertical speed.
        const offset = Math.max(-1, Math.min(1, (b.x - this.paddle.x - this.paddle.w / 2) / (this.paddle.w / 2)));
        const angle = offset * Math.PI / 3;
        b.vx = this.speed * Math.sin(angle); b.vy = -this.speed * Math.cos(angle);
        b.y = Math.min(b.y, this.paddle.y - b.r - .01); this.sound('paddle');
      }
      for (const brick of this.bricks) if (brick.alive && this.collide(brick)) {
        brick.alive = false; this.score += (5 - brick.row) * 10; this.sound('brick'); break;
      }
      if (this.bricks.every(brick => !brick.alive)) {
        this.level++; this.makeLevel(); this.state = 'ready'; this.dock(); this.sound('level'); return;
      }
      if (b.y - b.r > 560) {
        this.lives--; this.state = this.lives ? 'ready' : 'over'; this.dock(); this.sound('lost'); return;
      }
    }
  }
}
if (typeof module !== 'undefined') module.exports = Breakout;
