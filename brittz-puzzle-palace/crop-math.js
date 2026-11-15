// Crop coordinates are relative to a fixed unit square centered at (0,0).
// Source pixels are never rewritten; these same transforms drive preview/export.
export const initialCrop=()=>({turn:0,zoom:1,x:0,y:0});
export function cropGeometry(width,height,state){
 const scale=state.zoom/Math.min(width,height),odd=state.turn%2;
 return {scale,width:(odd?height:width)*scale,height:(odd?width:height)*scale};
}
export function constrainCrop(width,height,state){
 const g=cropGeometry(width,height,state),limitX=Math.max(0,(g.width-1)/2),limitY=Math.max(0,(g.height-1)/2);
 return {...state,x:Math.max(-limitX,Math.min(limitX,state.x)),y:Math.max(-limitY,Math.min(limitY,state.y))};
}
export function moveCrop(width,height,state,dx,dy){return constrainCrop(width,height,{...state,x:state.x+dx,y:state.y+dy});}
export function zoomCrop(width,height,state,zoom){
 zoom=Math.max(1,Math.min(5,zoom));const ratio=zoom/state.zoom;
 return constrainCrop(width,height,{...state,zoom,x:state.x*ratio,y:state.y*ratio});
}
export function rotateCrop(width,height,state,direction){
 return constrainCrop(width,height,{...state,turn:(state.turn+direction+4)%4,x:direction>0?-state.y:state.y,y:direction>0?state.x:-state.x});
}
export function cropFilename(value){
 const base=String(value).trim().replace(/\.[^.]*$/,'').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g,'-').replace(/^\.+/,'').trim().slice(0,120);
 return `${base||'cropped-photo'}.jpg`;
}
export function paintPhoto(ctx,image,state,side,cx,cy){
 const g=cropGeometry(image.naturalWidth,image.naturalHeight,state);
 ctx.save();ctx.translate(cx+state.x*side,cy+state.y*side);ctx.rotate(state.turn*Math.PI/2);ctx.scale(side*g.scale,side*g.scale);ctx.drawImage(image,-image.naturalWidth/2,-image.naturalHeight/2);ctx.restore();
}
