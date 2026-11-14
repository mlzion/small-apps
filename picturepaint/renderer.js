export function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
export function gradientEnds(box,angle){const a=angle*Math.PI/180,dx=Math.cos(a),dy=Math.sin(a),extent=(Math.abs(dx)*box.width+Math.abs(dy)*box.height)/2;return [box.width/2-dx*extent,box.height/2-dy*extent,box.width/2+dx*extent,box.height/2+dy*extent];}
export class Painting {
 constructor(original,labels,regions){this.original=original;this.labels=labels;this.regions=regions;this.layer=canvas(original.width,original.height);this.styles=new Map();this.undo=[];this.redo=[];}
 drawRegion(id,style){const r=this.regions[id],w=r.right-r.x+1,h=r.bottom-r.y+1,c=canvas(w,h),ctx=c.getContext('2d'),mask=ctx.createImageData(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(this.labels[(r.y+y)*this.layer.width+r.x+x]===id)mask.data[(y*w+x)*4+3]=255;
 ctx.putImageData(mask,0,0);ctx.globalCompositeOperation='source-in';let fill=style?.color1||'#ffffff';
 if(style?.mode==='gradient'){fill=ctx.createLinearGradient(...gradientEnds({width:w,height:h},style.angle));fill.addColorStop(0,style.color1);fill.addColorStop(1,style.color2);}ctx.fillStyle=fill;ctx.fillRect(0,0,w,h);this.layer.getContext('2d').drawImage(c,r.x,r.y);
 if(style)this.styles.set(id,style);else this.styles.delete(id);
 }
 fill(id,style){this.undo.push({id,before:this.styles.get(id),after:{...style}});if(this.undo.length>200)this.undo.shift();this.redo=[];this.drawRegion(id,style);}
 history(back){const from=back?this.undo:this.redo,to=back?this.redo:this.undo,change=from.pop();if(!change)return;to.push(change);this.drawRegion(change.id,back?change.before:change.after);}
 composite(outlines){const c=canvas(this.layer.width,this.layer.height),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(this.layer,0,0);if(outlines){ctx.globalCompositeOperation='multiply';ctx.drawImage(this.original,0,0);}return c;}
}
