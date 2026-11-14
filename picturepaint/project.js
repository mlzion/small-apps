import {validatePalette} from './palette.js';
export const MAX_PIXELS=2048*2048;
export function readFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Unable to read this file.'));r.readAsDataURL(file);});}
export function image(src){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('This image could not be opened.'));i.src=src;});}
export function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export function serialize(paint,settings){return JSON.stringify({format:'PicturePaint',version:1,width:paint.original.width,height:paint.original.height,original:paint.original.toDataURL('image/png'),...settings,fills:[...paint.styles].map(([id,style])=>({seed:paint.regions[id].seed,style}))});}
export function parse(text){const p=JSON.parse(text),color=x=>typeof x==='string'&&/^#[0-9a-f]{6}$/i.test(x);
 if(p.format!=='PicturePaint'||p.version!==1||!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<1||p.height<1||p.width*p.height>MAX_PIXELS||typeof p.original!=='string'||!p.original.startsWith('data:image/png;base64,')||typeof p.outlines!=='boolean'||!Number.isInteger(p.threshold)||p.threshold<80||p.threshold>240||!Number.isInteger(p.gap)||p.gap<0||p.gap>3||!Array.isArray(p.fills)||p.fills.length>p.width*p.height)throw Error('Unsupported or invalid PicturePaint project.');
 for(const f of p.fills)if(!Number.isInteger(f.seed)||f.seed<0||f.seed>=p.width*p.height||!f.style||!['solid','gradient'].includes(f.style.mode)||!color(f.style.color1)||!color(f.style.color2)||!Number.isFinite(f.style.angle)||f.style.angle<0||f.style.angle>360)throw Error('Invalid paint definition.');if(p.palette!==undefined)p.palette=validatePalette(p.palette);return p;
}
