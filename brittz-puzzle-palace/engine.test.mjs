import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preparePuzzle} from './content.js';
const {pieces}=preparePuzzle(JSON.parse(readFileSync(new URL('./puzzles/sea-turtle/puzzle.json',import.meta.url),'utf8')));
import {canSnap,angleDistance,shuffledState,clampPiece,rotatedBounds} from './engine.js';
test('snapping requires position AND orientation at every zoom',()=>{
 const p=pieces[15];
 for(const scale of [.4,1,2,4]){
 assert(canSnap(p,{x:p.cx,y:p.cy,angle:360},scale));
 assert(!canSnap(p,{x:p.cx,y:p.cy,angle:12},scale));
 assert(!canSnap(p,{x:p.cx+35,y:p.cy,angle:0},scale));
 assert(canSnap(p,{x:p.cx+Math.min(28,20/scale)-.01,y:p.cy,angle:-8},scale));
 assert(!canSnap(p,{x:p.cx+Math.min(28,20/scale)+.01,y:p.cy,angle:0},scale));
 }
 assert.equal(angleDistance(-721),1);assert.equal(angleDistance(359),1);
});
test('shuffle and return retain all identities without duplicates',()=>{
 const g=shuffledState(pieces,()=>.37);assert.equal(new Set(g.order).size,pieces.length);
 assert.deepEqual([...g.order].sort(),pieces.map(p=>p.id).sort());assert.notDeepEqual(g.order,pieces.map(p=>p.id));
 const id=g.order[4],order=[...g.order];g.states[id].location='board';g.states[id].location='tray';assert.deepEqual(g.order,order);
 for(const s of Object.values(g.states)){assert.equal(s.location,'tray');assert.equal(s.angle%30,0);}
});
test('movement and rotation keep every vertex on the board',()=>{
 for(const p of pieces)for(let angle=0;angle<360;angle+=7)for(const pos of [-1000,1000]){
 const s={x:pos,y:pos,angle};clampPiece(p,s,720,480);const b=rotatedBounds(p,angle);
 assert(s.x+b.left>=-1e-9&&s.x+b.right<=720+1e-9);assert(s.y+b.top>=-1e-9&&s.y+b.bottom<=480+1e-9);
 }
});
test('every piece can reach its exact canonical placement',()=>{
 const g=shuffledState(pieces);for(const p of pieces){const s=g.states[p.id];Object.assign(s,{x:p.cx,y:p.cy,angle:0,location:'board'});assert(canSnap(p,s,1));s.location='locked';}assert.equal(Object.values(g.states).filter(s=>s.location==='locked').length,pieces.length);
});
