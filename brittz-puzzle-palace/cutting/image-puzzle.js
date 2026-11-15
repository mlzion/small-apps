import {COUNTS,rotatePattern,validatePattern} from './geometry.js';
const cached=new Map();
export async function loadMaster(count){
 if(!COUNTS.includes(count))throw Error('Select a 50, 100, 150 or 200 piece master.');
 if(!cached.has(count))cached.set(count,(async()=>{const response=await fetch(new URL(`patterns/${count}.json`,import.meta.url));if(!response.ok)throw Error(`Master ${count} could not load (HTTP ${response.status}).`);const data=await response.json();validatePattern(data);return data;})());
 try{return await cached.get(count);}catch(error){cached.delete(count);throw error;}
}
export async function openSquareImage(file,decoded=null){
 if(!(file instanceof Blob)||file.size>24*1024*1024)throw Error('Choose a JPG or PNG up to 24 MB.');
 const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
 const png=[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n),jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!png&&!jpg)throw Error('The source must be a JPG or PNG image.');
 const url=decoded?.url||URL.createObjectURL(file),image=decoded?.image||new Image();
 try{if(!decoded){image.src=url;await image.decode();}if(image.naturalWidth!==image.naturalHeight)throw Error('Choose a square image; the cutter never crops or stretches artwork.');if(image.naturalWidth<32||image.naturalWidth>8192)throw Error('Choose a square image between 32 and 8192 pixels wide.');
 return {blob:file,url,width:image.naturalWidth,height:image.naturalHeight,name:file.name||'Test picture',revoke:()=>URL.revokeObjectURL(url)};
 }catch(error){URL.revokeObjectURL(url);throw error;}
}
export function imagePuzzle(master,source,degrees=0,{outlines=true}={}){
 const pattern=rotatePattern(master,degrees),size=1000,factor=size/master.size;
 const pieces=pattern.pieces.map(p=>{
 const points=p.points.map(v=>v.map(n=>n*factor)),xs=points.map(v=>v[0]),ys=points.map(v=>v[1]);
 const bounds={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
 return {id:p.id,name:`Image piece ${p.id.slice(6)}`,points,bounds,cx:bounds.x+bounds.width/2,cy:bounds.y+bounds.height/2,path:`M${points.map(p=>p.join(',')).join('L')}Z`,details:[]};
 });
 return {kind:'image',ephemeral:true,id:`lab-${master.id}-${degrees}`,version:1,title:source.name,width:size,height:size,pieceCount:pieces.length,trayRows:Math.min(3,Math.ceil(pieces.length/75)),pieces,imageURL:source.url,outlines,masterId:master.id,patternRotation:degrees,subtitle:`IMAGE CUTTING LAB · ${degrees}° MASTER`,emptyMessage:'Your picture starts here',completionTitle:'Every detail, back in place.',completionMessage:'The original image is complete.'};
}

// The procedural runtime never rotates the mesh or transforms source pixels.
export function mosaicPuzzle(pattern,source,options={}){
 const puzzle=imagePuzzle(pattern,source,0,options);
 return {...puzzle,mosaic:true,pattern,subtitle:'GEOMETRIC MOSAIC · IMAGE LAB',patternRotation:undefined};
}
