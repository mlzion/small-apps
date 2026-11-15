import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {COUNTS,validatePattern,rotatePattern,contains} from './geometry.js';
import {contour,shapeDistance,NEAR_TOLERANCE} from './shape-distance.js';
import {imagePuzzle} from './image-puzzle.js';
import {canSnap,shuffledState,clampPiece} from '../engine.js';
const load=count=>JSON.parse(readFileSync(new URL(`patterns/${count}.json`,import.meta.url),'utf8'));
for(const count of COUNTS)test(`${count} permanent cuts: exact mesh, distinct outlines, all quarter-turns and gameplay positions`,()=>{
 const master=load(count),report=validatePattern(master,{uniqueness:true});
 assert.equal(report.count,count);assert.equal(report.corners,4);assert(report.similarity.minimum>=NEAR_TOLERANCE);
 for(const angle of [0,90,180,270]){
 const rotated=rotatePattern(master,angle);validatePattern(rotated);
 assert.deepEqual(rotatePattern(rotated,(360-angle)%360),master);
 const puzzle=imagePuzzle(master,{url:'blob:test-original',name:'Image'},angle);
 const game=shuffledState(puzzle.pieces,()=>.73);
 for(const p of puzzle.pieces){
 const s=game.states[p.id];Object.assign(s,{x:p.cx,y:p.cy,angle:360});assert(canSnap(p,s,1));
 s.angle=15;assert(!canSnap(p,s,1));s.angle=0;s.x+=35;assert(!canSnap(p,s,1));
 Object.assign(s,{x:p.cx,y:p.cy,angle:0});clampPiece(p,s,1000,1000);assert.equal(s.x,p.cx);assert.equal(s.y,p.cy);
 }
 // Independent non-grid samples: exactly one interior owner away from seams.
 for(let i=0;i<1800;i++){const x=((i*3571+137)%999983)+.113,y=((i*7331+433)%999979)+.271;assert.equal(rotated.pieces.filter(p=>contains([x,y],p.points)).length,1);}
 }
 console.log(`${count}: smallest distinctness lower bound ${report.similarity.minimum.toFixed(6)}; min core ${report.minCore.toFixed(3)}; min angle ${report.minAngle.toFixed(1)}°`);
});
function directDistance(a,b){let best=-Infinity;for(let reflected=0;reflected<2;reflected++)for(let shift=0;shift<a.n;shift++){let dot=0,cross=0;for(let i=0;i<a.n;i++){const j=reflected?(shift-i+a.n)%a.n:(shift+i)%a.n,ax=a.xy[2*i],ay=a.xy[2*i+1],bx=b.xy[2*j],by=b.xy[2*j+1]*(reflected?-1:1);dot+=ax*bx+ay*by;cross+=ax*by-ay*bx;}best=Math.max(best,Math.hypot(dot,cross));}return Math.sqrt(Math.max(0,(a.norm+b.norm-2*best)/a.n));}
test('deterministic comparison rejects identical, translated, scaled, rotated and reflected outlines',()=>{
 const points=load(50).pieces[12].points,a=contour(points);
 for(const angle of [0,.31,Math.PI/2,Math.PI,2.33])for(const reflection of [1,-1]){
 const b=contour(points.map(([x,y])=>[17+3*(x*Math.cos(angle)-reflection*y*Math.sin(angle)),-113+3*(x*Math.sin(angle)+reflection*y*Math.cos(angle))]));
 assert(shapeDistance(a,b).lowerBound<1e-6);
 }
 const near=contour(points.map(([x,y],i)=>[x+(i%2?70:-70),y]));assert(shapeDistance(a,near).lowerBound<NEAR_TOLERANCE);
 const b=contour(load(50).pieces[33].points);assert(Math.abs(shapeDistance(a,b).rms-directDistance(a,b))<1e-10);
});
test('validator rejects broken coverage, corners, seams, winding, duplicate shapes and illegal rotations',()=>{
 const master=load(50);
 assert.throws(()=>rotatePattern(master,45),/rotation/);
 const missing=structuredClone(master);missing.pieces.pop();assert.throws(()=>validatePattern(missing),/count/);
 const seam=structuredClone(master);seam.pieces[10].points[4][0]+=1;assert.throws(()=>validatePattern(seam),/area|edge|boundar/);
 const flipped=structuredClone(master);flipped.pieces[0].points.reverse();assert.throws(()=>validatePattern(flipped),/winding/);
 const duplicate=structuredClone(master);duplicate.pieces[1].id=duplicate.pieces[0].id;assert.throws(()=>validatePattern(duplicate),/duplicate/);
});
test('checked-in validation report fingerprints the permanent assets',()=>{
 const report=JSON.parse(readFileSync(new URL('patterns/validation.json',import.meta.url),'utf8'));
 assert.equal(report.reports.length,4);
 for(const entry of report.reports){const bytes=readFileSync(new URL(`patterns/${entry.count}.json`,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert(entry.similarity.minimum>=NEAR_TOLERANCE);}
});
