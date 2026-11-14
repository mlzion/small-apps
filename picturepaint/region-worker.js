importScripts('regions.js');
onmessage=({data})=>{try{const result=segment(data.pixels,data.width,data.height,data.threshold,data.gap);postMessage(result,[result.labels.buffer]);}catch(error){postMessage({error:error.message});}};
