import {initialCrop,constrainCrop,moveCrop,zoomCrop,rotateCrop,cropFilename,paintPhoto} from './crop-math.js';
export function attachCropper({onUseFile}){
 const $=id=>document.getElementById(id),view=$('photo-cropper'),frame=$('crop-frame'),canvas=$('crop-canvas'),ctx=canvas.getContext('2d');
 let image=null,imageURL=null,state=initialCrop(),side=1,contact=null,revision=0,loadSerial=0,prepared=null,busy=false;
 const downloads=new Set();
 function status(message){$('crop-status').textContent=message;}
 function invalidate(){revision++;prepared=null;$('crop-start').hidden=true;$('crop-download').hidden=true;$('crop-download').removeAttribute('href');}
 function draw(){
 if(view.hidden)return;const width=frame.clientWidth,height=frame.clientHeight;if(!width||!height)return;
 const ratio=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#08151b';ctx.fillRect(0,0,width,height);
 side=Math.min(width,height)*.9;$('crop-square').style.width=$('crop-square').style.height=`${side}px`;
 if(image){ctx.fillStyle='#fff';ctx.fillRect(width/2-side/2,height/2-side/2,side,side);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';paintPhoto(ctx,image,state,side,width/2,height/2);}
 $('crop-zoom').value=state.zoom;$('crop-zoom-value').textContent=`${Math.round(state.zoom*100)}%`;
 }
 function edit(next){if(!image||busy)return;state=constrainCrop(image.naturalWidth,image.naturalHeight,next);invalidate();status('Framing changed. Save this crop before starting a puzzle.');draw();}
 function show(){view.hidden=false;$('gallery-screen').hidden=true;$('game-screen').hidden=true;document.documentElement.dataset.cropping='true';draw();window.scrollTo(0,0);$('crop-title').focus({preventScroll:true});}
 function hide(){contact=null;view.hidden=true;delete document.documentElement.dataset.cropping;$('gallery-screen').hidden=false;$('game-screen').hidden=true;window.scrollTo(0,0);$('gallery-title').focus({preventScroll:true});}
 function leave(keepDocument=false){hide();if(!keepDocument&&history.state?.photoCropper)history.back();else if(location.hash==='#crop-photo')history.replaceState(null,'',location.pathname+location.search);}
 $('open-crop').onclick=()=>{history.pushState({photoCropper:true},'','#crop-photo');show();};
 $('close-crop').onclick=()=>leave();
 window.addEventListener('popstate',()=>{if(location.hash==='#crop-photo')show();else if(!view.hidden)hide();});
 if(location.hash==='#crop-photo')show();
 $('crop-file').addEventListener('change',async event=>{
 const file=event.target.files?.[0];if(!file)return;
 const serial=++loadSerial;invalidate();contact=null;$('crop-controls').disabled=true;$('crop-file').disabled=true;status('Opening photo…');
 let nextURL;
 try{
 if(file.size>32*1024*1024||file.size===0)throw Error('Choose a photo up to 32 MB.');
 nextURL=URL.createObjectURL(file);const next=new Image();await new Promise((resolve,reject)=>{next.onload=resolve;next.onerror=()=>reject(Error('This photo could not be opened. Choose a JPG, PNG or another image supported by this browser.'));next.src=nextURL;});
 if(serial!==loadSerial){URL.revokeObjectURL(nextURL);return;}
 if(!next.naturalWidth||!next.naturalHeight||next.naturalWidth*next.naturalHeight>64000000)throw Error('Choose a photo up to 64 megapixels.');
 if(imageURL)URL.revokeObjectURL(imageURL);imageURL=nextURL;nextURL=null;image=next;state=initialCrop();
 const base=file.name.replace(/\.[^.]*$/,'')||'photo';$('crop-name').value=cropFilename(`${base}-cropped.jpg`);$('crop-source').textContent=`${file.name||'Photo'} · ${image.naturalWidth} × ${image.naturalHeight}`;frame.setAttribute('aria-disabled','false');
 status('Drag the photo, adjust zoom or turn it. Only the bright square will be saved.');draw();
 }catch(error){if(serial===loadSerial)status(`${error.message}${image?' The previous photo is still shown.':''}`);}
 finally{if(nextURL)URL.revokeObjectURL(nextURL);if(serial===loadSerial){$('crop-controls').disabled=!image;$('crop-file').disabled=false;}}
 });
 frame.addEventListener('pointerdown',event=>{if(!image||busy||contact||event.button!==0)return;event.preventDefault();frame.setPointerCapture(event.pointerId);contact={id:event.pointerId,x:event.clientX,y:event.clientY};});
 frame.addEventListener('pointermove',event=>{if(!contact||contact.id!==event.pointerId)return;event.preventDefault();const dx=(event.clientX-contact.x)/side,dy=(event.clientY-contact.y)/side;contact.x=event.clientX;contact.y=event.clientY;edit(moveCrop(image.naturalWidth,image.naturalHeight,state,dx,dy));});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])frame.addEventListener(type,event=>{if(contact?.id===event.pointerId)contact=null;});
 window.addEventListener('blur',()=>{contact=null;});
 frame.addEventListener('keydown',event=>{const directions={ArrowLeft:[-.02,0],ArrowRight:[.02,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]};if(!image||!directions[event.key])return;event.preventDefault();const [x,y]=directions[event.key],step=event.shiftKey?5:1;edit(moveCrop(image.naturalWidth,image.naturalHeight,state,x*step,y*step));});
 $('crop-zoom').oninput=()=>{if(image)edit(zoomCrop(image.naturalWidth,image.naturalHeight,state,Number($('crop-zoom').value)));};
 $('crop-left').onclick=()=>{if(image)edit(rotateCrop(image.naturalWidth,image.naturalHeight,state,-1));};
 $('crop-right').onclick=()=>{if(image)edit(rotateCrop(image.naturalWidth,image.naturalHeight,state,1));};
 $('crop-reset').onclick=()=>edit(initialCrop());
 $('crop-name').oninput=()=>{invalidate();status('Save the crop with this filename before starting a puzzle.');};
 $('crop-save').onclick=async()=>{
 if(!image||busy)return;busy=true;contact=null;const current=revision;$('crop-controls').disabled=true;$('crop-file').disabled=true;status('Preparing the square JPG…');
 try{
 const output=document.createElement('canvas');output.width=output.height=1024;const context=output.getContext('2d');if(!context)throw Error('Your browser could not create the JPG.');
 context.fillStyle='#fff';context.fillRect(0,0,1024,1024);context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';paintPhoto(context,image,state,1024,512,512);
 const blob=await new Promise((resolve,reject)=>output.toBlob(value=>value?resolve(value):reject(Error('JPG export failed. Please try again.')),'image/jpeg',.95));
 // Keep the detached canvas alive until the asynchronous encoder finishes,
 // then release its pixel buffer before preparing a download.
 output.width=output.height=1;
 if(current!==revision||view.hidden)return;
 if(blob.type!=='image/jpeg')throw Error('This browser could not export JPG. Try another browser.');
 // Own the JPG bytes independently of temporary encoder/download storage.
 const bytes=await blob.arrayBuffer();
 if(current!==revision||view.hidden)return;
 const name=cropFilename($('crop-name').value),file=new File([bytes],name,{type:'image/jpeg'}),url=URL.createObjectURL(file);downloads.add(url);prepared={file,revision};$('crop-name').value=name;
 const link=$('crop-download');link.href=url;link.download=name;link.target='_blank';link.rel='noopener';link.hidden=false;
 link.click();$('crop-start').hidden=false;
 status('Download requested. This browser cannot confirm it finished. Verify the JPG in Downloads or Files before starting. If it was canceled or did not appear, tap Download JPG again.');
 }catch(error){prepared=null;$('crop-start').hidden=true;status(`Could not export the crop: ${error.message}`);}
 finally{busy=false;$('crop-controls').disabled=!image;$('crop-file').disabled=false;}
 };
 $('crop-start').onclick=async()=>{
 if(!prepared||prepared.revision!==revision||busy)return;busy=true;$('crop-start').disabled=true;$('crop-file').disabled=true;
 try{if(await onUseFile(prepared.file)){leave(true);}else status('The cropped JPG could not be opened for the puzzle. Try saving again.');}
 catch{status('The crop could not be transferred. Try again; the original photo is unchanged.');}
 finally{busy=false;$('crop-start').disabled=false;$('crop-file').disabled=false;}
 };
 new ResizeObserver(draw).observe(frame);
 window.addEventListener('pagehide',event=>{if(event.persisted)return;if(imageURL)URL.revokeObjectURL(imageURL);for(const url of downloads)URL.revokeObjectURL(url);});
 $('open-crop').disabled=false;
}
