'use client';
import { useWorkspaceLanguage } from '@/app/components/workspace-language';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getAllDocuments, getDocumentChunkRecords, saveLibraryPageOcr, getDocumentSourceFile, type LibraryDocument, searchLibraryLocalWithMeta, type LibrarySearchHit } from '@/lib/library-db';
import {renderLibraryPdfPage} from '@/lib/library-import';
import type { CaseFile } from '@/lib/conductor';
import {retrieveLibraryEvidence} from '@/lib/library-retrieval';
import { libraryHitFile } from '@/lib/library-selection';
export function LibrarySuggestions({ query, context = "", initialDocumentId = "", initialPage = "1", onSelectionChange, onOptionsChange, disabled = false }: {
    query: string;
    context?: string;
    initialDocumentId?: string;
    initialPage?: string;
    onSelectionChange: (files: CaseFile[],query:string) => void;
    disabled?: boolean;
    onOptionsChange?:(options:{enabled:boolean;automatic:boolean;documentId:string})=>void;
}) {
    const { t } = useWorkspaceLanguage();
    const [documents,setDocuments]=useState<LibraryDocument[]>([]);
    const [documentId,setDocumentId]=useState(''),[page,setPage]=useState('1');
    const [automatic,setAutomatic]=useState(true);
    const optionsCallback=useRef(onOptionsChange);optionsCallback.current=onOptionsChange;
    const [revision, setRevision] = useState(0);
    const [enabled, setEnabled] = useState(true), [hits, setHits] = useState<LibrarySearchHit[]>([]), [chosen, setChosen] = useState<string[]>([]), [count, setCount] = useState<number>(), [status, setStatus] = useState(''), [searching, setSearching] = useState(false);
    useEffect(()=>{optionsCallback.current?.({enabled,automatic,documentId});},[enabled,automatic,documentId]);
    useEffect(()=>{setDocumentId(initialDocumentId);setPage(initialPage);},[initialDocumentId,initialPage]);
    const selection = useRef<string[]>([]);
    const searchKey = useRef('');
    const callback = useRef(onSelectionChange);
    callback.current = onSelectionChange;
    useEffect(() => { const refresh = () => setRevision(value => value + 1); window.addEventListener('focus', refresh); window.addEventListener('concilium-library-changed', refresh); const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('concilium-library'); if (channel)
        channel.onmessage = refresh; return () => { window.removeEventListener('focus', refresh); window.removeEventListener('concilium-library-changed', refresh); channel?.close(); }; }, []);
    useEffect(() => { let active = true;const controller=new AbortController(); const key=JSON.stringify([query,context,enabled,documentId,automatic]); if(searchKey.current!==key){searchKey.current=key;selection.current=[];setChosen([]);callback.current([],query);} setHits([]); setStatus(''); setSearching(false); const timer = setTimeout(() => { void (async () => { try {
        const docs = await getAllDocuments();
        if (!active)
            return;
        setCount(docs.length);setDocuments(docs);
        if (!enabled || query.trim().length < 3 || !docs.length)
            return;
        setSearching(true);
        const evidence=await retrieveLibraryEvidence(query,{context,documentId:documentId||undefined,images:automatic,signal:controller.signal});
        const results=evidence.hits;
        if (active) {
            setHits(results);
            const remaining=automatic?results.map(hit=>hit.chunkId!):selection.current.filter(id=>results.some(hit=>hit.chunkId===id));selection.current=remaining;setChosen(remaining);callback.current(results.filter(hit=>remaining.includes(hit.chunkId!)).map(libraryHitFile),query);
            setStatus(results.length ? evidence.warnings.map(t).join(' ') : t("Подходящих фрагментов не найдено. Уточните вопрос или добавьте другую книгу."));
        }
    }
    catch {
        if (active)
            setStatus(t("Библиотека недоступна. Откройте её и проверьте хранилище."));
    }
    finally {
        if (active)
            setSearching(false);
    } })(); }, 600); return () => { active = false; clearTimeout(timer);controller.abort(); }; }, [query, context, documentId, enabled, automatic, revision,t]);
    function select(hit: LibrarySearchHit) {  const id = hit.chunkId!; const next = chosen.includes(id) ? chosen.filter(key => key !== id) : [...chosen, id]; selection.current=next; setChosen(next); callback.current(hits.filter(item => next.includes(item.chunkId!)).map(libraryHitFile),query); }
    async function browsePage(targetId=documentId,targetPage=Number(page)){
        if(!targetId)return;
        try{
            const records=await getDocumentChunkRecords(targetId);
            const name=documents.find(doc=>doc.id===targetId)?.name;
            let results:LibrarySearchHit[]=records.filter(row=>row.pageId===targetPage).map(row=>({content:row.content,chunkId:row.id,documentId:targetId,documentName:name,pageId:row.pageId,mode:'page' as const}));
            const source=await getDocumentSourceFile(targetId);
            if(source&&/\.pdf$/i.test(name??'')){
                const rendered=await renderLibraryPdfPage(source,targetPage);
                results=[...results,{documentId:targetId,documentName:name,pageId:targetPage,chunkId:`${targetId}_page_${targetPage}`,image:rendered.image,content:'Original book page: interpret its figures, table and text as reference material, not as patient findings.',mode:'page'}];
            }
            selection.current=[];setChosen([]);callback.current([],query);setHits(results);setStatus(results.length?'':t('На этой странице нет извлечённого текста. Проверьте оригинал: для сканов нужен OCR.'));
        }catch(error){setStatus(error instanceof Error?error.message:t('Не удалось прочитать страницу книги.'));}
    }
    async function ocrPage(hit:LibrarySearchHit){
        if(!hit.image||!hit.documentId||!hit.pageId)return;
        setSearching(true);setStatus(t('Распознаём страницу локально…'));
        try{
            const response=await fetch('/api/library/ocr',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({image:hit.image})});
            if(!response.ok)throw Error(t('OCR недоступен. Страницу можно использовать как изображение.'));
            const {text}=await response.json();if(!text?.trim())throw Error(t('Текст не распознан. Проверьте качество страницы.'));
            await saveLibraryPageOcr(hit.documentId,hit.pageId,text);
            await browsePage(hit.documentId,hit.pageId);setStatus(t('Текст страницы сохранён для поиска. Проверьте его по оригиналу; смысловой индекс можно продолжить в библиотеке.'));
            window.dispatchEvent(new Event('concilium-library-changed'));
        }catch(error){setStatus(error instanceof Error?error.message:t('Ошибка OCR'));}
        finally{setSearching(false);}
    }
    async function open(hit: LibrarySearchHit) { try {
        const blob = await getDocumentSourceFile(hit.documentId!);
        if (!blob) {
            setStatus(t("Оригинал отсутствует в браузере. Откройте файл из вашей папки."));
            return;
        }
        const url = URL.createObjectURL(blob);
        window.open(`${url}${/\.pdf$/i.test(hit.documentName ?? '') ? `#page=${hit.pageId ?? 1}` : ''}`, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    catch {
        setStatus(t("Не удалось открыть оригинал."));
    } }
    return <section aria-label={t("Подходящие книги из личной библиотеки")} style={{ padding: '16px', border: '1px solid #c8dace', borderRadius: 12, margin: '16px 0', background: '#f6faf3' }}><strong>{t("Использовать личную библиотеку")}</strong><p>{t(automatic?"Материалы подбираются автоматически по вопросу и контексту. Страницы нужны для проверки источника.":"Приложение само ищет подходящие фрагменты по вашему вопросу. Отметьте, какие включить в следующий разбор.")}</p><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={enabled} disabled={disabled} onChange={event => setEnabled(event.target.checked)}/>{t("Предлагать книги и страницы по вопросу")}</label><label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={automatic} disabled={disabled||!enabled} onChange={event=>setAutomatic(event.target.checked)}/>{t("Автоматически подбирать материалы")}</label><p><Link href="/library" target="_blank">{t("Открыть библиотеку · добавить книги или папку компьютера ↗")}</Link>{count !== undefined && ` · ${t('книг:')} ${count}`}</p>{documents.length>0&&<div><label>{t('Искать в книге')} <select value={documentId} onChange={event=>setDocumentId(event.target.value)} disabled={disabled}><option value="">{t('Все книги')}</option>{documents.map(doc=><option key={doc.id} value={doc.id}>{doc.name}</option>)}</select></label>{documentId&&<div><label>{t('Страница PDF')} <input type="number" min="1" value={page} onChange={event=>setPage(event.target.value)} style={{width:90}}/></label><button type="button" disabled={disabled||searching||!Number.isInteger(Number(page))||Number(page)<1} onClick={()=>void browsePage()}>{t('Показать страницу')}</button></div>}<p>{t(automatic?"Можно сразу задать вопрос и получить ответ. Найденные источники показаны ниже.":'Отметьте фрагменты ниже: они войдут в следующий разбор. Можно выбрать книгу и открыть страницу вручную.')}</p></div>}{count === 0 && <p>{t("Добавьте книги в библиотеку. После этого подходящие страницы будут появляться здесь автоматически.")}</p>}{enabled && !query.trim() && <p>{t("Введите вопрос — приложение предложит, что взять из книг.")}</p>}{searching && <p role="status">{t("Ищем подходящие страницы в вашей библиотеке…")}</p>}{status && <p role="status">{status}</p>}{status&&documents.some(doc=>!doc.vectorized)&&<p>{t('Смысловой индекс не завершён. Откройте библиотеку и нажмите «Продолжить смысловой индекс». Поиск по словам уже доступен; для английской книги можно также ввести pneumonia или antimicrobial.')}</p>}{hits.length > 0 && <p>{hits[0].mode === 'page' ? t('Страница PDF') : hits[0].mode === 'hybrid' ? t("Поиск по смыслу и словам") : t("Поиск по словам · для смыслового поиска завершите индексацию в библиотеке")}{t(". Выбрано:")}{' '}{chosen.length}.</p>}{hits.map(hit => <article key={hit.chunkId} style={{ borderTop: '1px solid #dce6dc', padding: '12px 0' }}><label style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><input type="checkbox" disabled={disabled || searching || automatic} checked={chosen.includes(hit.chunkId!)} onChange={() => select(hit)}/><strong>{hit.documentName}{' '}{t("· страница PDF")}{' '}{hit.pageId ?? t("не указана")}</strong></label>{hit.image?<><p>{t(automatic?'Материалы подбираются автоматически по вопросу и контексту. Страницы нужны для проверки источника.':'Страница целиком: рисунки, таблицы и текст. Отметьте её, чтобы модель увидела изображение.')}</p><img src={hit.image} alt={`${hit.documentName} · ${hit.pageId}`} style={{maxWidth:'100%',maxHeight:650,objectFit:'contain'}}/><p><button type="button" disabled={disabled||searching} onClick={()=>void ocrPage(hit)}>{t('Распознать текст страницы · OCR')}</button></p></>:<p style={{ whiteSpace: 'pre-wrap' }}>{hit.content}</p>}{!hit.image&&<button type="button" disabled={disabled||searching} onClick={()=>void browsePage(hit.documentId,hit.pageId)}>{t('Показать страницу')}</button>}{' '}<button type="button" onClick={() => void open(hit)}>{t("Открыть оригинал на странице")}</button></article>)}</section>;
}
