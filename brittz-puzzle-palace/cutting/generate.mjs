// Offline authoring only. Runtime never imports this generator or creates cuts.
import {writeFile} from 'node:fs/promises';
import {validatePattern} from './geometry.js';
import {signedArea,contour,shapeDistance,compareShapes,NEAR_TOLERANCE} from './shape-distance.js';
const SIZE=1000000;
function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function halfplane(poly,nx,ny,c){
 const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=a[0]*nx+a[1]*ny-c,db=b[0]*nx+b[1]*ny-c;
 if(da<=0)out.push(a);if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
 return out;
}
const edgeKey=(a,b)=>[a.join(','),b.join(',')].sort().join('|');
function cells(count,random){
 const rows=Math.round(Math.sqrt(count)),sites=[];let left=count;
 for(let row=0;row<rows;row++){const cols=Math.round(left/(rows-row));left-=cols;for(let col=0;col<cols;col++)sites.push([(col+.5+(random()-.5)*.72)*SIZE/cols,(row+.5+(random()-.5)*.72)*SIZE/rows]);}
 let polygons=sites.map((a,i)=>{let p=[[0,0],[SIZE,0],[SIZE,SIZE],[0,SIZE]];sites.forEach((b,j)=>{if(i!==j)p=halfplane(p,b[0]-a[0],b[1]-a[1],(b[0]**2+b[1]**2-a[0]**2-a[1]**2)/2);});return p.map(v=>v.map(Math.round));});
 // Collapse short Voronoi ridges globally, including all incident faces.
 const min=SIZE/Math.sqrt(count)*.14;
 for(let pass=0;pass<500;pass++){
 let short=null;for(const p of polygons)for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if(Math.hypot(a[0]-b[0],a[1]-b[1])<min){short=[a,b];break;}}if(!short)break;
 const [a,b]=short,exterior=p=>p[0]===0||p[0]===SIZE||p[1]===0||p[1]===SIZE;
 const corner=p=>(p[0]===0||p[0]===SIZE)&&(p[1]===0||p[1]===SIZE);
 const target=corner(a)?a:corner(b)?b:exterior(a)&&!exterior(b)?a:exterior(b)&&!exterior(a)?b:a.map((v,i)=>Math.round((v+b[i])/2));
 polygons=polygons.map(p=>p.map(v=>v.join(',')===a.join(',')||v.join(',')===b.join(',')?target:v).filter((v,i,arr)=>v.join(',')!==arr[(i+arr.length-1)%arr.length].join(',')));
 }
 return polygons;
}
function mesh(polygons){
 const seams=new Map();polygons.forEach((p,index)=>p.forEach((a,i)=>{const b=p[(i+1)%p.length],key=edgeKey(a,b);if(!seams.has(key))seams.set(key,{a,b,uses:[]});seams.get(key).uses.push(index);}));
 return [...seams.values()];
}
function profile(edge,random){
 const {a,b}=edge,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
 if(edge.uses.length===1)return [a,b];
 // Wide angular shoulders, asymmetric peaks, cranked bends and shallow notches.
 // Endpoint shoulders keep junction angles and the piece cores substantial.
 const mode=Math.floor(random()*5),sign=random()<.5?-1:1,depth=.16+random()*.17;
 const patterns=[[[.22,.03],[.40,1],[.64,.65],[.82,-.1]],[[.18,-.1],[.38,-.7],[.60,1],[.82,.1]],[[.20,.15],[.34,1],[.65,-.8],[.83,-.1]],[[.20,-.1],[.44,-1],[.70,-.3],[.84,.1]],[[.22,.1],[.40,.85],[.70,.9],[.85,-.1]]];
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const inTriangle=(p,c)=>{const values=[cross(a,b,p),cross(b,c,p),cross(c,a,p)];return values.every(v=>v>=0)||values.every(v=>v<=0);};
 return [a,...patterns[mode].map(([t,h])=>{
 let amount=depth*h*sign,p;
 for(let k=0;k<80;k++){p=[a[0]+dx*t-dy*amount,a[1]+dy*t+dx*amount];if(edge.centers.some(c=>inTriangle(p,c)))break;amount*=.8;}
 amount*=.92;
 return [Math.round(a[0]+dx*t-dy*amount),Math.round(a[1]+dy*t+dx*amount)];
 }),b];
}
function assemble(polygons,seams){
 const map=new Map(seams.map(e=>[edgeKey(e.a,e.b),e]));
 return polygons.map((p,i)=>({id:`piece-${String(i+1).padStart(3,'0')}`,points:p.flatMap((a,j)=>{const b=p[(j+1)%p.length],e=map.get(edgeKey(a,b)),forward=e.a[0]===a[0]&&e.a[1]===a[1],line=forward?e.line:[...e.line].reverse();return line.slice(0,-1);})}));
}
function usable(p,count){
 const ps=p.points,nominal=SIZE/Math.sqrt(count),area=signedArea(ps);if(area<nominal**2*.3||area>nominal**2*2.4)return false;
 const xs=ps.map(v=>v[0]),ys=ps.map(v=>v[1]),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);if(Math.max(w/h,h/w)>2.6)return false;
 for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length],c=ps[(i+ps.length-1)%ps.length],ax=b[0]-a[0],ay=b[1]-a[1],bx=c[0]-a[0],by=c[1]-a[1],length=Math.hypot(ax,ay);if(length<nominal*.012||(ax*bx+ay*by)/(length*Math.hypot(bx,by))>Math.cos(25*Math.PI/180))return false;}
 return true;
}
for(const count of (process.argv[2]?[Number(process.argv[2])]:[50,100,150,200])){
 const seed=310000+count,random=rng(seed),polygons=cells(count,random),seams=mesh(polygons);
 seams.forEach(e=>{e.centers=e.uses.map(i=>polygons[i].reduce((s,p)=>[s[0]+p[0]/polygons[i].length,s[1]+p[1]/polygons[i].length],[0,0]));e.line=profile(e,random);});
 let pieces=assemble(polygons,seams);
 for(let attempt=0;attempt<1000;attempt++){
 const bad=pieces.findIndex(p=>!usable(p,count));if(bad<0)break;
 for(const e of seams)if(e.uses.includes(bad)&&e.uses.length===2)e.line=attempt>500?[e.a,e.b]:profile(e,random);
 pieces=assemble(polygons,seams);
 }
 if(pieces.some(p=>!usable(p,count)))throw Error(`Could not produce usable ${count} master`);
 let cs=pieces.map(p=>contour(p.points));
 // Resample only the local neighborhood when repairing an ambiguous shape.
 const distances=new Float64Array(count*count);
 const refresh=changed=>{for(let i=0;i<count;i++)for(let j=0;j<i;j++)if(!changed||changed.has(i)||changed.has(j))distances[i*count+j]=shapeDistance(cs[i],cs[j]).lowerBound;};
 refresh();
 const score=(i,j)=>distances[i*count+j];
 let repairs=0;
 for(;repairs<14000;repairs++){
 let worst=NEAR_TOLERANCE+.002,pair=null;
 for(let i=0;i<count;i++)for(let j=0;j<i;j++){const d=score(i,j);if(d<worst){worst=d;pair=[i,j];}}
 if(!pair)break;
 const index=pair[repairs%2],changed=new Set(),previous=[];
 const options=seams.filter(e=>e.uses.includes(index)&&e.uses.length===2);
 const changeAll=repairs%17===0,chosen=options[Math.floor(random()*options.length)];
 for(const e of options)if(changeAll||e===chosen){previous.push([e,e.line]);e.line=profile(e,random);e.uses.forEach(i=>changed.add(i));}
 const candidate=assemble(polygons,seams);
 if([...changed].some(i=>!usable(candidate[i],count))){for(const [e,line]of previous)e.line=line;continue;}
 const next=cs.slice();for(const i of changed)next[i]=contour(candidate[i].points);
 const updates=[];let before=0,after=0;
 for(let i=0;i<count;i++)for(let j=0;j<i;j++)if(changed.has(i)||changed.has(j)){
 const old=distances[i*count+j],d=shapeDistance(next[i],next[j]).lowerBound;
 before+=Math.max(0,NEAR_TOLERANCE+.002-old)**2;after+=Math.max(0,NEAR_TOLERANCE+.002-d)**2;updates.push([i*count+j,d]);
 }
 if(after<before){pieces=candidate;cs=next;for(const [i,d]of updates)distances[i]=d;}
 else for(const [e,line]of previous)e.line=line;
 if(repairs%500===0)console.log(count,'repair',repairs,'minimum',worst.toFixed(4));
 }
 const report=compareShapes(pieces);
 console.log(count,'final',report,'repairs',repairs);
 const data={schemaVersion:1,id:`angular-${count}-v1`,version:1,size:SIZE,pieceCount:count,seed,pieces};
 validatePattern(data,{uniqueness:true});
 await writeFile(new URL(`patterns/${count}.json`,import.meta.url),JSON.stringify(data)+'\n');
}
