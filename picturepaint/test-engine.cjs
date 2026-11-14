const assert=require('node:assert/strict');const {segment}=require('./regions.js');
const w=100,h=80;const data=new Uint8ClampedArray(w*h*4).fill(255);
function line(x1,y1,x2,y2,gray=0){for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++){let i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=gray;}}
line(10,10,90,10,140);line(10,70,90,70,140);line(10,10,10,70,140);line(90,10,90,70,140);line(50,10,50,70,140);
let r=segment(data,w,h,200,0);assert.equal(r.regions.length,4);assert.notEqual(r.labels[30*w+30],r.labels[30*w+70]);assert.equal(r.regions[r.labels[30*w+30]].edge,false);assert.equal(r.regions[r.labels[0]].edge,true);
line(10,40,10,41,255);r=segment(data,w,h,200,0);assert.equal(r.regions[r.labels[30*w+30]].edge,true);r=segment(data,w,h,200,1);assert.equal(r.regions[r.labels[30*w+30]].edge,false);
// A narrow three-pixel region survives with gap sealing off.
line(53,10,53,70);r=segment(data,w,h,200,0);assert.ok(r.labels[30*w+51]);assert.notEqual(r.labels[30*w+51],r.labels[30*w+60]);
// A blank image is one finite region, bounded by the image rectangle itself.
const blank=segment(new Uint8ClampedArray(w*h*4).fill(255),w,h,200,0);
assert.equal(blank.regions.length,2);assert.equal(blank.labels.length,w*h);
assert.equal(blank.regions[1].size,w*h);assert.equal(blank.regions[1].edge,true);
assert.deepEqual([blank.regions[1].x,blank.regions[1].y,blank.regions[1].right,blank.regions[1].bottom],[0,0,w-1,h-1]);
assert.ok(blank.labels.every(id=>id===1));
console.log('PASS: neighboring regions, antialiased boundaries, narrow regions, finite edge-connected regions, adjustable gap sealing');
