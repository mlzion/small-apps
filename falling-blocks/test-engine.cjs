'use strict';
const assert = require('node:assert/strict');
const {Game,SHAPES} = require('./engine.js');
const fresh = () => {const g=new Game(()=>.5);g.state='playing';return g;};
for(let type=0;type<7;type++) {
  const g=fresh();g.piece={type,matrix:SHAPES[type].map(r=>r.slice()),x:3,y:4};
  const original=JSON.stringify(g.piece.matrix);
  for(let i=0;i<4;i++)assert(g.rotate());
  assert.equal(JSON.stringify(g.piece.matrix),original);
  assert(g.rotate(-1));assert(g.rotate());assert.equal(JSON.stringify(g.piece.matrix),original);
  while(g.move(-1,0)){}assert(!g.move(-1,0));assert(g.fits(g.piece));assert(g.rotate());
  while(g.move(1,0)){}assert(!g.move(1,0));assert(g.fits(g.piece));assert(g.rotate());
  g.piece.y=g.ghostY();assert(!g.move(0,1));assert(g.rotate());assert(g.fits(g.piece));
  assert.equal(g.piece.matrix.flat().filter(Boolean).length,4);
}
for(let count=1;count<=4;count++) {
  const g=fresh();
  for(let y=20-count;y<20;y++)g.board[y]=Array(10).fill(2).map((v,x)=>x===4?0:v);
  g.piece={type:0,matrix:[[1],[1],[1],[1]],x:4,y:16};
  assert.equal(g.lock(),count);assert.equal(g.score,[0,100,300,500,800][count]);
  assert.equal(g.lines,count);assert.equal(g.board.length,20);assert(!g.board.some(r=>r.every(Boolean)));
}
{
 const g=fresh();g.lines=9;g.board[19]=Array(10).fill(1);g.board[19][4]=0;
 g.piece={type:0,matrix:[[1]],x:4,y:19};g.lock();assert.equal(g.level,2);assert.equal(g.score,100);
 g.tick(680);assert.equal(g.piece.y,1);
 g.state='paused';const before=JSON.stringify(g);g.tick(900);g.move(1,0);g.rotate();g.drop(true);assert.equal(JSON.stringify(g),before);
}
{
 const g=fresh();const y=g.ghostY();assert.equal(g.drop(true),0);assert.equal(g.score,y*2);assert.equal(g.board.flat().filter(Boolean).length,4);
 g.board=Array.from({length:20},()=>Array(10).fill(1));g.spawn();assert.equal(g.state,'over');
 g.reset();assert.equal(g.state,'ready');assert.equal(g.score,0);assert.equal(g.level,1);
 const bag=Array.from({length:7},()=>g.draw());assert.equal(new Set(bag).size,7);
}
{
 const g=fresh();g.board[5][4]=1;g.piece={type:1,matrix:SHAPES[1],x:4,y:2};assert.equal(g.ghostY(),3);assert(g.move(0,1));assert(!g.move(0,1));
 g.piece={type:0,matrix:SHAPES[0],x:3,y:0};g.board=Array.from({length:20},()=>Array(10).fill(1));assert(!g.rotate());
}
console.log('PASS: seven shapes, both rotations, walls/floor/stack, blocked rotation, 1–4 line clears, score, level/gravity, ghost, hard drop, pause, game over, restart, seven-piece bag');
