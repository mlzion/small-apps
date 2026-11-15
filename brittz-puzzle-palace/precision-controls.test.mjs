import {test} from 'node:test';
import assert from 'node:assert/strict';
import {angleDelta,zoomAt,visibleCenter,moveRelative} from './precision-controls.js';
test('relative moves follow CSS pixels at every board size and zoom without changing camera',()=>{
 for(const pixels of [320,360,390,842])for(const zoom of [1,1.3,2,4]){
 const view={zoom,x:-100,y:-120},before={...view},state=visibleCenter(view,1000,1000),bounds={left:-20,right:20,top:-25,bottom:25},scale=pixels/1000*zoom;
 const next=moveRelative(state,bounds,view,1000,1000,scale,6,3);
 assert(Math.abs((next.x-state.x)*scale-6)<1e-9);assert(Math.abs((next.y-state.y)*scale-3)<1e-9);assert.deepEqual(view,before);
 }
});
test('zoom anchors selected and visible-center world points exactly, including zoom-out near edges',()=>{
 for(const view of [{zoom:1,x:0,y:0},{zoom:4,x:-1100,y:-500},{zoom:2,x:170,y:-20}])for(const anchor of [{x:50,y:900},{x:800,y:30},visibleCenter(view,1000,1000)])for(const factor of [1.3,1/1.3,100,.001]){
 const next=zoomAt(view,factor,anchor);assert(next.zoom>=1&&next.zoom<=4);
 for(const axis of ['x','y'])assert(Math.abs(view[axis]+anchor[axis]*view.zoom-next[axis]-anchor[axis]*next.zoom)<1e-9);
 }
});
test('rotation deltas unwrap crossings in both directions and retain sub-degree precision',()=>{
 assert.equal(angleDelta(179,-179),2);assert.equal(angleDelta(-179,179),-2);assert(Math.abs(angleDelta(20,20.12)-.12)<1e-10);
 let total=0;const sequence=[170,179,-172,-120,-10,80,170];for(let i=1;i<sequence.length;i++)total+=angleDelta(sequence[i-1],sequence[i]);assert.equal(total,360);
});
test('movement limits prevent losing pieces and recover out-of-view extents without jumps',()=>{
 const b={left:-70,right:70,top:-70,bottom:70},v={zoom:2,x:0,y:0},s={x:80,y:80};
 assert.deepEqual(moveRelative(s,b,v,1000,1000,1,-200,-200),{x:70,y:70});
 const off={x:50,y:50};assert.deepEqual(moveRelative(off,b,v,1000,1000,1,1,1),{x:51,y:51});
 assert.deepEqual(moveRelative(off,b,v,1000,1000,1,-1,-1),off);
});
