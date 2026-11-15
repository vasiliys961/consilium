'use client';
import { useWorkspaceLanguage } from "@/app/components/workspace-language";
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@/lib/locale';
export function PhoneImport({ onFile, locale = 'ru', disabled = false,purpose='case' }: {
    purpose?:'case'|'inbox';
    onFile: (file: File) => Promise<void>;
    locale?: Locale;
    disabled?: boolean;
}) {
 const {t}=useWorkspaceLanguage();
 const storageKey=purpose==='inbox'?'concilium-phone-inbox-session':'concilium-phone-session';
    const [token, setToken] = useState('');
    const [link, setLink] = useState('');
    const [qr, setQr] = useState('');
    const [showQr,setShowQr]=useState(false);
    const [message, setMessage] = useState('');
    const blocked=useRef(disabled);blocked.current=disabled;
    const receiver = useRef(onFile);
    receiver.current = onFile;
    useEffect(()=>{const saved=sessionStorage.getItem(storageKey);if(saved)try{const value=JSON.parse(saved);setToken(value.token);setLink(value.link);setQr(value.qr);setMessage('Подключение к телефону восстановлено.');}catch{/* Invalid local session is ignored. */}},[storageKey]);
    useEffect(() => {
        if (!token)
            return;
        let stopped = false;
        let since = Number(sessionStorage.getItem('concilium-phone-since:'+token))||0;
        let pulling = false;
        const poll = async () => { if (stopped || pulling || blocked.current)
            return; pulling = true; try {
            const response = await fetch(`/api/phone/events?token=${encodeURIComponent(token)}&since=${since}`);
            const data = await response.json();
            if (!response.ok) {
                sessionStorage.removeItem(storageKey);setToken('');setQr('');setMessage('Сессия телефона недоступна или истекла после перезапуска сервера. Откройте новую.');
                return;
            }
            for (const item of data.files ?? []) {
                if (stopped)
                    return;
                const match = /^data:([^;,]+);base64,(.*)$/.exec(item.dataUrl);
                if (!match)
                    continue;
                const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
                await receiver.current(new File([bytes], item.name, { type: match[1] }));
                since = Math.max(since, item.id);sessionStorage.setItem('concilium-phone-since:'+token,String(since));
                setMessage(purpose==='inbox'?'Файл с телефона сохранён в папке приёма.':'Материал с телефона добавлен в текущий случай.');
            }
        }
        catch {
            setMessage('Связь с телефоном прервалась. Повторяем подключение.');
        }
        finally {
            pulling = false;
        } };
        void poll();
        const timer = setInterval(() => void poll(), 2500);
        return () => { stopped = true; clearInterval(timer); };
    }, [token,storageKey,purpose]);
    useEffect(()=>{if(!token||!link)return;let active=true;try{const url=new URL(link),params=new URLSearchParams(url.hash.slice(1));if(params.get('locale')===locale&&params.get('purpose')===purpose)return;params.set('locale',locale);params.set('purpose',purpose);url.hash=params.toString();const next=url.toString();void import('qrcode').then(async loaded=>{const image=await loaded.toDataURL(next,{width:200,margin:1});if(active){setLink(next);setQr(image);sessionStorage.setItem(storageKey,JSON.stringify({token,link:next,qr:image}));}}).catch(()=>{});}catch{}return()=>{active=false;};},[token,link,locale,purpose,storageKey]);
    async function open() { if(token){setShowQr(value=>!value);setMessage('Связь активна. Эта же ссылка работает при переходах между разделами и автоматически восстанавливается после краткого обрыва сети.');return;}try {
        const response = await fetch('/api/phone/session', { method: 'POST' });
        const data = await response.json();
        if (!response.ok || !data.token)
            throw Error();
        if (!data.phoneOrigin) {
            setMessage(data.connectionHint || 'Локальная сеть недоступна');
            return;
        }
        const url = `${data.phoneOrigin}/phone/send#token=${encodeURIComponent(data.token)}&locale=${locale}&purpose=${purpose}`;
        const loaded = await import('qrcode');
        setQr(await loaded.toDataURL(url, { width: 200, margin: 1 }));
        sessionStorage.setItem(storageKey,JSON.stringify({token:data.token,link:url,qr:await loaded.toDataURL(url,{width:200,margin:1})}));
        setLink(url);
        setToken(data.token);setShowQr(true);
        setMessage('Откройте ссылку или QR на телефоне в той же Wi-Fi сети. Это ограниченный вход для передачи файлов, без доступа к клиническим случаям.');
    }
    catch {
        setMessage('Не удалось открыть передачу с телефона.');
    } }
    return <section style={{ marginTop: 20 }}><button type="button" disabled={disabled} onClick={() => void open()}>{t(token?'Телефон подключён · показать QR / переподключить':'Телефон · камера · голос · видео · сканер')}</button>{qr&&showQr&&<div><img src={qr} width={200} height={200} alt={t("QR для передачи с телефона")}/><p><a href={link} target="_blank" rel="noreferrer">{t("Открыть страницу передачи")}</a></p></div>}{message && <p role="status">{t(message)}</p>}</section>;
}
