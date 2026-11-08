/* Original Falling Blocks rules engine. No rendering or browser dependencies. */
(function (root) {
  'use strict';
  const SHAPES = [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[1,1],[1,1]],
    [[0,1,0],[1,1,1],[0,0,0]],
    [[0,1,1],[1,1,0],[0,0,0]],
    [[1,1,0],[0,1,1],[0,0,0]],
    [[1,0,0],[1,1,1],[0,0,0]],
    [[0,0,1],[1,1,1],[0,0,0]]
  ];
  class Game {
    constructor(random = Math.random) { this.random = random; this.reset(); }
    reset() {
      this.board = Array.from({length:20}, () => Array(10).fill(0));
      this.bag = []; this.score = 0; this.lines = 0; this.level = 1;
      this.elapsed = 0; this.state = 'ready'; this.next = this.draw(); this.spawn();
    }
    draw() {
      if (!this.bag.length) {
        this.bag = [0,1,2,3,4,5,6];
        for (let i = 6; i > 0; i--) {
          const j = Math.floor(this.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      return this.bag.pop();
    }
    spawn() {
      const type = this.next; this.next = this.draw();
      this.piece = {type, matrix:SHAPES[type].map(r => r.slice()), x: type === 1 ? 4 : 3, y:0};
      this.elapsed = 0;
      if (!this.fits(this.piece)) this.state = 'over';
    }
    fits(p) {
      return p.matrix.every((row,y) => row.every((v,x) => !v || (
        p.x+x >= 0 && p.x+x < 10 && p.y+y >= 0 && p.y+y < 20 && !this.board[p.y+y][p.x+x]
      )));
    }
    move(dx,dy) {
      if (this.state !== 'playing') return false;
      const p = {...this.piece, x:this.piece.x+dx, y:this.piece.y+dy};
      if (!this.fits(p)) return false;
      this.piece = p; return true;
    }
    rotate(direction = 1) {
      if (this.state !== 'playing') return false;
      const m = this.piece.matrix;
      const matrix = m.map((r,y) => r.map((_,x) => direction === 1 ? m[m.length-1-x][y] : m[x][m.length-1-y]));
      // Small horizontal and upward adjustments allow turns near walls and floors.
      for (const [dx,dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[0,-2]]) {
        const p = {...this.piece,matrix,x:this.piece.x+dx,y:this.piece.y+dy};
        if (this.fits(p)) { this.piece = p; return true; }
      }
      return false;
    }
    ghostY() {
      const p = {...this.piece};
      while (this.fits({...p,y:p.y+1})) p.y++;
      return p.y;
    }
    lock() {
      this.piece.matrix.forEach((r,y) => r.forEach((v,x) => { if (v) this.board[this.piece.y+y][this.piece.x+x] = this.piece.type+1; }));
      const remaining = this.board.filter(r => r.some(v => !v));
      const cleared = 20 - remaining.length;
      this.score += [0,100,300,500,800][cleared] * this.level;
      this.lines += cleared; this.level = 1 + Math.floor(this.lines / 10);
      this.board = [...Array.from({length:cleared}, () => Array(10).fill(0)), ...remaining];
      this.spawn(); return cleared;
    }
    drop(hard = false) {
      if (this.state !== 'playing') return null;
      if (hard) { const distance = this.ghostY()-this.piece.y; this.piece.y += distance; this.score += distance*2; return this.lock(); }
      if (this.move(0,1)) { this.score++; this.elapsed = 0; return null; }
      return this.lock();
    }
    tick(ms) {
      if (this.state !== 'playing') return null;
      this.elapsed += ms;
      const interval = Math.max(80, 850 * Math.pow(.8,this.level-1));
      if (this.elapsed >= interval) {
        this.elapsed %= interval;
        if (!this.move(0,1)) return this.lock();
      }
      return null;
    }
  }
  const api = {Game,SHAPES};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FallingBlocks = api;
})(typeof window !== 'undefined' ? window : globalThis);
