'use client';
import {useRef,useState,type PointerEvent} from 'react';
import type {CaseFile} from '@/lib/conductor';
import {maskRectangle,maskBrush,type MaskPoint} from '@/lib/privacy-mask';
import {useWorkspaceLanguage} from './workspace-language';
import styles from './privacy.module.css';
export function MaskImage({file,onChange}:{file:CaseFile;onChange:(file:CaseFile)=>void}){
 const {t}=useWorkspaceLanguage();const image=useRef<HTMLImageElement>(null),stroke=useRef<{first:MaskPoint;last:MaskPoint;boxes:NonNullable<CaseFile['masks']>}|null>(null);
 const [dimensions,setDimensions]=useState({width:1,height:1}),[tool,setTool]=useState<'rectangle'|'brush'>('rectangle'),[size,setSize]=useState(5),[preview,setPreview]=useState<NonNullable<CaseFile['masks']>>([]),[undo,setUndo]=useState<number[]>([]);
 function point(event:PointerEvent<HTMLDivElement>):MaskPoint{const rect=image.current!.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
 function move(event:PointerEvent<HTMLDivElement>){const current=stroke.current;if(!current)return;const next=point(event);current.boxes=tool==='rectangle'?[maskRectangle(current.first,next,dimensions.width,dimensions.height)]:[...current.boxes,...maskBrush(current.last,next,dimensions.width,dimensions.height,size)];current.last=next;setPreview(current.boxes);}
 function finish(event:PointerEvent<HTMLDivElement>){if(!stroke.current)return;move(event);const boxes=stroke.current!.boxes.filter(box=>box.width>=1&&box.height>=1);stroke.current=null;setPreview([]);if(boxes.length){setUndo(old=>[...old,(file.masks??[]).length]);onChange({...file,masks:[...(file.masks??[]),...boxes]});}}
 return <section><p>{t('Закрасьте идентификаторы. Прямоугольник удобен для строк, кисть — для отдельных областей. Предпросмотр виден сразу; чёрные участки будут нанесены на отправляемую копию.')}</p>
  <div className={styles.maskTools}><button type="button" aria-pressed={tool==='rectangle'} onClick={()=>setTool('rectangle')}>{t('Прямоугольник')}</button><button type="button" aria-pressed={tool==='brush'} onClick={()=>setTool('brush')}>{t('Кисть')}</button>{tool==='brush'&&<label>{t('Размер кисти')} {size}%<input type="range" min={1} max={15} value={size} onChange={event=>setSize(Number(event.target.value))}/></label>}</div>
  <div className={styles.image} onPointerDown={event=>{if(!image.current||event.button!==0)return;event.preventDefault();const first=point(event);event.currentTarget.setPointerCapture(event.pointerId);const boxes=tool==='brush'?maskBrush(first,first,dimensions.width,dimensions.height,size):[];stroke.current={first,last:first,boxes};setPreview(boxes);}} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{stroke.current=null;setPreview([]);}}>
   <img ref={image} src={file.image} alt={t('Копия изображения для проверки')} draggable={false} onLoad={event=>setDimensions({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})}/>
   {[...(file.masks??[]),...preview].map((mask,index)=><span key={index} className={styles.mask} style={{left:100*mask.x/dimensions.width+'%',top:100*mask.y/dimensions.height+'%',width:100*mask.width/dimensions.width+'%',height:100*mask.height/dimensions.height+'%'}}/>)}
  </div>
  <button type="button" disabled={!file.masks?.length} onClick={()=>{const count=undo.at(-1)??Math.max(0,(file.masks?.length??0)-1);onChange({...file,masks:file.masks?.slice(0,count)});setUndo(old=>old.slice(0,-1));}}>{t('Отменить последнее закрашивание')}</button>{' '}
  <button type="button" onClick={()=>{setUndo(old=>[...old,(file.masks??[]).length]);onChange({...file,masks:[...(file.masks??[]),{x:0,y:0,width:dimensions.width,height:dimensions.height}]});}}>{t('Скрыть всё изображение')}</button>
 </section>;
}
