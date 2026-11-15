// Reusable precision controls. No image, puzzle storage or camera rendering dependencies.
export function angleDelta(previous,next){return ((next-previous+540)%360)-180;}
export function zoomAt(view,factor,anchor,min=1,max=4){
 const zoom=Math.max(min,Math.min(max,view.zoom*factor));
 return {zoom,x:view.x+anchor.x*(view.zoom-zoom),y:view.y+anchor.y*(view.zoom-zoom)};
}
export function visibleCenter(view,width,height){return {x:(width/2-view.x)/view.zoom,y:(height/2-view.y)/view.zoom};}
function boundedStep(value,delta,lo,hi){
 // If rotation/panning left an extent outside the allowed interval, permit gradual
 // recovery, never an instantaneous correction at the start of the next drag.
 return Math.max(Math.min(value,lo),Math.min(Math.max(value,hi),value+delta));
}
export function moveRelative(state,bounds,view,width,height,pixelsPerUnit,dx,dy){
 const left=Math.max(0,-view.x/view.zoom),right=Math.min(width,(width-view.x)/view.zoom);
 const top=Math.max(0,-view.y/view.zoom),bottom=Math.min(height,(height-view.y)/view.zoom);
 let x0=left-bounds.left,x1=right-bounds.right,y0=top-bounds.top,y1=bottom-bounds.bottom;
 // At high zoom the full piece may exceed the window: keep its center visible.
 if(x0>x1){x0=left;x1=right;}if(y0>y1){y0=top;y1=bottom;}
 return {x:boundedStep(state.x,dx/pixelsPerUnit,x0,x1),y:boundedStep(state.y,dy/pixelsPerUnit,y0,y1)};
}
export function attachPrecisionControls({pad,wheel,onStart,onMove,onRotate,onEnd}){
 let active=null;const contacts=new Set();
 function finish(commit=false){
 const session=active;active=null;
 if(session){session.element.classList.remove('operating');if(session.element.hasPointerCapture(session.id))session.element.releasePointerCapture(session.id);onEnd(commit);}
 }
 function bind(element,type){
 element.addEventListener('pointerdown',e=>{
 if(e.button!==0||element.disabled)return;e.preventDefault();contacts.add(e.pointerId);
 if(active||contacts.size>1){finish(false);return;}
 if(!onStart())return;
 const box=element.getBoundingClientRect(),cx=box.left+box.width/2,cy=box.top+box.height/2;
 active={element,type,id:e.pointerId,x:e.clientX,y:e.clientY,cx,cy,angle:Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI};
 // The hub is a dead zone: crossing it must not generate a 180° jump.
 active.radial=Math.hypot(e.clientX-cx,e.clientY-cy)>=box.width*.16;
 element.setPointerCapture(e.pointerId);element.classList.add('operating');
 });
 element.addEventListener('pointermove',e=>{
 if(!active||active.id!==e.pointerId||active.element!==element)return;e.preventDefault();
 if(e.pointerType==='mouse'&&e.buttons===0){finish(false);return;}
 const s=active;
 if(type==='move')onMove(e.clientX-s.x,e.clientY-s.y);
 else{const box=element.getBoundingClientRect(),radial=Math.hypot(e.clientX-s.cx,e.clientY-s.cy)>=box.width*.16,next=Math.atan2(e.clientY-s.cy,e.clientX-s.cx)*180/Math.PI;
 if(radial&&s.radial)onRotate(angleDelta(s.angle,next));s.angle=next;s.radial=radial;}
 s.x=e.clientX;s.y=e.clientY;
 });
 const end=e=>{contacts.delete(e.pointerId);if(active?.id===e.pointerId)finish(e.type==='pointerup');};
 element.addEventListener('pointerup',end);element.addEventListener('pointercancel',end);element.addEventListener('lostpointercapture',end);
 element.addEventListener('contextmenu',e=>e.preventDefault());element.addEventListener('dblclick',e=>e.preventDefault());
 }
 bind(pad,'move');bind(wheel,'rotate');
 const owner=pad.ownerDocument.defaultView;for(const type of ['pointerup','pointercancel'])owner.addEventListener(type,e=>{contacts.delete(e.pointerId);if(active?.id===e.pointerId)finish(type==='pointerup');},true);
 return {cancel(){finish(false);contacts.clear();},setEnabled(enabled){if(!enabled)this.cancel();pad.disabled=wheel.disabled=!enabled;}};
}
