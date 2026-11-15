import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialCrop,cropGeometry,moveCrop,zoomCrop,rotateCrop,cropFilename} from './crop-math.js';
import {fullscreenAPI,fullscreenAdvice} from './fullscreen.js';
function covered(w,h,s){const g=cropGeometry(w,h,s),a=-s.turn*Math.PI/2;for(const x of [-.5,0,.5])for(const y of [-.5,0,.5]){const dx=x-s.x,dy=y-s.y,px=(dx*Math.cos(a)-dy*Math.sin(a))/g.scale,py=(dx*Math.sin(a)+dy*Math.cos(a))/g.scale;assert(Math.abs(px)<=w/2+1e-7);assert(Math.abs(py)<=h/2+1e-7);}}
test('all crop corners remain in portrait, landscape and square sources through drag, zoom and turns',()=>{
 for(const [w,h]of [[720,1280],[1280,720],[1024,1024],[70,3000],[3000,70]]){
 let s=initialCrop();covered(w,h,s);
 for(let k=0;k<150;k++){s=zoomCrop(w,h,s,1+(k*13%401)/100);s=moveCrop(w,h,s,(k%3-1)*3,(k%5-2)*4);s=rotateCrop(w,h,s,k%2?1:-1);assert([0,1,2,3].includes(s.turn));assert(s.zoom>=1&&s.zoom<=5);covered(w,h,s);}
 }
});
test('relative drags, centered zoom and four quarter turns retain framing without mutating the original state',()=>{
 const original=Object.freeze({...initialCrop(),zoom:2,x:.1,y:.2});let s=moveCrop(2000,1000,original,.05,-.03);assert(Math.abs(s.x-.15)<1e-10);assert(Math.abs(s.y-.17)<1e-10);
 const z=zoomCrop(2000,1000,s,3);assert(Math.abs(z.x/z.zoom-s.x/s.zoom)<1e-10);
 for(let k=0;k<4;k++)s=rotateCrop(2000,1000,s,1);assert(Math.abs(s.x-.15)<1e-10);assert(Math.abs(s.y-.17)<1e-10);assert.equal(s.turn,0);assert.deepEqual(original,{turn:0,zoom:2,x:.1,y:.2});
 assert.deepEqual(initialCrop(),{turn:0,zoom:1,x:0,y:0});
});
test('download filenames are JPG basenames with no path/control characters',()=>{
 assert.equal(cropFilename(' Holiday-cropped.png '),'Holiday-cropped.jpg');assert.equal(cropFilename(''),'cropped-photo.jpg');assert(!/[\\/:*?"<>|\u0000-\u001f]/.test(cropFilename('../bad:name.png')));assert.equal(cropFilename('a'.repeat(300)+'.jpg').length,124);
});
test('fullscreen uses page-capable standard/prefixed APIs and never video-only or disabled APIs',async()=>{
 const calls=[],root={requestFullscreen(){calls.push('standard enter');doc.fullscreenElement=root;}},doc={documentElement:root,fullscreenEnabled:true,exitFullscreen(){calls.push('standard exit');doc.fullscreenElement=null;}};
 let api=fullscreenAPI(doc);await api.enter();assert(api.active());await api.exit();assert(!api.active());assert.deepEqual(calls,['standard enter','standard exit']);
 assert.equal(fullscreenAPI({...doc,fullscreenEnabled:false}),null);
 const ipad={documentElement:{webkitRequestFullscreen(){calls.push('ipad enter');ipad.webkitFullscreenElement=this;}},webkitFullscreenEnabled:true,webkitExitFullscreen(){this.webkitFullscreenElement=null;}};api=fullscreenAPI(ipad);await api.enter();assert(api.active());await api.exit();assert(!api.active());
 assert.equal(fullscreenAPI({documentElement:{webkitEnterFullscreen(){throw Error('video-only must not be called');}}}),null);
 assert.match(fullscreenAdvice({userAgent:'Mozilla iPhone',maxTouchPoints:5}),/Share.*Home Screen/);assert.match(fullscreenAdvice({userAgent:'Macintosh',maxTouchPoints:5}),/Safari/);assert.match(fullscreenAdvice({userAgent:'Android',maxTouchPoints:5}),/keep playing/);
});
