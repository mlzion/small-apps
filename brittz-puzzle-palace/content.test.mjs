import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {preparePuzzle,validateCatalog,matchEntry,artworkSVG,detailMarkup} from './content.js';
import {loadProgress,saveProgress,progressKey,progressSummary,isComplete,playerName,rememberName} from './progress.js';
import {shuffledState} from './engine.js';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const turtle=read('./puzzles/sea-turtle/puzzle.json'),gem=read('./puzzles/tropical-gem/puzzle.json');
const clone=structuredClone;
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
function mutated(fn,pattern){const data=clone(gem);fn(data);assert.throws(()=>preparePuzzle(data),pattern);}
test('all catalog entries and the upload template validate',()=>{
 const catalog=validateCatalog(read('./catalog.json'));
 for(const entry of catalog.puzzles)matchEntry(entry,preparePuzzle(read(entry.data)));
 preparePuzzle(read('./examples/puzzle.template.json'));
});
test('turtle geometry, fills, details, centers and paths are identical to v0.1',()=>{
 const p=preparePuzzle(turtle);
 const original=p.pieces.map(({id,name,color,points,cx,cy,path,details})=>({id,name,color,points,cx,cy,path,detail:detailMarkup({details})}));
 assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'),'4c37f02b2a2f720556f143a1e0db323df8600ef16d945a26299eab8e01ef891e');
 assert.equal(p.pieces.length,23);
});
test('invalid metadata and external/escaping catalog paths have actionable errors',()=>{
 for(const field of ['id','title','version','pieceCount'])mutated(p=>delete p[field],new RegExp(field==='title'?'title':field==='id'?'ID':field));
 for(const count of [0,51])mutated(p=>p.pieceCount=count,/between 1 and 50/);
 for(const dimension of [0,-1,Infinity,NaN])mutated(p=>p.width=dimension,/dimensions/);
 for(const data of ['../other.json','https://example.com/x','/absolute.json','a//b.json']){const c=read('./catalog.json');c.puzzles[0].data=data;assert.throws(()=>validateCatalog(c),/relative local path/);}
 const catalog=read('./catalog.json');catalog.puzzles.push(catalog.puzzles[0]);assert.throws(()=>validateCatalog(catalog),/duplicate ID/);
 assert.throws(()=>matchEntry({...catalog.puzzles[0],pieceCount:22},preparePuzzle(turtle)),/pieceCount/);
});
test('reject gaps, overlaps, self intersections, invalid points and decorative escapes',()=>{
 mutated(p=>{p.pieces.pop();p.pieceCount--;},/unmatched interior seam/);
 mutated(p=>{p.pieces.push({...clone(p.pieces[0]),id:'overlap'});p.pieceCount++;},/overlapping faces/);
 mutated(p=>p.pieces[0].points[0]=[-10,0],/coordinates/);
 mutated(p=>p.pieces[0].points[0]=[NaN,0],/coordinates/);
 mutated(p=>p.pieces[0].points.push(p.pieces[0].points[0]),/repeated vertex/);
 mutated(p=>p.pieces[0].points=[[0,0],[300,200],[300,0],[0,200]],/positive area|self-intersection/);
 mutated(p=>p.pieces[0].correct.angle=45,/correct/);
 mutated(p=>p.pieces[0].details=[{type:'image',href:'https://example.com'}],/decoration/);
 mutated(p=>p.pieces[0].details=[null],/decoration/);
 mutated(p=>p.pieces[0].details=[{type:'circle',cx:0,cy:0,r:20,fill:'#fff'}],/decoration/);
});
test('one piece and fifty exact-fitting pieces are supported',()=>{
 const p={schemaVersion:1,id:'one',version:1,title:'One Piece',width:600,height:400,pieceCount:1,pieces:[{id:'whole',name:'Whole',color:'#fff',points:[[0,0],[600,0],[600,400],[0,400]],correct:{x:300,y:200,angle:0}}]};
 preparePuzzle(p);
 p.id='fifty';p.width=1000;p.height=500;p.pieceCount=50;p.pieces=[];
 for(let row=0;row<5;row++)for(let col=0;col<10;col++){const x=col*100,y=row*100;p.pieces.push({id:`piece-${row}-${col}`,name:'Glass',color:'#abc',points:[[x,y],[x+100,y],[x+100,y+100],[x,y+100]],correct:{x:x+50,y:y+50,angle:0}});}
 assert.equal(preparePuzzle(p).pieces.length,50);
});
test('legacy turtle saves migrate without discarding order, rotation, position, or locks',()=>{
 const p=preparePuzzle(turtle),game=shuffledState(p.pieces,()=>.31);
 Object.assign(game.states['shell-center'],{location:'board',x:330,y:240,angle:75});
 Object.assign(game.states.head,{location:'locked',x:450,y:120,angle:0});
 const legacy=JSON.stringify({game,sound:false});store.set('brittz-sea-turtle-v1',legacy);
 const loaded=loadProgress(p);assert.deepEqual(loaded.game.order,game.order);assert.deepEqual(loaded.game.states['shell-center'],game.states['shell-center']);assert.equal(loaded.game.states.head.location,'locked');assert.equal(loaded.sound,false);
 saveProgress(p,loaded.game,loaded.sound);assert(store.has(progressKey(p)));assert.equal(store.get('brittz-sea-turtle-v1'),legacy);
});
test('independent progress, selected-puzzle restart, and completion summary',()=>{
 const t=preparePuzzle(turtle),g=preparePuzzle(gem),a=loadProgress(t),b=loadProgress(g);
 Object.assign(b.game.states.sunrise,{location:'board',angle:60,x:300,y:200});saveProgress(g,b.game,false);
 const before=clone(a.game);saveProgress(t,shuffledState(t.pieces),true);
 assert.deepEqual(loadProgress(g).game,b.game);assert(!isComplete(g,b.game));assert.match(progressSummary(g),/In progress/);
 for(const piece of g.pieces)Object.assign(b.game.states[piece.id],{location:'locked',x:piece.cx,y:piece.cy,angle:0});
 saveProgress(g,b.game,true);assert(isComplete(g,loadProgress(g).game));assert.equal(progressSummary(g),'Completed');assert.notDeepEqual(loadProgress(t).game,before);
});
test('corrupt saves recover safely, storage fallback retains progress and names',()=>{
 const p=preparePuzzle({...gem,id:'corrupt'});store.set(progressKey(p),JSON.stringify({game:{order:['missing'],states:{}}}));assert.equal(loadProgress(p).game.order.length,4);
 globalThis.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('quota');}};
 const loaded=loadProgress(p);Object.assign(loaded.game.states.reef,{location:'board',x:300,y:200});loaded.sound=false;saveProgress(p,loaded.game,false);assert.deepEqual(loadProgress(p),loaded);
 rememberName('Britt');assert.equal(playerName(),'Britt');
});
test('artwork exports use only prepared shared geometry and escaped text',()=>{
 const p=preparePuzzle({...gem,title:'Glass <& "Gem"'}),svg=artworkSVG(p);
 assert(svg.includes('Glass &lt;&amp; &quot;Gem&quot;'));assert.equal((svg.match(/<path/g)||[]).length,4);
 for(const piece of p.pieces)assert(svg.includes(`d="${piece.path}"`));
});
