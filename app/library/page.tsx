'use client';
import { useWorkspaceLanguage } from '@/app/components/workspace-language';
import { LanguageSwitcher } from '@/app/components/language-switcher';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getAllDocuments, deleteDocument, getDocumentSourceFile, checkLibraryFolderSource, type LibraryDocument, type LibraryFileHandle, type LibraryFolderSourceState } from '@/lib/library-db';
import { importLibraryFile, vectorizeLibraryDocument, ocrLibraryDocument, indexLibraryVisuals } from '@/lib/library-import';
import { LibrarySuggestions } from '@/app/components/library-suggestions';
import styles from './library.module.css';
import type {CaseFile} from '@/lib/conductor';
import {reviewBeforeSending} from '@/lib/privacy-client';
import {VISUAL_INDEX_VERSION} from '@/lib/visual-embeddings';
import {retrieveLibraryEvidence} from '@/lib/library-retrieval';
import ReactMarkdown from 'react-markdown';
interface DirectoryHandle {
    kind: 'directory';
    values: () => AsyncIterable<DirectoryHandle | ({
        kind: 'file';
    } & LibraryFileHandle)>;
}
export default function LibraryPage() {
    const { t,language } = useWorkspaceLanguage();
    const [libraryOptions,setLibraryOptions]=useState({enabled:true,automatic:true,documentId:''});
    const [selected,setSelected]=useState<{query:string;files:CaseFile[]}>({query:'',files:[]});
    const [answer,setAnswer]=useState<{text:string;sources:{number:number;title:string;page:number;documentId:string}[]}|null>(null);
    const [answerBusy,setAnswerBusy]=useState(false),[answerError,setAnswerError]=useState('');
    async function askBook(){
        if(!query.trim())return;
        setAnswerBusy(true);setAnswerError('');setAnswer(null);
        try{
            const evidence=libraryOptions.enabled&&libraryOptions.automatic?await retrieveLibraryEvidence(query,{documentId:libraryOptions.documentId||undefined}):null;
            const files=evidence?.files??(selected.query===query?selected.files:[]);
            if(!files.length)throw Error(t('Подходящих фрагментов не найдено. Уточните вопрос или добавьте другую книгу.'));
            const reviewed=await reviewBeforeSending({text:query,referenceFiles:files,locale:language,externalSearch:false});
            const response=await fetch('/api/library/answer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(reviewed)});
            if(!response.ok)throw Error(t('Не удалось получить ответ по книге. Попробуйте ещё раз.'));
            setAnswer(await response.json());
        }catch(error){setAnswerError(error instanceof Error?error.message:t('Ошибка ответа'));}
        finally{setAnswerBusy(false);}
    }
    const [folderStates,setFolderStates]=useState<Record<string,LibraryFolderSourceState>>({});
    const [storageEstimate,setStorageEstimate]=useState<{usage:number;quota:number}|null>(null);
    const [books, setBooks] = useState<LibraryDocument[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [query, setQuery] = useState('');
    const [focusBook,setFocusBook]=useState(''),[focusPage,setFocusPage]=useState('1');
    useEffect(()=>{const params=new URLSearchParams(window.location.search);setFocusBook(params.get('book')??'');const page=params.get('page');if(page&&/^\d+$/.test(page))setFocusPage(page);},[]);
    const cancel = useRef<AbortController>();
    const folder = useRef<HTMLInputElement>(null);
    const refresh = async () => { const docs=await getAllDocuments();setBooks(docs);
      const folderRows=await Promise.all(docs.filter(doc=>doc.storage==='folder').map(async doc=>[doc.id,await checkLibraryFolderSource(doc)] as const));
      setFolderStates(Object.fromEntries(folderRows));
      try{const estimate=await navigator.storage?.estimate();setStorageEstimate(estimate&&typeof estimate.usage==='number'&&typeof estimate.quota==='number'?{usage:estimate.usage,quota:estimate.quota}:null);}catch{setStorageEstimate(null);}
      window.dispatchEvent(new Event('concilium-library-changed')); if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('concilium-library');
        channel.postMessage('changed');
        channel.close();
    } };
    useEffect(() => { void refresh().catch(() => setMessage(t("Хранилище библиотеки недоступно в этом браузере."))); return () => cancel.current?.abort(); }, []);
    async function fullIndex(id:string,isPdf=true){
        const controller=new AbortController();cancel.current=controller;
        if(isPdf)await indexLibraryVisuals(id,setMessage,controller.signal);
        await vectorizeLibraryDocument(id,setMessage,controller.signal);
    }
    async function completeBook(id:string){
        setBusy(true);try{await fullIndex(id);setMessage(t('Полный индекс книги готов.'));}catch(error){setMessage(error instanceof Error?error.message:t('Индекс недоступен.'));}finally{await refresh();setBusy(false);}
    }
    async function index(id: string) { const controller = new AbortController(); cancel.current = controller; await vectorizeLibraryDocument(id, setMessage, controller.signal); }
    async function add(files: FileList | null, handles?: Map<File, LibraryFileHandle>) { if (!files?.length)
        return; setBusy(true); let count = 0, duplicates=0, unverified=0; const errors: string[] = []; try {
        for (const file of Array.from(files).filter(file => /\.(pdf|txt|md)$/i.test(file.name))) {
            try {
                setMessage(`Читаем ${file.name}…`);
                const {document:doc,alreadyPresent,fingerprintChecked}=await importLibraryFile(file, setMessage, handles?.get(file));
                if(alreadyPresent){duplicates++;continue;}
                count++;if(!fingerprintChecked)unverified++;
                await refresh();
                try {
                    await fullIndex(doc.id,/\.pdf$/i.test(file.name));
                }
                catch (error) {
                    errors.push(`${file.name}: текст сохранён, смысловой индекс не завершён. ${error instanceof Error ? error.message : ''}`);
                    if(cancel.current?.signal.aborted)break;
                }
            }
            catch (error) {
                errors.push(`${file.name}: ${error instanceof Error ? error.message : t("Ошибка чтения")}`);
            }
        }
        await refresh();
        setMessage([`Добавлено книг: ${count}.`,duplicates?`Уже есть в библиотеке (повторно не загружены): ${duplicates}.`:'',unverified?`Файлов без проверки SHA-256 (больше 64 МБ): ${unverified}.`:'', ...errors].filter(Boolean).join('\n'));
    }
    finally {
        setBusy(false);
    } }
    async function chooseFolder() {
        const picker = (window as Window & {
            showDirectoryPicker?: () => Promise<DirectoryHandle>;
        }).showDirectoryPicker;
        if (!picker) {
            folder.current?.click();
            return;
        }
        try {
            const dir = await picker();
            const handles = new Map<File, LibraryFileHandle>();
            async function read(directory: DirectoryHandle) { for await (const item of directory.values()) {
                if (item.kind === 'directory')
                    await read(item);
                else {
                    const file = await item.getFile();
                    if (/\.(pdf|txt|md)$/i.test(file.name))
                        handles.set(file, item);
                }
            } }
            await read(dir);
            const transfer = new DataTransfer();
            for (const file of handles.keys())
                transfer.items.add(file);
            await add(transfer.files, handles);
        }
        catch (error) {
            if (!(error instanceof DOMException && error.name === 'AbortError'))
                setMessage(t("Не удалось прочитать папку. Выберите книги отдельными файлами."));
        }
    }
    async function vectorize(id: string) { setBusy(true); try {
        await index(id);
        await refresh();
        setMessage(t("Смысловой индекс готов."));
    }
    catch (error) {
        setMessage(error instanceof Error ? error.message : t("Индекс недоступен."));
    }
    finally {
        setBusy(false);
    } }
    async function ocrBook(id:string){
        setBusy(true);const controller=new AbortController();cancel.current=controller;
        try{await ocrLibraryDocument(id,setMessage,controller.signal);await refresh();setMessage(t('OCR завершён. Для поиска по смыслу продолжите смысловой индекс.'));}
        catch(error){setMessage(error instanceof Error?error.message:t('Ошибка OCR'));await refresh();}
        finally{setBusy(false);}
    }
    async function original(book: LibraryDocument) { try {const file = await getDocumentSourceFile(book.id); if (!file) {
        setMessage(t("Оригинал этой книги не сохранён."));
        return;
    } const url = URL.createObjectURL(file); const anchor = document.createElement('a'); anchor.href = url; anchor.download = book.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }catch{setMessage(t("Не удалось открыть оригинал."));} }
    return <main className={styles.page}><Link href="/workspace">{t("← К случаям")}</Link><LanguageSwitcher/><h1>{t("Личная библиотека")}</h1><p>{t('Загрузите книгу, задайте вопрос и получите ответ с проверяемыми источниками. Текст, таблицы и изображения подбираются автоматически.')}</p><section><h2>{t("Книги из файлов или папки компьютера")}</h2><p>{t("Выберите файлы для хранения в браузере или подключите папку компьютера. В Chrome/Edge оригиналы из подключённой папки остаются на диске, а в браузере сохраняется поисковый индекс. В Safari выбор папки добавляет копии книг в браузер. Изменения в папке требуют повторного импорта.")}</p><div className={styles.actions}><label>{t("Добавить книги")}<input type="file" multiple accept=".pdf,.txt,.md" disabled={busy} onChange={event => { void add(event.target.files); event.target.value = ''; }}/></label><input type="file" ref={folder} hidden multiple {...{ webkitdirectory: '', directory: '' }} onChange={event => { void add(event.target.files); event.target.value = ''; }}/><button disabled={busy} onClick={() => void chooseFolder()}>{t("Выбрать папку с книгами")}</button>{busy && <button onClick={() => cancel.current?.abort()}>{t("Приостановить обработку книги")}</button>}</div><p>{t("PDF, включая сканы, TXT, Markdown · до 250 МБ на книгу. Текст извлекается и индексируется локально. Внешняя модель получает только выбранные вами фрагменты после проверки отправки.")}</p><p>{t("Книги доступны в этом браузере на этом адресе приложения. Очистка данных браузера удаляет библиотеку; сохраняйте оригиналы в папке компьютера.")}</p></section>{message && <p role="status" style={{ whiteSpace: 'pre-wrap' }}>{message}</p>}<section><h2>{t("Мои книги ·")}{' '}{books.length}</h2>{storageEstimate&&<p>{t('Хранилище браузера (все данные этого приложения):')} {Math.round(storageEstimate.usage/1024/1024*10)/10} / {Math.round(storageEstimate.quota/1024/1024)} {t('МБ использовано и доступно по оценке браузера. Это не только книги.')}</p>}{!books.length && <p>{t("Библиотека пока пуста. Добавьте книгу, чтобы приложение могло предлагать её в разборах.")}</p>}{books.map(book => <article key={book.id}><h3>{book.name}</h3>{book.storage==='folder'&&folderStates[book.id]==='modified'&&<p role="alert">{t('Исходная книга в папке изменилась. Старый индекс исключён из автоматического поиска. Загрузите новую версию книги, старую запись можно удалить отдельно.')}</p>}{book.storage==='folder'&&folderStates[book.id]==='unavailable'&&<p role="alert">{t('Исходная книга из папки недоступна. Старый индекс исключён из автоматического поиска. Подключите папку повторно.')}</p>}{book.storage==='folder'&&folderStates[book.id]==='unverified'&&<p>{t('Для этого ранее добавленного файла не сохранена дата версии. Повторный импорт позволит отслеживать изменения.')}</p>}<p>{book.storage === 'folder' ? t("Оригинал в папке компьютера") : t("Копия в браузере")} · {book.chunksCount}{' '}{t("фрагментов ·")}{' '}{Math.round(book.size / 1024 / 1024 * 10) / 10}{' '}{t("МБ ·")}{' '}{book.vectorized ? t("Смысловой индекс готов") : t("Поиск по словам; смысловой индекс можно продолжить")}</p>{book.imagesIndexed&&book.visualIndexVersion===VISUAL_INDEX_VERSION&&<p>{t('Индекс изображений готов: страницы и области иллюстраций доступны для поиска.')}</p>}{book.visualPagesProcessed!==undefined&&<p>{t('Обработано страниц:')} {book.visualPagesProcessed} / {book.pageCount??'…'}</p>}{Boolean(book.ocrMissingPages?.length)&&<p>{t('Некоторые страницы не распознаны OCR: доступны изображения, текстовый поиск по ним неполон.')}</p>}{book.pageCount!==undefined&&<p>{t('Страниц PDF:')} {book.pageCount} · {t('Страниц с текстом:')} {book.textPages??'—'}. {book.textPages!==undefined&&book.textPages<book.pageCount&&t('Часть страниц содержит мало текста: проверьте сканы, рисунки и таблицы через просмотр страницы. Для сканов доступен OCR.')}</p>}<div className={styles.actions}><button type="button" onClick={()=>{setFocusBook(book.id);document.getElementById('library-search')?.scrollIntoView({behavior:'smooth'});}}>{t('Работать с книгой')}</button><button disabled={busy} onClick={() => void original(book)}>{t("Скачать оригинал")}</button>{/\.pdf$/i.test(book.name)&&(book.visualIndexVersion!==VISUAL_INDEX_VERSION||!book.imagesIndexed)&&<button disabled={busy} onClick={()=>void completeBook(book.id)}>{t('Полный индекс · текст и изображения')}</button>}{/\.pdf$/i.test(book.name)&&<button disabled={busy} onClick={()=>void ocrBook(book.id)}>{t('Распознать сканы книги · OCR')}</button>}{!book.vectorized && <button disabled={busy} onClick={() => void vectorize(book.id)}>{t("Продолжить смысловой индекс")}</button>}<button disabled={busy} onClick={() => { if (window.confirm(`Удалить «${book.name}» из браузерной библиотеки? Оригинал на компьютере останется.`))
        void deleteDocument(book.id).then(refresh).catch(() => setMessage(t("Не удалось удалить книгу."))); }}>{t("Удалить из браузера")}</button></div></article>)}</section><section id="library-search"><h2>{t("Поиск по библиотеке")}</h2><label>{t("Врачебный вопрос")}<input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Например: диагностика плеврального выпота")}/></label><p>{t('Задайте вопрос и нажмите «Ответить по книге». Приложение само подберёт текст, таблицы и изображения. Ручной выбор доступен при отключении автоматического подбора.')}</p><LibrarySuggestions onOptionsChange={setLibraryOptions} initialPage={focusPage} initialDocumentId={focusBook} query={query} disabled={answerBusy} onSelectionChange={(files,question)=>setSelected({query:question,files})}/><button type="button" disabled={answerBusy||!query.trim()||!libraryOptions.enabled||(!libraryOptions.automatic&&(selected.query!==query||!selected.files.length))} onClick={()=>void askBook()}>{t(answerBusy?'Готовим ответ по книге…':(libraryOptions.automatic?'Ответить по книге':'Ответить по выбранным страницам'))}</button><p>{t('Поиск и просмотр локальные. Ответ по выбранным страницам — платный запрос через OpenRouter после проверки отправляемых фрагментов.')}</p>{answerError&&<p role="alert">{answerError}</p>}{answer&&<article><h3>{t('Ответ по книге')}</h3><ReactMarkdown>{answer.text}</ReactMarkdown><ul>{answer.sources.map(source=><li key={source.number}>[{source.number}] <Link target="_blank" href={`/library?book=${encodeURIComponent(source.documentId)}&page=${source.page}`}>{source.title} · {t('Страница PDF')} {source.page}</Link></li>)}</ul></article>}</section></main>;
}
