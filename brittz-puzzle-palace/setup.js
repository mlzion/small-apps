import {setupReady,chooseSetupImage,setSetupImageSelectionHandler,restoreSetupImageSelection} from './cutting/lab.js?v=auto-crop-1';
import {attachFullscreen} from './fullscreen.js?v=crop-1';
import {attachCropper} from './cropper.js?v=auto-crop-1';
import {decodePhoto} from './photo-input.js?v=auto-crop-1';
attachFullscreen(document.getElementById('fullscreen'),document.getElementById('fullscreen-status'));
const cropperReady=setupReady.then(()=>attachCropper({onUseFile:chooseSetupImage}));
let selection=0;
setSetupImageSelectionHandler(async file=>{
 const current=++selection,button=document.getElementById('start-lab'),message=document.getElementById('gallery-message');
 button.disabled=true;document.getElementById('source-file').disabled=true;let photo;
 try{
 const cropper=await cropperReady;if(current!==selection)return;
 message.textContent='Reading the selected photo…';photo=await decodePhoto(file,{maxPixels:8192*8192});if(current!==selection)return;
 if(photo.width===photo.height){if(await chooseSetupImage(file,photo))photo=null;}
 else{if(photo.width*photo.height>64000000)throw Error('Choose a photo up to 64 megapixels for cropping.');restoreSetupImageSelection();const candidate=photo;photo=null;await cropper.openPhoto(candidate);}
 }catch(error){if(current===selection){restoreSetupImageSelection();message.textContent=`${error.message} The previous selection is unchanged.`;}}
 finally{photo?.revoke();if(current===selection){button.disabled=false;document.getElementById('source-file').disabled=false;}}
});
await cropperReady;
