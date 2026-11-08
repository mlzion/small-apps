const assert = require('node:assert/strict');
const Breakout = require('./engine.js');
const g = new Breakout();
assert.equal(g.lives, 3); g.action(); assert.equal(g.state,'ready'); g.action();
assert.equal(g.state,'playing');g.action();const x=g.ball.x;g.update(.1);assert.equal(g.ball.x,x);g.action();
const brick=g.bricks[0];g.bricks.forEach(b=>{if(b!==brick)b.alive=false;});g.bricks[49].alive=true;g.ball={x:brick.x+20,y:brick.y+brick.h+8,r:7,vx:0,vy:-300};g.update(.02);assert.equal(g.score,50);assert.equal(brick.alive,false);assert(g.ball.vy>0);
// Rounded corner reflects both components; empty corner outside the radius is not a hit.
g.ball={x:brick.x-6,y:brick.y-6,r:7,vx:200,vy:200};assert.equal(g.collide(brick),false);
g.ball={x:brick.x-4,y:brick.y-4,r:7,vx:200,vy:200};assert(g.collide(brick));assert(g.ball.vx<0 && g.ball.vy<0);
for(const offset of [-54,0,54]){g.ball={x:g.paddle.x+56+offset,y:g.paddle.y-8,r:7,vx:0,vy:300};g.update(.01);assert(g.ball.vy<0);assert(Math.abs(Math.hypot(g.ball.vx,g.ball.vy)-g.speed)<.001);}
g.bricks.forEach(b=>b.alive=false);g.update(.01);assert.equal(g.level,2);assert.equal(g.state,'ready');assert.equal(g.speed,335);assert.equal(g.bricks.length,50);
for(let life=2;life>=0;life--){g.action();g.ball.y=570;g.ball.vy=300;g.update(.01);assert.equal(g.lives,life);assert.equal(g.state,life?'ready':'over');}
g.reset();assert.equal(g.level,1);assert.equal(g.score,0);assert.equal(g.lives,3);
g.move(-200);assert.equal(g.paddle.x,0);g.move(2000);assert.equal(g.paddle.x,688);
console.log('PASS: scoring, corners, paddle edges, pause, levels, speed, lives, game over, reset and bounds');
