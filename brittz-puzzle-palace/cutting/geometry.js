// Master geometry uses integer lattice coordinates. Edge equality and area are
// exact; numerical tolerances are used only for usability/shape measurements.
import {compareShapes,NEAR_TOLERANCE} from './shape-distance.js';
export const COUNTS=[50,100,150,200];
const eq=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const key=(a,b)=>[a.join(','),b.join(',')].sort().join('|');
const on=(a,b,c)=>cross(a,b,c)===0&&c[0]>=Math.min(a[0],b[0])&&c[0]<=Math.max(a[0],b[0])&&c[1]>=Math.min(a[1],b[1])&&c[1]<=Math.max(a[1],b[1]);
function intersects(a,b,c,d){return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
export function contains([x,y],ps){let yes=false;for(let i=0,j=ps.length-1;i<ps.length;j=i++){const a=ps[i],b=ps[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function distance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
const demand=(condition,message)=>{if(!condition)throw Error(message);};
export function rotatePattern(pattern,degrees){
 demand([0,90,180,270].includes(degrees),'Master rotation must be 0, 90, 180 or 270 degrees');
 const turn=([x,y])=>degrees===0?[x,y]:degrees===90?[pattern.size-y,x]:degrees===180?[pattern.size-x,pattern.size-y]:[y,pattern.size-x];
 return {...pattern,pieces:pattern.pieces.map(p=>({...p,points:p.points.map(turn)}))};
}
export function validatePattern(p,{uniqueness=false}={}){
 demand(p?.schemaVersion===1&&p.version===1&&typeof p.id==='string','Unsupported master metadata');
 demand(p.size===1000000&&COUNTS.includes(p.pieceCount),'Invalid master size or piece count');
 demand(Array.isArray(p.pieces)&&p.pieces.length===p.pieceCount,'Master piece count mismatch');
 const S=p.size,nominal=S/Math.sqrt(p.pieceCount),ids=new Set(),edges=new Map(),all=[],corners=[[0,0],[S,0],[S,S],[0,S]],owners=new Set();
 let area2=0n,minArea=Infinity,minAngle=180,minEdge=Infinity,minCore=Infinity,maxAspect=0;
 const graph=new Map();
 for(const piece of p.pieces){
 const label=`${p.id}/${piece.id}`;demand(typeof piece.id==='string'&&!ids.has(piece.id),`${label}: duplicate/invalid ID`);ids.add(piece.id);graph.set(piece.id,new Set());
 const ps=piece.points;demand(Array.isArray(ps)&&ps.length>=3&&ps.length<=100,`${label}: invalid polygon`);
 demand(ps.every(v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isInteger(n)&&n>=0&&n<=S)),`${label}: coordinates must be integer lattice positions inside the square`);
 demand(new Set(ps.map(v=>v.join(','))).size===ps.length,`${label}: repeated vertex`);
 let exact=0n;ps.forEach((a,i)=>{const b=ps[(i+1)%ps.length];exact+=BigInt(a[0])*BigInt(b[1])-BigInt(b[0])*BigInt(a[1]);});
 demand(exact>0n,`${label}: non-positive winding/area`);area2+=exact;
 const area=Number(exact)/2;minArea=Math.min(minArea,area/(nominal**2));demand(area>=nominal**2*.30&&area<=nominal**2*2.4,`${label}: unusable piece area`);
 const xs=ps.map(v=>v[0]),ys=ps.map(v=>v[1]),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,h=Math.max(...ys)-y0,aspect=Math.max(w/h,h/w);maxAspect=Math.max(maxAspect,aspect);demand(aspect<=2.6,`${label}: narrow piece bounds`);
 const cornerCount=corners.filter(c=>ps.some(v=>eq(v,c))).length;demand(cornerCount<=1,`${label}: a piece owns multiple corners`);if(cornerCount)owners.add(piece.id);
 for(let i=0;i<ps.length;i++){
 const a=ps[i],b=ps[(i+1)%ps.length],c=ps[(i+ps.length-1)%ps.length],length=Math.hypot(a[0]-b[0],a[1]-b[1]);minEdge=Math.min(minEdge,length/nominal);demand(length>=nominal*.012,`${label}: tiny boundary segment`);
 const ax=b[0]-a[0],ay=b[1]-a[1],bx=c[0]-a[0],by=c[1]-a[1],angle=Math.acos(Math.max(-1,Math.min(1,(ax*bx+ay*by)/Math.hypot(ax,ay)/Math.hypot(bx,by))))*180/Math.PI;
 minAngle=Math.min(minAngle,angle);demand(angle>=25,`${label}: fragile peak/notch angle ${angle.toFixed(2)}`);
 const k=key(a,b),edge={a,b,key:k,id:piece.id,x0:Math.min(a[0],b[0]),x1:Math.max(a[0],b[0]),y0:Math.min(a[1],b[1]),y1:Math.max(a[1],b[1])};if(!edges.has(k))edges.set(k,[]);edges.get(k).push(edge);all.push(edge);
 }
 // A substantial disk must fit inside every piece. No raster artwork is used.
 let radius=0;const step=Math.min(w,h)/24;
 for(let x=x0+step/2;x<x0+w;x+=step)for(let y=y0+step/2;y<y0+h;y+=step)if(contains([x,y],ps))radius=Math.max(radius,Math.min(...ps.map((a,i)=>distance([x,y],a,ps[(i+1)%ps.length]))));
 minCore=Math.min(minCore,radius/nominal);demand(radius>=nominal*.16,`${label}: thin piece interior`);
 }
 demand(area2===2n*BigInt(S)*BigInt(S),'Exact total area does not equal the square');
 demand(owners.size===4,'Exactly four distinct corner pieces are required');
 const exterior=[[],[],[],[]];
 for(const list of edges.values()){
 demand(list.length<=2,'Non-manifold shared edge');const {a,b,id}=list[0];
 if(list.length===2){demand(eq(a,list[1].b)&&eq(b,list[1].a),`Non-complementary seam near ${id}`);graph.get(id).add(list[1].id);graph.get(list[1].id).add(id);}
 else{const side=a[1]===0&&b[1]===0?0:a[0]===S&&b[0]===S?1:a[1]===S&&b[1]===S?2:a[0]===0&&b[0]===0?3:-1;demand(side>=0,`Unmatched internal edge near ${id}`);const axis=side%2?1:0;exterior[side].push([Math.min(a[axis],b[axis]),Math.max(a[axis],b[axis])]);}
 }
 for(const intervals of exterior){intervals.sort((a,b)=>a[0]-b[0]);let end=0;for(const [lo,hi]of intervals){demand(lo===end,'Gap or overlap on square perimeter');end=hi;}demand(end===S,'Incomplete straight exterior');}
 for(let i=0;i<all.length;i++)for(let j=0;j<i;j++){
 const a=all[i],b=all[j];if(a.key===b.key||a.x1<b.x0||b.x1<a.x0||a.y1<b.y0||b.y1<a.y0)continue;
 const shared=eq(a.a,b.a)||eq(a.a,b.b)||eq(a.b,b.a)||eq(a.b,b.b);
 if(shared){const nonA=eq(a.a,b.a)||eq(a.a,b.b)?a.b:a.a,nonB=eq(b.a,a.a)||eq(b.a,a.b)?b.b:b.a;demand(!(on(a.a,a.b,nonB)||on(b.a,b.b,nonA)),`Partly overlapping edges near ${a.id}`);continue;}
 demand(!intersects(a.a,a.b,b.a,b.b),`Crossing/self-touching boundaries near ${a.id}/${b.id}`);
 }
 const seen=new Set(),todo=[p.pieces[0].id];while(todo.length){const id=todo.pop();if(seen.has(id))continue;seen.add(id);todo.push(...graph.get(id));}demand(seen.size===p.pieceCount,'Partition adjacency is disconnected');
 const similarity=uniqueness?compareShapes(p.pieces):null;if(similarity)demand(similarity.minimum>=NEAR_TOLERANCE,`Near-duplicate shapes ${similarity.pair}: ${similarity.minimum.toFixed(5)}`);
 return {count:p.pieceCount,corners:owners.size,area2:area2.toString(),minArea,minAngle,minEdge,minCore,maxAspect,similarity};
}
