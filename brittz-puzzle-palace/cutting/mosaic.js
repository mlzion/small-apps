// Seeded, capacity-balanced polygon mosaics. Artwork never enters this module.
import {COUNTS,validatePattern} from './geometry.js';
import {signedArea} from './shape-distance.js';
export const SIZE=1000000;
export function randomStream(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const key=p=>p.join(',');
const edgeKey=(a,b)=>[key(a),key(b)].sort().join('|');
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
function clip(poly,nx,ny,c){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=a[0]*nx+a[1]*ny-c,db=b[0]*nx+b[1]*ny-c;if(da<=0)out.push(a);if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}return out;}
function centroid(ps){let area=0,x=0,y=0;for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length],v=a[0]*b[1]-b[0]*a[1];area+=v;x+=(a[0]+b[0])*v;y+=(a[1]+b[1])*v;}return [x/(3*area),y/(3*area)];}
function balancedCells(count,random){
 // Best-candidate (blue-noise) sites avoid horizontal/vertical grid bands.
 const sites=[];
 for(let i=0;i<count;i++){
 let chosen=null,best=-1;
 for(let k=0;k<16;k++){const candidate=[random()*SIZE,random()*SIZE],clearance=sites.length?Math.min(...sites.map(p=>(p[0]-candidate[0])**2+(p[1]-candidate[1])**2)):Infinity;if(clearance>best){best=clearance;chosen=candidate;}}
 sites.push(chosen);
 }
 const weights=sites.map(()=>0),average=SIZE*SIZE/count;let polygons;
 for(let iteration=0;iteration<90;iteration++){
 polygons=sites.map((a,i)=>{let p=[[0,0],[SIZE,0],[SIZE,SIZE],[0,SIZE]];for(let j=0;j<count&&p.length;j++)if(i!==j){const b=sites[j];p=clip(p,b[0]-a[0],b[1]-a[1],(b[0]**2+b[1]**2-a[0]**2-a[1]**2+weights[i]-weights[j])/2);}return p;});
 if(polygons.some(p=>p.length<3))throw Error('Empty capacity cell');
 const areas=polygons.map(signedArea);
 if(iteration>=25&&areas.every(a=>a>average*.94&&a<average*1.06))break;
 polygons.forEach((p,i)=>{weights[i]+=(average-areas[i])*.45;const c=centroid(p);sites[i]=sites[i].map((n,j)=>n+(c[j]-n)*.35);});
 }
 return polygons.map(p=>p.map(v=>v.map(Math.round)));
}
function collapse(polygons,count){
 const min=SIZE/Math.sqrt(count)*.12,exterior=p=>p[0]===0||p[0]===SIZE||p[1]===0||p[1]===SIZE,corner=p=>(p[0]===0||p[0]===SIZE)&&(p[1]===0||p[1]===SIZE);
 for(let pass=0;pass<count*4;pass++){
 let short=null;for(const p of polygons){for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if(Math.hypot(a[0]-b[0],a[1]-b[1])<min){short=[a,b];break;}}if(short)break;}if(!short)return polygons;
 const [a,b]=short,target=corner(a)?a:corner(b)?b:exterior(a)?a:exterior(b)?b:a.map((v,i)=>Math.round((v+b[i])/2));
 polygons=polygons.map(p=>p.map(v=>key(v)===key(a)||key(v)===key(b)?target:v).filter((v,i,arr)=>key(v)!==key(arr[(i+arr.length-1)%arr.length])));
 }throw Error('Short-edge repair limit reached');
}
function seams(polygons){const edges=new Map();polygons.forEach((p,index)=>p.forEach((a,i)=>{const b=p[(i+1)%p.length],k=edgeKey(a,b);if(!edges.has(k))edges.set(k,{a,b,uses:[]});edges.get(k).uses.push(index);}));return [...edges.values()];}
function notches(polygons,count,random){
 const candidates=seams(polygons).filter(e=>e.uses.length===2).map(e=>({...e,sort:random()})).sort((a,b)=>a.sort-b.sort),used=new Set(),nominal=SIZE/Math.sqrt(count);let made=0;
 for(const edge of candidates){if(made>=Math.round(count*.17))break;if(edge.uses.some(i=>used.has(i)||polygons[i].length>6))continue;
 const [a,b]=[edge.a,edge.b],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<nominal*.55)continue;
 const t=.35+random()*.3,depth=nominal*(.12+random()*.06),sign=random()<.5?-1:1,point=[Math.round(a[0]+dx*t-dy/length*depth*sign),Math.round(a[1]+dy*t+dx/length*depth*sign)];
 const replacements=edge.uses.map(index=>polygons[index].flatMap((p,i)=>edgeKey(p,polygons[index][(i+1)%polygons[index].length])===edgeKey(a,b)?[p,point]:[p]));
 if(replacements.some(p=>p.some(v=>v.some(n=>n<0||n>SIZE))||signedArea(p)<SIZE*SIZE/count*.82||signedArea(p)>SIZE*SIZE/count*1.18))continue;
 edge.uses.forEach((index,i)=>{polygons[index]=replacements[i];used.add(index);});made++;
 }
 return polygons;
}
export function validateMosaic(pattern){
 if(!Number.isInteger(pattern?.seed)||pattern.seed<0||pattern.seed>0xffffffff||!Number.isInteger(pattern.attempt)||pattern.attempt<0||pattern.attempt>=24||pattern.id!==`mosaic-${pattern.pieceCount}-${pattern.seed}`)throw Error('Invalid mosaic seed/version metadata');
 const report=validatePattern(pattern),average=SIZE*SIZE/pattern.pieceCount;let concave=0,maxArea=0,minWidth=Infinity,maxElongation=0;
 for(const piece of pattern.pieces){const ps=piece.points,ratio=signedArea(ps)/average;maxArea=Math.max(maxArea,ratio);
 if(ratio<.8||ratio>1.2)throw Error(`${piece.id}: area ${ratio.toFixed(4)} outside 80–120%`);
 if(ps.length>7||ps.length<3)throw Error(`${piece.id}: requires 3–7 sides`);
 // The minimum vertex-to-nonincident-edge clearance also detects narrow necks
 // and arms; a large core disk alone would not exclude these.
 for(let i=0;i<ps.length;i++)for(let j=0;j<ps.length;j++){
 if(j===i||(j+1)%ps.length===i)continue;
 const p=ps[i],a=ps[j],b=ps[(j+1)%ps.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
 minWidth=Math.min(minWidth,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)/Math.sqrt(average));
 }

 // Minimum-area oriented bounds catch diagonal needles that axis-aligned
 // bounding boxes could disguise. At most seven vertices keeps this cheap.
 let bestBox=Infinity,elongation=Infinity;
 for(let i=0;i<ps.length;i++)for(let j=0;j<i;j++){
 const dx=ps[i][0]-ps[j][0],dy=ps[i][1]-ps[j][1],length=Math.hypot(dx,dy),u=ps.map(p=>(p[0]*dx+p[1]*dy)/length),v=ps.map(p=>(-p[0]*dy+p[1]*dx)/length),w=Math.max(...u)-Math.min(...u),h=Math.max(...v)-Math.min(...v);
 if(w*h<bestBox){bestBox=w*h;elongation=Math.max(w/h,h/w);}
 }
 maxElongation=Math.max(maxElongation,elongation);
 if(elongation>2.2)throw Error(`${piece.id}: excessive oriented length-to-width ratio`);
 if(ps.some((b,i)=>cross(ps[(i+ps.length-1)%ps.length],b,ps[(i+1)%ps.length])<0))concave++;
 }
 if(minWidth<.10)throw Error('Excessively narrow neck or fragile arm');
 if(report.minAngle<35||report.minEdge<.045||report.minCore<.23||report.maxAspect>2.2)throw Error('Fragile or excessively narrow mosaic piece');
 if(concave<Math.ceil(pattern.pieceCount*.15)||concave>Math.floor(pattern.pieceCount*.20))throw Error(`Concavity target not met: ${concave}`);
 return {...report,maxArea,concave,minWidth,maxElongation};
}
export function generateMosaic(count,seed,{maxAttempts=12}={}){
 if(!COUNTS.includes(count))throw Error('Choose 50, 100, 150 or 200 pieces');
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Seed must be an unsigned 32-bit integer');
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>24)throw Error('Retry limit must be 1–24');
 let last;
 for(let attempt=0;attempt<maxAttempts;attempt++)try{
 const random=randomStream((seed+Math.imul(attempt,0x9e3779b9))>>>0),polygons=notches(collapse(balancedCells(count,random),count),count,random);
 const pattern={schemaVersion:1,id:`mosaic-${count}-${seed}`,version:1,size:SIZE,pieceCount:count,seed,attempt,pieces:polygons.map((points,i)=>({id:`piece-${String(i+1).padStart(3,'0')}`,points}))};
 validateMosaic(pattern);return pattern;
 }catch(error){last=error;}
 throw Error(`Could not generate a valid ${count}-piece mosaic after ${maxAttempts} attempts: ${last?.message}`);
}
