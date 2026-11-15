// Capability detection, including older iPad page APIs; never use video-only APIs.
export function fullscreenAPI(doc=document,root=doc.documentElement){
 if(doc.fullscreenEnabled!==false&&typeof root.requestFullscreen==='function'&&typeof doc.exitFullscreen==='function')return {enter:()=>root.requestFullscreen(),exit:()=>doc.exitFullscreen(),active:()=>!!doc.fullscreenElement};
 if(doc.webkitFullscreenEnabled!==false&&typeof root.webkitRequestFullscreen==='function'&&typeof doc.webkitExitFullscreen==='function')return {enter:()=>root.webkitRequestFullscreen(),exit:()=>doc.webkitExitFullscreen(),active:()=>!!doc.webkitFullscreenElement};
 return null;
}
export function fullscreenAdvice(nav=navigator){
 const apple=/iPhone|iPad|iPod/.test(nav.userAgent)||/Macintosh/.test(nav.userAgent)&&nav.maxTouchPoints>1;
 return apple?'Page fullscreen is unavailable here. In Safari, use Share → Add to Home Screen (or More → Share) if offered, then open the app there. You can also keep playing in this tab.':'Page fullscreen is unavailable in this browser or embedded view. You can keep playing here, or use your browser’s full-screen or install/Home Screen option if offered.';
}
export function attachFullscreen(button,status){
 if(!button||!status)return;
 const api=fullscreenAPI(),update=()=>{const active=api?.active()||false;button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',api?(active?'Exit fullscreen':'Enter fullscreen'):'Fullscreen options');button.title=button.getAttribute('aria-label');};
 button.onclick=async()=>{
 if(!api){status.hidden=!status.hidden;status.textContent=fullscreenAdvice();button.setAttribute('aria-expanded',String(!status.hidden));return;}
 button.disabled=true;status.hidden=true;button.setAttribute('aria-expanded','false');
 try{await (api.active()?api.exit():api.enter());}
 catch{status.hidden=false;button.setAttribute('aria-expanded','true');status.textContent='The browser blocked fullscreen. You can keep playing in this tab, or try its full-screen/Home Screen option.';}
 finally{button.disabled=false;update();}
 };
 for(const event of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(event,update);
 button.setAttribute('aria-expanded','false');update();
}
