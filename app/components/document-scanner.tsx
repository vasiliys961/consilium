'use client';
import {useRef,useState} from 'react';
import {scanPdf,type ScanPage} from '@/lib/scan-pdf';
import {useWorkspaceLanguage} from './workspace-language';
type Page=ScanPage&{preview:string};
export function DocumentScanner({onPdf,disabled=false,pdfActionLabel}:{onPdf?:(file:File)=>void;disabled?:boolean;pdfActionLabel?:string}){
 const {t}=useWorkspaceLanguage();const camera=useRef<HTMLInputElement>(null),picker=useRef<HTMLInputElement>(null);
 const [source,setSource]=useState<HTMLImageElement>(),[rotation,setRotation]=useState(0),[crop,setCrop]=useState(0),[enhance,setEnhance]=useState(true),[pages,setPages]=useState<Page[]>([]),[error,setError]=useState(''),[working,setWorking]=useState(false);
 async function load(file?:File){if(!file)return;setError('');const reader=new FileReader();reader.onload=()=>{const image=new Image();image.onload=()=>{setSource(image);setRotation(0);setCrop(0);};image.onerror=()=>setError('Фото не открылось. Выберите JPEG или PNG.');image.src=String(reader.result);};reader.onerror=()=>setError('Фото не прочитано.');reader.readAsDataURL(file);}
 function addPage(){if(!source||pages.length>=10)return;setError('');setWorking(true);try{
  const margin=crop/100,sx=source.naturalWidth*margin,sy=source.naturalHeight*margin,sw=source.naturalWidth-2*sx,sh=source.naturalHeight-2*sy;
  const scale=Math.min(1,1800/Math.max(sw,sh)),width=Math.round(sw*scale),height=Math.round(sh*scale),canvas=document.createElement('canvas');canvas.width=rotation%180?height:width;canvas.height=rotation%180?width:height;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Копия страницы не подготовлена');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);if(enhance)ctx.filter='grayscale(1) contrast(1.25) brightness(1.05)';ctx.drawImage(source,sx,sy,sw,sh,-width/2,-height/2,width,height);
  const preview=canvas.toDataURL('image/jpeg',.82),jpeg=Uint8Array.from(atob(preview.split(',')[1]),char=>char.charCodeAt(0));
  setPages(old=>[...old,{preview,jpeg,width:canvas.width,height:canvas.height}]);setSource(undefined);
 }catch(reason){setError(reason instanceof Error?reason.message:'Страница не подготовлена');}finally{setWorking(false);}}
 function file(){const bytes=scanPdf(pages);if(bytes.length>8000000)throw Error('PDF больше 8 МБ. Удалите часть страниц.');return new File([new Uint8Array(bytes)],`scan-${Date.now()}.pdf`,{type:'application/pdf'});}
 function finish(download=false){try{const pdf=file();if(download){const url=URL.createObjectURL(pdf),a=document.createElement('a');a.href=url;a.download=pdf.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}else onPdf?.(pdf);}catch(reason){setError(reason instanceof Error?reason.message:'PDF не создан');}}
 return <section className="document-scanner" aria-label={t('Сканер документов')}>
  <h2>{t('Сканер документов → PDF')}</h2><p>{t('Сфотографируйте страницы, обрежьте лишние поля и соберите PDF. До 10 страниц и 8 МБ. OCR и проверка персональных данных выполняются локально на компьютере перед разбором; исходный PDF не отправляется моделям.')}</p>
  <input hidden ref={camera} type="file" accept="image/*" capture="environment" onChange={event=>{void load(event.target.files?.[0]);event.target.value='';}}/>
  <input hidden ref={picker} type="file" accept="image/*" onChange={event=>{void load(event.target.files?.[0]);event.target.value='';}}/>
  <button type="button" disabled={disabled||pages.length>=10} onClick={()=>camera.current?.click()}>{t('Снять страницу')}</button>{' '}<button type="button" disabled={disabled||pages.length>=10} onClick={()=>picker.current?.click()}>{t('Выбрать фото страницы')}</button>
  {source&&<section><div style={{position:'relative',maxWidth:400,marginBlock:16}}><img src={source.src} alt={t('Страница перед добавлением')} style={{width:'100%',display:'block',filter:enhance?'grayscale(1) contrast(1.25)':'none'}}/><div style={{position:'absolute',inset:`${crop}%`,border:'2px solid #2d795a',pointerEvents:'none'}}/></div><label>{t('Обрезать поля со всех сторон')} · {crop}%<input type="range" min={0} max={20} value={crop} onChange={event=>setCrop(Number(event.target.value))}/></label><label><input type="checkbox" checked={enhance} onChange={event=>setEnhance(event.target.checked)}/>{t('Усилить контраст текста')}</label><p>{t('Поворот при сохранении:')} {rotation}°</p><button type="button" onClick={()=>setRotation(value=>(value+90)%360)}>{t('Повернуть на 90°')}</button>{' '}<button type="button" disabled={working||disabled} onClick={addPage}>{t('Добавить страницу в PDF')}</button></section>}
  {pages.length>0&&<><ol>{pages.map((page,index)=><li key={index}><img src={page.preview} width={65} alt={`${t('Страница')} ${index+1}`}/>{' '}{t('Страница')} {index+1}{' '}<button type="button" disabled={disabled} onClick={()=>setPages(old=>old.filter((_,i)=>i!==index))}>{t('Убрать страницу')}</button></li>)}</ol><button type="button" disabled={disabled||working} onClick={()=>finish(true)}>{t('Сохранить PDF на этом устройстве')}</button>{onPdf&&<>{' '}<button type="button" disabled={disabled||working} onClick={()=>finish()}>{t(pdfActionLabel||'Подготовить PDF для передачи')}</button></>}</>}
  {error&&<p role="alert">{t(error)}</p>}
 </section>;
}
