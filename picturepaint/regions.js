/* Pure segmentation shared by the worker and Node verification. */
(function(root){
function segment(data,w,h,threshold=200,gap=1){
 const n=w*h, wall=new Uint8Array(n), labels=new Int32Array(n), queue=new Uint32Array(n);
 for(let i=0;i<n;i++){const a=data[i*4+3]/255;wall[i]=(255-a*(255-(data[i*4]*.2126+data[i*4+1]*.7152+data[i*4+2]*.0722)))<threshold?1:0;}
 // Small dilation seals hairline gaps. Detection never depends on painted colors.
 if(gap){const source=wall.slice();for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(source[y*w+x])for(let dy=-gap;dy<=gap;dy++)for(let dx=-gap;dx<=gap;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)wall[(y+dy)*w+x+dx]=1;}
 const regions=[null];
 for(let start=0;start<n;start++){
  if(wall[start]||labels[start])continue;
  const id=regions.length;let head=0,tail=1;queue[0]=start;labels[start]=id;
  const r={seed:start,x:w,y:h,right:0,bottom:0,edge:false,size:0};
  while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);r.x=Math.min(r.x,x);r.y=Math.min(r.y,y);r.right=Math.max(r.right,x);r.bottom=Math.max(r.bottom,y);r.edge ||= x===0||y===0||x===w-1||y===h-1;
   const add=j=>{if(!wall[j]&&!labels[j]){labels[j]=id;queue[tail++]=j;}};
   // The finite image rectangle encloses every region, including edge-connected ones.
   if(x>0)add(i-1);if(x<w-1)add(i+1);if(y>0)add(i-w);if(y<h-1)add(i+w);
  }r.size=tail;regions.push(r);
 }
 return {labels,regions};
}
if(typeof module!=='undefined')module.exports={segment};else root.segment=segment;
})(globalThis);
