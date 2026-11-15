import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateMosaic,validateMosaic,SIZE} from './mosaic.js';
import {contains} from './geometry.js';
import {signedArea} from './shape-distance.js';
import {mosaicPuzzle} from './image-puzzle.js';
import {validateSession} from './session.js';
import {shuffledState,canSnap} from '../engine.js';
const counts=[50,100,150,200];
for(const count of counts)test(`${count}: 32 seeds, exact partition, balanced areas, safe polygons and deliberate concavity`,()=>{
 let highest=0;
 for(const seed of [...Array(28).keys(),0x12345678,0x80000000,0xfffffffe,0xffffffff]){
 const p=generateMosaic(count,seed),report=validateMosaic(p);highest=Math.max(highest,p.attempt);
 assert.equal(report.count,count);assert.equal(report.area2,String(2*SIZE*SIZE));assert.equal(report.corners,4);
 assert(report.minArea>=.8&&report.maxArea<=1.2);assert(report.minWidth>=.10&&report.minCore>=.23&&report.minAngle>=35&&report.maxAspect<=2.2&&report.maxElongation<=2.2);
 assert(report.concave/count>=.15&&report.concave/count<=.20);
 assert(p.pieces.filter(p=>[4,5,6].includes(p.points.length)).length/count>.65);
 assert.equal(new Set(p.pieces.map(p=>p.id)).size,count);
 // Independent sample ownership supplements the exact edge/perimeter proof.
 for(let k=0;k<300;k++){const point=[(k*3571+173)%999983+.113,(k*7331+439)%999979+.271];assert.equal(p.pieces.filter(p=>contains(point,p.points)).length,1);}
 for(const piece of p.pieces)assert(signedArea(piece.points)>=SIZE*SIZE/count*.8);
 }
 console.log(`${count}: all 32 seeds valid; highest retry index ${highest}`);
});
test('same seed is deterministic; different seeds change the mesh; retries are bounded and failures explicit',()=>{
 assert.deepEqual(generateMosaic(50,72),generateMosaic(50,72));assert.notDeepEqual(generateMosaic(50,72).pieces,generateMosaic(50,73).pieces);
 assert.throws(()=>generateMosaic(51,1),/50, 100, 150 or 200/);assert.throws(()=>generateMosaic(50,-1),/Seed/);assert.throws(()=>generateMosaic(50,1,{maxAttempts:0}),/Retry/);
 let failed=null;for(let seed=0;seed<64;seed++){try{generateMosaic(100,seed,{maxAttempts:1});}catch(error){assert.match(error.message,/after 1 attempts/);failed=seed;break;}}
 assert.notEqual(failed,null,'Exercise an actual failed candidate');assert(generateMosaic(100,failed).attempt>0);
});
test('validator rejects area violations, invalid shapes, duplicate IDs, broken seams and missing regions',()=>{
 const base=generateMosaic(50,7);
 for(const mutate of [p=>p.pieces.pop(),p=>p.pieces[1].id=p.pieces[0].id,p=>p.pieces[0].points.reverse(),p=>p.pieces[0].points[0][0]+=1,p=>p.pieces[0].points.push(p.pieces[0].points[0]),p=>p.seed=-1]){
 const p=structuredClone(base);mutate(p);assert.throws(()=>validateMosaic(p));
 }
 // Valid square partition with deliberately unequal areas must still be rejected.
 // Applying a piecewise affine global x-map preserves exact seams and coverage.
 const p=structuredClone(base);for(const piece of p.pieces)piece.points=piece.points.map(([x,y])=>[Math.round(x<SIZE/2?x*.6:SIZE*.3+(x-SIZE/2)*1.4),y]);
 assert.throws(()=>validateMosaic(p),/area|narrow|angle|thin|segment/);
});
test('saved source/cuts and full game state survive structured storage without geometry regeneration',async()=>{
 const pattern=generateMosaic(50,38),puzzle=mosaicPuzzle(pattern,{url:'blob:original',name:'Source.png'}),game=shuffledState(puzzle.pieces);
 Object.assign(game.states['piece-001'],{location:'board',x:244.123,y:673.18,angle:183.428});Object.assign(game.states['piece-002'],{location:'locked',x:puzzle.pieces[1].cx,y:puzzle.pieces[1].cy,angle:0});
 const record={version:1,id:'session-1',blob:new Blob(['original image bytes']),name:'Source.png',pattern,outlines:false},progress={id:'session-1',game,sound:false};
 const restored=validateSession(...[record,progress].map(value=>structuredClone(value)));assert.deepEqual(restored.progress,progress);assert.deepEqual(restored.record.pattern,pattern);assert.equal(await restored.record.blob.text(),'original image bytes');
 assert(canSnap(puzzle.pieces[1],game.states['piece-002'],1));assert.throws(()=>validateSession(record,{...progress,id:'different'}),/does not match/);
 const movedLock=structuredClone(progress);movedLock.game.states['piece-002'].angle=3;assert.throws(()=>validateSession(record,movedLock),/locked piece/);
 const broken=structuredClone(progress);delete broken.game.states['piece-001'];assert.throws(()=>validateSession(record,broken),/positions/);
});
