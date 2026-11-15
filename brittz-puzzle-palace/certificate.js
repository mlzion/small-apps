import {artworkSVG} from './content.js';
export function cleanName(name){return String(name).replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80);}
function fittedText(ctx,text,x,y,width,size,family='Georgia, serif'){
 ctx.font=`${size}px ${family}`;while(ctx.measureText(text).width>width&&size>16){size-=1;ctx.font=`${size}px ${family}`;}ctx.fillText(text,x,y,width);
}
export async function certificateJPG(puzzle,name){
 name=cleanName(name);if(!name)throw new Error('Enter your name for the certificate.');
 const canvas=document.createElement('canvas');canvas.width=1600;
 const imageWidth=puzzle.kind==='image'?1400:Math.min(1400,960*puzzle.width/puzzle.height),imageHeight=imageWidth*puzzle.height/puzzle.width;
 canvas.height=Math.ceil(imageHeight+490);
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Your browser could not create the certificate.');
 ctx.fillStyle='#f8f5ed';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.strokeStyle='#97b9ac';ctx.lineWidth=3;ctx.strokeRect(35,35,1530,canvas.height-70);
 ctx.textAlign='center';ctx.fillStyle='#183e49';
 fittedText(ctx,'Brittz Puzzle Palace',800,125,1400,66);
 ctx.font='22px sans-serif';ctx.fillStyle='#4b776e';ctx.fillText('CERTIFICATE OF COMPLETION',800,178);
 const ownsURL=puzzle.kind!=='image';
 const url=ownsURL?URL.createObjectURL(new Blob([artworkSVG(puzzle)],{type:'image/svg+xml'})):puzzle.imageURL;
 try{
 const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('The puzzle artwork could not be rendered. Try exporting again.'));image.src=url;});
 // JPG has no alpha; match the puzzle's white board for transparent PNGs.
 if(puzzle.kind==='image'){ctx.fillStyle='#fff';ctx.fillRect((1600-imageWidth)/2,220,imageWidth,imageHeight);}
 ctx.drawImage(image,(1600-imageWidth)/2,220,imageWidth,imageHeight);
 }finally{if(ownsURL)URL.revokeObjectURL(url);}
 const y=220+imageHeight;ctx.fillStyle='#183e49';fittedText(ctx,puzzle.title,800,y+70,1380,48);
 ctx.font='27px sans-serif';ctx.fillStyle='#4b776e';ctx.fillText(`${puzzle.pieceCount} pieces · Every piece in its place`,800,y+118);
 ctx.fillStyle='#183e49';fittedText(ctx,`Completed by ${name}`,800,y+195,1380,42);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('JPG export failed. Please try again.')),'image/jpeg',.95));
}
