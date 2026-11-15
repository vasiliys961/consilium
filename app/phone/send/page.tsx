"use client";

import {PhoneScanGuide} from '@/app/components/phone-scan-guide';
import {DocumentScanner} from '@/app/components/document-scanner';
import {useWorkspaceLanguage} from "@/app/components/workspace-language";
import { useEffect, useRef, useState } from "react";
import { direction, moduleLocale, parseLocale, type Locale } from "@/lib/locale";
import { text } from "@/lib/messages";
import { downsample, encodeWav, hearMissReason, hearWindow, wavBase64, wavDurationSeconds } from "@/packages/translator/wav";

const PHONE_BYTE_LIMIT = 8_000_000;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}

export default function PhoneSendPage() {
  const {t,setLanguage}=useWorkspaceLanguage();
  const [purpose,setPurpose]=useState('case');
  const sendPanel=useRef<HTMLElement>(null);
  const [dictation,setDictation]=useState('');
  const [connection,setConnection]=useState('');
  const [secure,setSecure]=useState(false);
  useEffect(()=>setSecure(window.isSecureContext),[]);
  const [locale, setLocale] = useState<Locale>("en");
  const [token, setToken] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl,setPreviewUrl]=useState('');
  useEffect(()=>{if(file)sendPanel.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[file]);
  useEffect(()=>{if(!file){setPreviewUrl('');return;}const url=URL.createObjectURL(file);setPreviewUrl(url);return()=>URL.revokeObjectURL(url);},[file]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("");
  const stopRef = useRef<((keep: boolean) => void) | null>(null);
  const copy = text(locale);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    const tokenFromUrl = params.get("token")?.trim() ?? "";
    const localeFromUrl = params.get("locale");
    const purposeFromUrl=params.get("purpose");if(purposeFromUrl)sessionStorage.setItem("doctor-opus-phone-purpose",purposeFromUrl);setPurpose(purposeFromUrl||sessionStorage.getItem("doctor-opus-phone-purpose")||"case");
    if (tokenFromUrl) window.sessionStorage.setItem("doctor-opus-phone-token", tokenFromUrl);
    if (localeFromUrl) window.sessionStorage.setItem("doctor-opus-phone-locale", localeFromUrl);
    setToken(tokenFromUrl || window.sessionStorage.getItem("doctor-opus-phone-token") || "");
    const selectedLocale=parseLocale(localeFromUrl || window.sessionStorage.getItem("doctor-opus-phone-locale"));
    setLocale(selectedLocale);setLanguage(selectedLocale==='ms'?'en':selectedLocale);
    if (tokenFromUrl || localeFromUrl) window.history.replaceState(null, "", "/phone/send");
  }, []);

  useEffect(()=>{if(!token)return;let active=true;const ping=async()=>{try{const response=await fetch('/api/phone/heartbeat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});if(active)setConnection(response.ok?'Связь с компьютером активна':'Сессия истекла или сервер перезапущен. Откройте QR на компьютере заново.');}catch{if(active)setConnection('Нет связи. Повторим автоматически после восстановления Wi-Fi.');}};void ping();const timer=setInterval(()=>void ping(),20000);const resume=()=>void ping();window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);return()=>{active=false;clearInterval(timer);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};},[token]);

  useEffect(() => () => stopRef.current?.(false), []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction(locale);
  }, [locale]);

  function keepFile(next: File | null) {
    stopRef.current?.(false);
    setFile(next);
    setStatus("");
  }

  async function toggleRecord() {
    if (stopRef.current) {
      stopRef.current(true);
      return;
    }
    setStatus("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silent = context.createGain();
      silent.gain.value = 0;
      const chunks: Float32Array[] = [];
      let samples = 0;
      let stopped = false;
      const rate = context.sampleRate;
      const finish = (keep: boolean) => {
        if (stopped) return;
        stopped = true;
        processor.disconnect();
        source.disconnect();
        silent.disconnect();
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
        stopRef.current = null;
        setRecording(false);
        if (!keep) return;
        const merged = new Float32Array(samples);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        const spoken = downsample(merged, rate, 16000);
        const audio = wavBase64(spoken, 16000);
        if (hearWindow(wavDurationSeconds(audio)) !== "short") {
          setStatus(hearMissReason(moduleLocale(locale)));
          return;
        }
        const bytes = encodeWav(spoken, 16000);
        setFile(new File([new Uint8Array(bytes)], "voice.wav", { type: "audio/wav" }));
      };
      processor.onaudioprocess = (event) => {
        const data = new Float32Array(event.inputBuffer.getChannelData(0));
        chunks.push(data);
        samples += data.length;
        if (samples >= rate * 20) finish(true);
      };
      source.connect(processor);
      processor.connect(silent);
      silent.connect(context.destination);
      stopRef.current = finish;
      setRecording(true);
      setFile(null);
    } catch {
      setStatus(copy.hearFailed);
      setRecording(false);
    }
  }

  async function send() {
    if (!file || !token || sending) return;
    if (file.size > PHONE_BYTE_LIMIT) {
      setStatus(copy.phoneLarge);
      return;
    }
    setSending(true);
    setStatus("");
    try {
      const dataUrl = await fileToDataUrl(file);
      const response = await fetch("/api/phone/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name: file.name, dataUrl }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setStatus(body?.error === "large" ? copy.phoneLarge : copy.phoneSendFailed);
        return;
      }
      setFile(null);
      setStatus(purpose==='inbox'?t('Файл отправлен в папку приёма на компьютере.'):copy.phoneSent);
    } catch {
      setStatus(copy.phoneSendFailed);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="phone-page">
      <h1>{purpose==='inbox'?t('Передача файлов на компьютер'):copy.phoneTitle}</h1>{purpose==='inbox'&&<p>{t('Файлы поступят в самостоятельную папку приёма. Случай или разбор создавать не нужно.')}</p>}<p role="status">{t(connection)}</p><PhoneScanGuide/><DocumentScanner disabled={sending} onPdf={token?pdf=>{keepFile(pdf);setStatus(token?'PDF готов. Нажмите «Отправить» для передачи на компьютер.':'PDF готов. Сохраните его кнопкой сканера; для передачи откройте эту страницу по QR компьютера.');}:undefined}/>
      {token&&file&&<section ref={sendPanel} aria-label={t('Готовый файл для отправки')} style={{padding:18,marginBlock:18,border:'2px solid #2b6048',borderRadius:10,background:'#edf5e9'}}><h2>{t('Готово к отправке')}</h2><p>{file.name}</p>{previewUrl&&file.type.startsWith('audio/')&&<audio controls src={previewUrl}/>} {previewUrl&&file.type.startsWith('video/')&&<video controls playsInline src={previewUrl} style={{maxWidth:'100%'}}/>}<button type="button" className="open" disabled={sending||recording} onClick={()=>void send()}>{sending?t('Отправляем файл…'):copy.phoneSend}</button></section>}
      {status&&<p role="status">{status}</p>}
      {token ? (
        <details open={purpose!=='inbox'}>
          <summary>{t('Передать готовый файл, фото или видео')}</summary>
          <label className="file">
            {copy.phonePick}
            <input
              type="file"
              onChange={(event) => {
                keepFile(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </label>
          <label className="file">
            {copy.phoneCamera}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                keepFile(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </label>
          <label className="file">{t("Записать или выбрать видео")}<input type="file" accept="video/*" capture="environment" onChange={event=>keepFile(event.target.files?.[0]??null)}/></label>
          <label className="file">{t("Добавить аудиозапись")}<input type="file" accept="audio/*,.m4a,.mp3,.wav" onChange={event=>keepFile(event.target.files?.[0]??null)}/></label>
          <section><h2>{t('Диктовка текстом')}</h2><p>{t('Нажмите микрофон на клавиатуре iPhone и продиктуйте текст в поле. Проверьте числа перед передачей. Это способ ввода текста, а не аудиозапись приложения.')}</p><textarea aria-label={t('Текст диктовки')} rows={5} value={dictation} onChange={event=>setDictation(event.target.value)}/><button disabled={!dictation.trim()||sending} onClick={()=>keepFile(new File([dictation],`dictation-${Date.now()}.txt`,{type:'text/plain'}))}>{t('Подготовить текст для передачи')}</button></section>{purpose!=='inbox'&&<p>{t('Голосовые аудиофрагменты для разбора — до 20 секунд. Более длинную диктовку удобнее передать текстом.')}</p>}{!secure && <p>{t("Прямая аудиозапись требует доверенного HTTPS. По текущей Wi-Fi HTTP-ссылке используйте диктовку текстом или готовую аудиозапись из «Файлов». Кнопка видео снимает именно видео; это отдельный режим.")}</p>}
          <button type="button" className="open" disabled={!secure} onClick={() => void toggleRecord()}>
            {recording ? copy.listening : copy.phoneRecord}
          </button>

        </details>
      ) : (
        <p>{copy.phoneNeed}</p>
      )}
    </main>
  );
}
