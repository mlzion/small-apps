export const config = {positionPixels: 20, maxPositionUnits: 28, rotationDegrees: 9, minZoom:1, maxZoom:4};
export const angleDistance = angle => Math.abs(((angle % 360)+540)%360-180);
export function canSnap(piece,state,scale) {
 return Math.hypot(state.x-piece.cx,state.y-piece.cy)<=Math.min(config.maxPositionUnits,config.positionPixels/scale) && angleDistance(state.angle)<=config.rotationDegrees;
}
export function shuffledState(pieces,random=Math.random) {
 const order=pieces.map(p=>p.id);
 for(let i=order.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [order[i],order[j]]=[order[j],order[i]]; }
 return {order,states:Object.fromEntries(pieces.map(p=>[p.id,{location:'tray',x:p.cx,y:p.cy,angle:Math.floor(random()*12)*30}]))};
}
export function rotatedBounds(piece,angle) {
 const r=angle*Math.PI/180, c=Math.cos(r),s=Math.sin(r);
 const points=piece.points.map(([x,y])=>[(x-piece.cx)*c-(y-piece.cy)*s,(x-piece.cx)*s+(y-piece.cy)*c]);
 return {left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};
}
export function clampPiece(piece,state,width,height) {
 const b=rotatedBounds(piece,state.angle);
 state.x=Math.max(-b.left,Math.min(width-b.right,state.x)); state.y=Math.max(-b.top,Math.min(height-b.bottom,state.y));
}
