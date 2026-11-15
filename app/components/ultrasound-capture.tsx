'use client';

import {useEffect,useRef,useState} from 'react';
import {useWorkspaceLanguage} from './workspace-language';

// Adapts the Ultrasound Ultra browser video and screen inputs to the case upload flow.
export function UltrasoundCapture({disabled,onFrame}:{disabled:boolean;onFrame:(file:File)=>Promise<void>}){
  const {t}=useWorkspaceLanguage();
  const video=useRef<HTMLVideoElement>(null);
  const stream=useRef<MediaStream>();
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const [input,setInput]=useState('');
  const [active,setActive]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let mounted=true;
    void navigator.mediaDevices?.enumerateDevices().then(values=>{
      if(mounted)setDevices(values.filter(device=>device.kind==='videoinput'&&device.deviceId));
    }).catch(()=>{});
    return()=>{mounted=false;stream.current?.getTracks().forEach(track=>track.stop());};
  },[]);
  function stop(){
    stream.current?.getTracks().forEach(track=>track.stop());
    stream.current=undefined;
    if(video.current)video.current.srcObject=null;
    setActive(false);
  }
  async function connect(screen:boolean){
    if(!video.current||busy)return;
    setBusy(true);setError(false);
    try{
      const next=screen?await navigator.mediaDevices.getDisplayMedia({video:true,audio:false}):
        await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:input}},audio:false});
      if(!video.current){next.getTracks().forEach(track=>track.stop());return;}
      stream.current=next;
      next.getVideoTracks()[0]?.addEventListener('ended',stop,{once:true});
      video.current.srcObject=next;
      await video.current.play();
      if(video.current&&stream.current===next)setActive(true);
    }catch{stop();setError(true);}finally{setBusy(false);}
  }
  async function capture(){
    const source=video.current;
    if(!source||source.readyState<2||!source.videoWidth)return;
    const scale=Math.min(1,1600/Math.max(source.videoWidth,source.videoHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(source.videoWidth*scale);canvas.height=Math.round(source.videoHeight*scale);
    const context=canvas.getContext('2d');
    if(!context)return;
    context.drawImage(source,0,0,canvas.width,canvas.height);
    setBusy(true);
    try{
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('frame');
      await onFrame(new File([blob],`ultrasound-${Date.now()}.png`,{type:'image/png'}));
    }catch{setError(true);}finally{setBusy(false);}
  }
  return <details style={{marginBlock:16}}>
    <summary>{t('Видеовход УЗИ')}</summary>
    <p>{t('Выберите окно приложения аппарата или доступный видеовход. В разбор попадут только кадры, которые вы добавите.')}</p>
    <label>{t('Видеовход УЗИ')}<select disabled={active||busy||disabled} value={input} onChange={event=>setInput(event.target.value)}>
      <option value="">—</option>{devices.map((device,i)=><option key={device.deviceId} value={device.deviceId}>{device.label||`Video ${i+1}`}</option>)}
    </select></label>
    {!active&&<><button disabled={!input||busy||disabled} onClick={()=>void connect(false)}>{t('Подключить видеовход')}</button>{' '}
      <button disabled={busy||disabled} onClick={()=>void connect(true)}>{t('Выбрать окно аппарата')}</button></>}
    <video ref={video} hidden={!active} muted playsInline style={{width:'100%',maxHeight:350,marginBlock:8}}/>
    {active&&<><button disabled={busy||disabled} onClick={()=>void capture()}>{t('Добавить кадр')}</button>{' '}<button onClick={stop}>{t('Остановить захват')}</button></>}
    {error&&<p role="alert">{t('Видеовход недоступен.')}</p>}
  </details>;
}
