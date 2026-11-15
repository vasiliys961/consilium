import { downsample, wavBase64, hearWindow } from '../packages/translator/wav';
export async function prepareImage(file:File):Promise<string>{
 const bitmap=await createImageBitmap(file).catch(()=>null);if(!bitmap)throw Error(`${file.name}: браузер не декодировал изображение. Сохраните его как PNG или JPEG.`);
 try{const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');if(!ctx)throw Error('Нет декодера изображения');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const result=canvas.toDataURL('image/jpeg',.88);if(result.length>1_900_000)throw Error(`${file.name}: после подготовки изображение превышает предел 1,9 МБ.`);return result;}finally{bitmap.close();}
}
export async function prepareAudio(file:File):Promise<string>{
 const context=new AudioContext();try{const decoded=await context.decodeAudioData(await file.arrayBuffer());if(hearWindow(decoded.duration)!=='short')throw Error(`${file.name}: голосовые фрагменты ограничены 20 секундами. Разделите запись.`);
 const mono=new Float32Array(decoded.length);for(let c=0;c<decoded.numberOfChannels;c++){const source=decoded.getChannelData(c);for(let i=0;i<mono.length;i++)mono[i]+=source[i]/decoded.numberOfChannels;}
 return wavBase64(downsample(mono,decoded.sampleRate,16000),16000);
 }finally{await context.close();}
}
export async function prepareVideo(file:File):Promise<Array<{time:number;image:string}>>{
 const url=URL.createObjectURL(file);const video=document.createElement('video');video.src=url;video.muted=true;video.playsInline=true;
 try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Видео не декодировано браузером')),8000);video.onloadeddata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(Error('Видео не открылось; используйте MP4/H.264'));};});
 if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('Не удалось определить длительность видео');
 const frames=[];for(const part of [.15,.5,.85]){const time=video.duration*part;await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Не удалось выбрать кадр видео')),2500);video.onseeked=()=>{clearTimeout(timer);resolve();};video.currentTime=time;});const canvas=document.createElement('canvas');const scale=Math.min(1,1200/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);const ctx=canvas.getContext('2d');if(!ctx)continue;ctx.drawImage(video,0,0,canvas.width,canvas.height);frames.push({time,image:canvas.toDataURL('image/jpeg',.85)});}return frames;
 }finally{URL.revokeObjectURL(url);video.removeAttribute('src');video.load();}
}
