// Shared browser/Node content contract. Artwork is a mesh of deliberately authored,
// simple, clockwise (SVG coordinates) polygons. Closing Z is generated, never inferred from images.
const ID=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const COLOR=/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const finite=Number.isFinite;
const equal=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area=ps=>ps.reduce((n,a,i)=>{const b=ps[(i+1)%ps.length];return n+a[0]*b[1]-b[0]*a[1];},0)/2;
const key=(a,b)=>[a.join(','),b.join(',')].sort().join('|');
const onSegment=(a,b,c)=>cross(a,b,c)===0&&c[0]>=Math.min(a[0],b[0])&&c[0]<=Math.max(a[0],b[0])&&c[1]>=Math.min(a[1],b[1])&&c[1]<=Math.max(a[1],b[1]);
function meets(a,b,c,d){return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);}
function inside([x,y],ps){let yes=false;for(let i=0,j=ps.length-1;i<ps.length;j=i++){const a=ps[i],b=ps[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function distance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function require(value,message){if(!value)throw new Error(message);}
function text(value,label){require(typeof value==='string'&&value.trim().length>0&&value.length<=160,`${label}: expected 1–160 characters`);}
function metadata(p,label){require(p&&typeof p==='object',`${label}: expected an object`);require(typeof p.id==='string'&&ID.test(p.id),`${label}: invalid ID (use lowercase words separated by hyphens)`);text(p.title,`${label} title`);require(Number.isInteger(p.version)&&p.version>=1,`${label}: version must be a positive integer`);require(Number.isInteger(p.pieceCount)&&p.pieceCount>=1&&p.pieceCount<=50,`${label}: pieceCount must be between 1 and 50`);}
export function relativePath(path){return typeof path==='string'&&/^[a-zA-Z0-9_./-]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').some(p=>p==='..'||p==='');}
export function validateCatalog(catalog){
 require(catalog?.schemaVersion===1,'Catalog: unsupported schemaVersion');require(Array.isArray(catalog.puzzles)&&catalog.puzzles.length>0,'Catalog: puzzles must be a nonempty array');const ids=new Set();
 for(const entry of catalog.puzzles){metadata(entry,'Catalog puzzle');require(!ids.has(entry.id),`Catalog: duplicate ID ${entry.id}`);ids.add(entry.id);for(const field of ['data','thumbnail'])require(relativePath(entry[field]),`${entry.id}: ${field} must be a relative local path`);}
 return catalog;
}
export function preparePuzzle(raw){
 metadata(raw,'Puzzle');require(raw.schemaVersion===1,`${raw.id}: unsupported schemaVersion`);
 const {width:W,height:H}=raw;require([W,H].every(n=>finite(n)&&n>=100&&n<=4096),`${raw.id}: dimensions must be finite and between 100 and 4096`);
 require(Array.isArray(raw.pieces)&&raw.pieces.length===raw.pieceCount,`${raw.id}: pieces must match pieceCount (1–50)`);
 require(raw.trayRows===undefined||[1,2,3].includes(raw.trayRows),`${raw.id}: trayRows must be 1, 2, or 3`);
 for(const field of ['subtitle','emptyMessage','completionTitle','completionMessage'])if(raw[field]!==undefined)text(raw[field],`${raw.id} ${field}`);
 const ids=new Set(),edges=new Map(),all=[];let total=0;
 const pieces=raw.pieces.map(p=>{
 const fail=message=>`${raw.id} / ${p?.id||'piece'}: ${message}`;
 require(p&&typeof p.id==='string'&&ID.test(p.id)&&!ids.has(p.id),fail('invalid or duplicate piece ID'));ids.add(p.id);text(p.name,fail('name'));require(COLOR.test(p.color),fail('color must be a hex color'));
 require(Array.isArray(p.points)&&p.points.length>=3&&p.points.length<=64,fail('a closed polygon needs 3–64 vertices'));
 require(p.points.every(a=>Array.isArray(a)&&a.length===2&&a.every(finite)&&a[0]>=0&&a[0]<=W&&a[1]>=0&&a[1]<=H),fail('coordinates must be finite and inside the artwork'));
 require(new Set(p.points.map(a=>a.join(','))).size===p.points.length,fail('repeated vertex; do not repeat the closing point'));
 const ps=p.points,n=ps.length,A=area(ps);require(A>0,fail('polygon must have positive area and clockwise SVG winding'));total+=A;
 const xs=ps.map(a=>a[0]),ys=ps.map(a=>a[1]),bounds={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
 const cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2;
 require(p.correct&&p.correct.x===cx&&p.correct.y===cy&&p.correct.angle===0,fail('correct must be the artwork-space bounding-box center with angle 0'));
 require(Math.min(bounds.width,bounds.height)>=Math.min(W,H)/8,fail('piece bounds are too thin for use'));
 for(let i=0;i<n;i++){
 const a=ps[i],b=ps[(i+1)%n];require(Math.hypot(a[0]-b[0],a[1]-b[1])>=Math.min(W,H)/16,fail('edge too short for use'));
 for(let j=i+1;j<n;j++)if(j!==i+1&&!(i===0&&j===n-1))require(!meets(a,b,ps[j],ps[(j+1)%n]),fail('self-intersection or disconnected/self-touching boundary'));
 // Collinear continuation is harmless; backtracking creates overlapping edges.
 const c=ps[(i+2)%n];require(!(cross(a,b,c)===0&&((a[0]-b[0])*(c[0]-b[0])+(a[1]-b[1])*(c[1]-b[1])>0)),fail('boundary backtracks'));
 const k=key(a,b),e={a,b,id:p.id,key:k};if(!edges.has(k))edges.set(k,[]);edges.get(k).push(e);all.push(e);
 }
 let radius=0;const step=Math.min(bounds.width,bounds.height)/30;
 for(let x=bounds.x+step/2;x<bounds.x+bounds.width;x+=step)for(let y=bounds.y+step/2;y<bounds.y+bounds.height;y+=step)if(inside([x,y],ps))radius=Math.max(radius,Math.min(...ps.map((a,i)=>distance([x,y],a,ps[(i+1)%n]))));
 require(radius>=Math.min(W,H)/24,fail('piece has no usable interior (thin sliver)'));
 require(p.details===undefined||Array.isArray(p.details)&&p.details.length<=20,fail('details must be an array of up to 20 circles'));
 for(const d of p.details||[])require(d&&d.type==='circle'&&[d.cx,d.cy,d.r].every(finite)&&d.r>0&&COLOR.test(d.fill)&&inside([d.cx,d.cy],ps)&&ps.every((a,i)=>distance([d.cx,d.cy],a,ps[(i+1)%n])+1e-8>=d.r),fail('decoration must be a hex-colored circle contained inside this piece'));
 return {...p,bounds,cx,cy,path:`M${ps.map(a=>a.join(',')).join('L')}Z`,details:p.details||[]};
 });
 let perimeter=0;
 for(const list of edges.values()){
 const {a,b,id}=list[0];require(list.length<=2,`${raw.id}: more than two faces share a seam near ${id}`);
 if(list.length===2)require(equal(a,list[1].b)&&equal(b,list[1].a),`${raw.id}: overlapping faces or inconsistent seam winding near ${id}`);
 else {require(a[0]===b[0]&&(a[0]===0||a[0]===W)||a[1]===b[1]&&(a[1]===0||a[1]===H),`${raw.id}: unmatched interior seam near ${id}; shared boundaries must use identical vertices`);perimeter+=Math.hypot(a[0]-b[0],a[1]-b[1]);}
 }
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
 const a=all[i],b=all[j];if(a.key===b.key||equal(a.a,b.a)||equal(a.a,b.b)||equal(a.b,b.a)||equal(a.b,b.b))continue;
 require(!meets(a.a,a.b,b.a,b.b),`${raw.id}: crossing/overlapping region boundaries near ${a.id} and ${b.id}`);
 }
 const epsilon=W*H*1e-10;
 require(Math.abs(total-W*H)<=epsilon,`${raw.id}: total piece area does not cover the artwork rectangle (gap or overlap)`);
 require(Math.abs(perimeter-2*(W+H))<=1e-7,`${raw.id}: exterior boundary has a gap or overlap`);
 return {...raw,trayRows:raw.trayRows||1,pieces};
}
export function matchEntry(entry,puzzle){for(const field of ['id','version','title','pieceCount'])require(entry[field]===puzzle[field],`${entry.id}: catalog ${field} does not match puzzle data`);return puzzle;}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function detailMarkup(p){return p.details.map(d=>`<circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" fill="${d.fill}"/>`).join('');}
export function artworkSVG(puzzle){return `<svg xmlns="http://www.w3.org/2000/svg" width="${puzzle.width}" height="${puzzle.height}" viewBox="0 0 ${puzzle.width} ${puzzle.height}"><title>${escape(puzzle.title)}</title>${puzzle.pieces.map(p=>`<g><path d="${p.path}" fill="${p.color}" stroke="#153844" stroke-width="5" stroke-linejoin="round"/>${detailMarkup(p)}</g>`).join('')}</svg>`;}
