import assert from 'node:assert/strict';
import {pieces,turtle} from './puzzle.js';
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area=p=>p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a[0]*b[1]-b[0]*a[1];},0)/2;
function intersects(a,b,c,d){return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;}
function inside([x,y],ps){let yes=false;for(let i=0,j=ps.length-1;i<ps.length;j=i++){const a=ps[i],b=ps[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
assert.equal(pieces.length,23);assert.equal(new Set(pieces.map(p=>p.id)).size,pieces.length);
const edges=new Map();let total=0;
for(const p of pieces){
 assert(p.points.length>=3);assert(area(p.points)>1000,`${p.id}: usable positive area`);total+=area(p.points);
 assert(Math.min(p.bounds.width,p.bounds.height)>=60,`${p.id}: usable bounds`);
 let radius=0;
 for(let x=p.bounds.x+2;x<p.bounds.x+p.bounds.width;x+=4)for(let y=p.bounds.y+2;y<p.bounds.y+p.bounds.height;y+=4){if(inside([x,y],p.points))radius=Math.max(radius,Math.min(...p.points.map((a,i)=>segmentDistance([x,y],a,p.points[(i+1)%p.points.length]))));}
 assert(radius>=20,`${p.id}: must contain a usable 40-unit-wide interior`);
 p.points.forEach((a,i)=>{const b=p.points[(i+1)%p.points.length];assert(a[0]>=0&&a[0]<=turtle.width&&a[1]>=0&&a[1]<=turtle.height);
 assert(Math.hypot(a[0]-b[0],a[1]-b[1])>=30,`${p.id}: short edge`);
 const key=[a.join(','),b.join(',')].sort().join('|');if(!edges.has(key))edges.set(key,[]);edges.get(key).push({a,b,id:p.id});
 for(let j=i+1;j<p.points.length;j++)assert(!intersects(a,b,p.points[j],p.points[(j+1)%p.points.length]),`${p.id}: self intersection`);
 });
}
assert.equal(total,turtle.width*turtle.height,'Exact rectangular area');
let boundary=0;
for(const list of edges.values()){
 assert(list.length<=2,'Nonmanifold edge');const {a,b}=list[0];
 if(list.length===2){assert.deepEqual(a,list[1].b,'Shared seams must have reverse winding');assert.deepEqual(b,list[1].a);}
 else {assert((a[0]===b[0]&&(a[0]===0||a[0]===720))||(a[1]===b[1]&&(a[1]===0||a[1]===480)),'Unmatched interior seam');boundary+=Math.hypot(a[0]-b[0],a[1]-b[1]);}
}
assert.equal(boundary,2*(turtle.width+turtle.height));
// Cross-face edge intersections would imply overlap despite matching area.
const all=[...edges.values()].map(x=>x[0]);for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)assert(!intersects(all[i].a,all[i].b,all[j].a,all[j].b),'Crossing faces');
// Dense independent coverage sampling catches holes and nesting as well as broken seams.
for(let y=.37;y<480;y+=3.17)for(let x=.41;x<720;x+=3.13)assert.equal(pieces.filter(p=>inside([x,y],p.points)).length,1,`Coverage at ${x},${y}`);
console.log('PASS: 23 simple connected polygons; exact shared seams, rectangular coverage, no overlaps, usable area/edges/interiors.');
