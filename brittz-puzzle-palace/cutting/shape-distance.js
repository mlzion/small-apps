// Geometry-only comparison: translation/scale, cyclic starting point, arbitrary
// planar rotation and reflection are all removed. No artwork enters this metric.
export const SAMPLE_COUNT=128;
export const NEAR_TOLERANCE=0.065;
export function signedArea(points){return points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2;}
export function contour(points,n=SAMPLE_COUNT){
 if(signedArea(points)<0)points=[...points].reverse();
 const area=Math.abs(signedArea(points)),lengths=points.map((a,i)=>Math.hypot(a[0]-points[(i+1)%points.length][0],a[1]-points[(i+1)%points.length][1]));
 const perimeter=lengths.reduce((a,b)=>a+b,0),scale=Math.sqrt(area),samples=[];let edge=0,start=0;
 for(let i=0;i<n;i++){const distance=i*perimeter/n;while(edge<points.length-1&&start+lengths[edge]<distance){start+=lengths[edge++];}const t=(distance-start)/lengths[edge],a=points[edge],b=points[(edge+1)%points.length];samples.push([(a[0]+(b[0]-a[0])*t)/scale,(a[1]+(b[1]-a[1])*t)/scale]);}
 const mean=samples.reduce((s,p)=>[s[0]+p[0]/n,s[1]+p[1]/n],[0,0]);
 const xy=new Float64Array(n*2);let norm=0;
 samples.forEach((p,i)=>{xy[i*2]=p[0]-mean[0];xy[i*2+1]=p[1]-mean[1];norm+=xy[i*2]**2+xy[i*2+1]**2;});
 const real=new Float64Array(n),imag=new Float64Array(n);for(let i=0;i<n;i++){real[i]=xy[2*i];imag[i]=xy[2*i+1];}fft(real,imag);
 return {xy,n,norm,real,imag,phaseError:perimeter/(2*n*scale)};
}
// Radix-2 FFT evaluates exactly the same cyclic Procrustes correlations as a
// direct O(n²) comparison. Tests compare it with that independent implementation.
function fft(real,imag,inverse=false){
 const n=real.length;
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}}
 for(let length=2;length<=n;length<<=1){const theta=(inverse?2:-2)*Math.PI/length,wr=Math.cos(theta),wi=Math.sin(theta);
 for(let start=0;start<n;start+=length){let ur=1,ui=0;for(let j=0;j<length/2;j++){
 const a=start+j,b=a+length/2,tr=real[b]*ur-imag[b]*ui,ti=real[b]*ui+imag[b]*ur;
 real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;const next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next;
 }}}
 if(inverse)for(let i=0;i<n;i++){real[i]/=n;imag[i]/=n;}
}
export function shapeDistance(a,b){
 const n=a.n;if(n!==b.n)throw Error('Contour sample counts differ');let best=-Infinity;
 for(let reflected=0;reflected<2;reflected++){
 const real=new Float64Array(n),imag=new Float64Array(n);
 for(let i=0;i<n;i++){const ar=a.real[i],ai=-a.imag[i],br=b.real[i],bi=b.imag[i]*(reflected?-1:1);real[i]=ar*br-ai*bi;imag[i]=ar*bi+ai*br;}
 fft(real,imag,true);for(let i=0;i<n;i++)best=Math.max(best,Math.hypot(real[i],imag[i]));
 }
 const rms=Math.sqrt(Math.max(0,(a.norm+b.norm-2*best)/n));
 return {rms,lowerBound:Math.max(0,rms-Math.max(a.phaseError,b.phaseError))};
}
export function compareShapes(pieces){
 const contours=pieces.map(p=>contour(p.points));let minimum=Infinity,pair=null,rms=Infinity;
 for(let i=0;i<pieces.length;i++)for(let j=0;j<i;j++){
 const d=shapeDistance(contours[i],contours[j]);if(d.lowerBound<minimum){minimum=d.lowerBound;rms=d.rms;pair=[pieces[j].id,pieces[i].id];}
 }
 return {minimum,rms,pair,tolerance:NEAR_TOLERANCE,samples:SAMPLE_COUNT};
}
