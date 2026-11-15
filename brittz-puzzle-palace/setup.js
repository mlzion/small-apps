import {setupReady,chooseSetupImage} from './cutting/lab.js?v=crop-1';
import {attachFullscreen} from './fullscreen.js?v=crop-1';
import {attachCropper} from './cropper.js?v=crop-1';
attachFullscreen(document.getElementById('fullscreen'),document.getElementById('fullscreen-status'));
await setupReady;
attachCropper({onUseFile:chooseSetupImage});
