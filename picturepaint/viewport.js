export class Viewport {
 constructor(stage,surface,paint,onchange){this.stage=stage;this.surface=surface;this.paint=paint;this.onchange=onchange;this.points=new Map();this.scale=1;this.x=0;this.y=0;this.hand=false;
 stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;stage.setPointerCapture(e.pointerId);this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.points.size===1){this.start={x:e.clientX,y:e.clientY};this.gesture=this.hand;}else this.gesture=true;});
 stage.addEventListener('pointermove',e=>{const old=this.points.get(e.pointerId);if(!old)return;const now={x:e.clientX,y:e.clientY};if(Math.hypot(now.x-this.start.x,now.y-this.start.y)>7)this.gesture=true;
 if(this.points.size===2){const other=[...this.points.entries()].find(([id])=>id!==e.pointerId)[1],before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(now.x-other.x,now.y-other.y);const box=stage.getBoundingClientRect();this.zoom(after/Math.max(1,before),(old.x+other.x)/2-box.left,(old.y+other.y)/2-box.top);this.x+=(now.x-old.x)/2;this.y+=(now.y-old.y)/2;}
 else if(this.hand){this.x+=now.x-old.x;this.y+=now.y-old.y;}this.points.set(e.pointerId,now);this.update();});
 const end=e=>{if(!this.points.has(e.pointerId))return;this.points.delete(e.pointerId);if(e.type==='pointerup'&&!this.gesture&&this.points.size===0){const b=stage.getBoundingClientRect();paint((e.clientX-b.left-this.x)/this.scale,(e.clientY-b.top-this.y)/this.scale);}if(!this.points.size)this.gesture=false;};
 stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);stage.addEventListener('lostpointercapture',end);
 stage.addEventListener('wheel',e=>{e.preventDefault();const b=stage.getBoundingClientRect();this.zoom(Math.exp(-e.deltaY*.001),e.clientX-b.left,e.clientY-b.top);},{passive:false});
 }
 update(){this.surface.style.transform=`translate(${this.x}px,${this.y}px) scale(${this.scale})`;this.onchange(this.scale);}
 zoom(factor,cx=this.stage.clientWidth/2,cy=this.stage.clientHeight/2){const next=Math.max(this.fitScale*.25,Math.min(12,this.scale*factor)),ratio=next/this.scale;this.x=cx-(cx-this.x)*ratio;this.y=cy-(cy-this.y)*ratio;this.scale=next;this.update();}
 fit(w,h){this.fitScale=Math.min((this.stage.clientWidth-32)/w,(this.stage.clientHeight-32)/h);this.scale=this.fitScale;this.x=(this.stage.clientWidth-w*this.scale)/2;this.y=(this.stage.clientHeight-h*this.scale)/2;this.update();}
}
