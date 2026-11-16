'use client'

import { useState, useRef, useEffect } from 'react'

// Recording is segmented without cloud calls until the physician stops the conversation.
// Each segment is a complete MediaRecorder file, not a potentially undecodable WebM slice.
const SEGMENT_SECONDS = 3 * 60
const TIMESLICE_MS = 1000
type TranscriptionData={transcript:string;duration:number;cost:number;costKnown:boolean}


interface AudioUploadProps {
  onTranscribe: (transcript: string, data?: { duration: number; cost: number }) => void
  accept?: string
  maxSize?: number // в MB
  provider?: 'polza' | 'openrouter'
  variant?: 'default' | 'cabinet'
}

export default function AudioUpload({ onTranscribe, accept = 'audio/*', maxSize = 2000, provider = 'polza', variant = 'default' }: AudioUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [lastAnalysis, setLastAnalysis] = useState<{ duration: number; cost: number; costKnown: boolean } | null>(null)
  const [hasPendingSegments, setHasPendingSegments] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const activeStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const segmentsRef = useRef<File[]>([])
  const segmentResultsRef = useRef<Record<number,TranscriptionData>>({})
  const rotatingRef = useRef(false)
  const recordingRef = useRef(false)
  const elapsedRef = useRef(0)
  const lastSegmentAtRef = useRef(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(false)
  const interruptedRef = useRef(false)

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  const stopTracks = () => {
    activeStreamRef.current?.getTracks().forEach(track => track.stop())
    activeStreamRef.current = null
  }

  useEffect(() => {
    mountedRef.current=true
    const cancelOnLeave = () => {
      mountedRef.current=false
      recordingRef.current = false
      rotatingRef.current = false
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = null
        if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
      }
      clearTimer()
      stopTracks()
      segmentsRef.current = []
      segmentResultsRef.current = {}
    }
    window.addEventListener('pagehide', cancelOnLeave)
    return () => {
      window.removeEventListener('pagehide', cancelOnLeave)
      // Leaving the panel or withdrawing consent is cancellation, never an audio upload.
      cancelOnLeave()
    }
  }, [])

  const transcribeFile = async (file: File): Promise<TranscriptionData> => {
    if (!file.size || file.size > maxSize * 1024 * 1024)
      throw Error(`Аудио пустое или превышает ${maxSize} МБ. Разделите запись на части.`)
    if (!file.type.startsWith('audio/') && !file.type.includes('webm') && !file.type.includes('octet-stream'))
      throw Error('Пожалуйста, выберите аудиофайл.')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('provider', provider)
    const response = await fetch('/api/transcribe', { method: 'POST', body: formData })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.success) throw Error(String(data?.error || 'Сервис не распознал запись.'))
    const transcript = String(data.transcript || '').trim()
    if (!transcript) throw Error('Получена пустая расшифровка. Проверьте аудио.')
    return {
      transcript,
      duration: Number(data.duration) || 0,
      cost: typeof data.cost==='number'&&Number.isFinite(data.cost)?data.cost:0,
      costKnown: data.costKnown === true,
    }
  }

  const handleFile = async (file: File) => {
    if (transcribing || recordingRef.current || hasPendingSegments) return
    setError(null)
    setTranscribing(true)
    try {
      const result=await transcribeFile(file)
      setLastAnalysis({duration:result.duration,cost:result.cost,costKnown:result.costKnown})
      onTranscribe(result.transcript, {duration:result.duration,cost:result.cost})
    } catch (error:any) {
      setError(error?.message||'Не удалось расшифровать запись.')
    } finally {
      setTranscribing(false)
    }
  }

  const transcribeSegments = async () => {
    const segments=segmentsRef.current
    if (!segments.length) {
      setError('Аудиозапись пустая. Попробуйте сделать новую запись.')
      setHasPendingSegments(false)
      return
    }
    setTranscribing(true)
    setError(null)
    try {
      const texts:string[]=[]
      let duration=0, cost=0, costKnown=true
      for(let index=0;index<segments.length;index++){
        let result=segmentResultsRef.current[index]
        if(!result){
          // A failed/uncertain request is never automatically retried: the physician
          // must click retry, because the provider may have already charged for it.
          result=await transcribeFile(segments[index])
          segmentResultsRef.current[index]=result
        }
        texts.push(result.transcript)
        duration+=result.duration
        cost+=result.cost
        costKnown=costKnown&&result.costKnown
      }
      // Only the full ordered transcript reaches the clinical draft.
      setLastAnalysis({duration,cost,costKnown})
      onTranscribe(texts.join('\n\n'),{duration,cost})
      segmentsRef.current=[]
      segmentResultsRef.current={}
      setHasPendingSegments(false)
    }catch(error:any){
      setHasPendingSegments(true)
      setError((error?.message||'Ошибка расшифровки')+' Запись сохранена только в текущей вкладке; можно повторить неготовую часть вручную, возможна повторная оплата.')
    }finally{
      setTranscribing(false)
    }
  }

  const attachRecorder = (stream:MediaStream,mimeType:string) => {
    let recorder:MediaRecorder
    try{recorder=mimeType?new MediaRecorder(stream,{mimeType}):new MediaRecorder(stream)}
    catch{recorder=new MediaRecorder(stream)}
    mediaRecorderRef.current=recorder
    chunksRef.current=[]
    recorder.ondataavailable=(event)=>{
      if(event.data.size)chunksRef.current.push(event.data)
    }
    recorder.onerror=()=>{
      interruptedRef.current=true
      recordingRef.current=false
      rotatingRef.current=false
      if(recorder.state==='recording')recorder.stop()
      setError('Микрофон прервался. Запись неполная: нельзя формировать из неё протокол как из полной беседы.')
    }
    recorder.onstop=()=>{
      const actualMime=recorder.mimeType||mimeType||'audio/webm'
      const blob=new Blob(chunksRef.current,{type:actualMime})
      if(blob.size){
        const ext=actualMime.includes('mp4')?'m4a':actualMime.includes('ogg')?'ogg':'webm'
        segmentsRef.current.push(new File([blob],`encounter-${segmentsRef.current.length+1}.${ext}`,{type:actualMime}))
      }
      chunksRef.current=[]
      if(rotatingRef.current&&recordingRef.current&&activeStreamRef.current){
        rotatingRef.current=false
        lastSegmentAtRef.current=elapsedRef.current
        try{attachRecorder(activeStreamRef.current,mimeType).start(TIMESLICE_MS)}
        catch{recordingRef.current=false;interruptedRef.current=true;setRecording(false);setError('Не удалось продолжить запись после разделения. Запись неполная.');stopTracks();clearTimer();setHasPendingSegments(segmentsRef.current.length>0)}
        return
      }
      recordingRef.current=false
      setRecording(false)
      stopTracks()
      clearTimer()
      setRecordingTime(0)
      setHasPendingSegments(segmentsRef.current.length>0)
      if(interruptedRef.current){
        setError('Запись прервана. Неполная беседа не отправлена на распознавание; удалите запись и повторите. Не используйте это как полный протокол.')
        return
      }
      void transcribeSegments()
    }
    return recorder
  }

  const startRecording = async () => {
    try {
      if (hasPendingSegments || segmentsRef.current.length || transcribing) {
        setError('Завершите или удалите предыдущую запись перед новой.')
        return
      }
      if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
        setError('Браузер не поддерживает доступ к микрофону (mediaDevices/getUserMedia недоступен).')
        return
      }

      const isLocalhost =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
      if (!window.isSecureContext && !isLocalhost) {
        setError('Для доступа к микрофону откройте сайт по HTTPS (или через localhost).')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      // Permission may resolve after the physician closes the panel or revokes consent.
      if (!mountedRef.current) {
        stream.getTracks().forEach(track=>track.stop())
        return
      }
      activeStreamRef.current = stream
      
      // Определяем поддерживаемый MIME тип
      const candidateMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg',
      ]
      const mimeType = candidateMimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || ''

      if (hasPendingSegments||segmentsRef.current.length) {
        setError('Сначала завершите или удалите прежнюю неготовую запись.')
        stream.getTracks().forEach(track=>track.stop())
        return
      }
      segmentsRef.current=[]
      segmentResultsRef.current={}
      rotatingRef.current=false
      interruptedRef.current=false
      recordingRef.current=true
      elapsedRef.current=0
      lastSegmentAtRef.current=0
      setError(null)
      setRecordingTime(0)
      setRecording(true)
      const recorder=attachRecorder(stream,mimeType)
      recorder.start(TIMESLICE_MS)
      clearTimer()
      timerRef.current=setInterval(()=>{
        elapsedRef.current+=1
        setRecordingTime(elapsedRef.current)
        if(elapsedRef.current-lastSegmentAtRef.current>=SEGMENT_SECONDS&&mediaRecorderRef.current?.state==='recording'){
          rotatingRef.current=true
          mediaRecorderRef.current.stop()
        }
      },1000)
    } catch (err: any) {
      const code = String(err?.name || '')
      if (code === 'NotAllowedError' || code === 'SecurityError') {
        setError('Доступ к микрофону запрещён. Разрешите микрофон для сайта в браузере и перезагрузите страницу.')
        return
      }
      if (code === 'NotFoundError' || code === 'DevicesNotFoundError') {
        setError('Микрофон не найден. Проверьте подключение устройства и настройки Windows.')
        return
      }
      if (code === 'NotReadableError') {
        setError('Микрофон занят другим приложением. Закройте Zoom/Teams/диктофон и повторите.')
        return
      }
      setError('Не удалось получить доступ к микрофону: ' + (err?.message || 'неизвестная ошибка'))
    }
  }

  const stopRecording = () => {
    // Stop is explicit: no cloud transcription happens until the recorder has closed.
    recordingRef.current=false
    rotatingRef.current=false
    if (mediaRecorderRef.current?.state==='recording') mediaRecorderRef.current.stop()
    setRecording(false)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const cabinet = variant === 'cabinet'

  return (
    <div className="w-full">
      <div
        className={`border-2 border-dashed text-center transition-colors ${
          cabinet ? 'rounded-none border-[#C9BBA8] bg-[#F7F1E8] p-5' : 'rounded-lg p-8'
        } ${
          dragActive
            ? 'border-[#9C4221] bg-[#F3E7D3]'
            : cabinet
              ? 'hover:border-[#9C4221]'
              : 'border-gray-300 hover:border-primary-400'
        } ${transcribing || recording ? 'opacity-70' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
          disabled={transcribing || recording || hasPendingSegments}
        />
        <div className="space-y-4">
          {transcribing ? (
            <>
              <div className={`mx-auto h-8 w-8 animate-spin rounded-full border-b-2 ${cabinet ? 'border-[#9C4221]' : 'border-primary-600'}`}></div>
              <div className={`font-semibold ${cabinet ? 'text-[#1C1612]' : 'text-primary-900'}`}>Идёт транскрипция...</div>
            </>
          ) : recording ? (
            <>
              <div className="relative">
                <div className="text-4xl animate-pulse">🔴</div>
              </div>
              <div className={`text-xl font-semibold ${cabinet ? 'text-[#1C1612]' : 'text-primary-900'}`}>
                Идёт запись... {formatTime(recordingTime)}
              </div>
              <button
                onClick={stopRecording}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white transition-colors font-semibold"
              >
                Остановить запись
              </button>
            </>
          ) : (
            <>
              {!cabinet && <div className="text-4xl">🎤</div>}
              
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <button
                  onClick={startRecording}
                  className={`px-6 py-3 font-semibold transition-colors ${
                    cabinet
                      ? 'bg-[#9C4221] text-[#FBF7F0] hover:bg-[#7C341A]'
                      : 'bg-red-500 text-white hover:bg-red-600 rounded-lg'
                  }`}
                >
                  Записать с микрофона
                </button>
                <span className={cabinet ? 'text-[#8A7563]' : 'text-gray-500'}>или</span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`px-6 py-3 font-semibold transition-colors ${
                    cabinet
                      ? 'border border-[#C9BBA8] text-[#1C1612] hover:border-[#9C4221]'
                      : 'rounded-lg bg-primary-500 text-white hover:bg-primary-600'
                  }`}
                >
                  Загрузить файл
                </button>
              </div>
              
              <p className={`mt-2 text-sm ${cabinet ? 'text-[#5C4636]' : 'text-gray-600'}`}>
                Можно перетащить аудиофайл сюда
              </p>
              
              <p className={`text-sm ${cabinet ? 'text-[#8A7563]' : 'text-gray-500'}`}>
                MP3, WAV, M4A, WEBM, OGG, FLAC · до {maxSize} МБ
              </p>
              <p className={`mt-2 border px-3 py-2 text-xs ${cabinet ? 'border-[#E4D8C8] bg-[#FBF7F0] text-[#6B5A32]' : 'rounded-lg border-amber-200 bg-amber-50 text-amber-600'}`}>
                Не диктуйте ФИО, адреса и паспортные данные. Запись уходит на внешнюю расшифровку.
              </p>
            </>
          )}
        </div>
      </div>
      {error && (
        <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          ❌ {error}
        </div>
      )}
      
      {hasPendingSegments&&!transcribing&&!recording&&(
        <div className="mt-3 flex flex-wrap items-center gap-2" role="alert">
          <p className="w-full text-sm text-amber-900">{interruptedRef.current?'Запись прервана, полный текст восстановить нельзя. Повторите приём или используйте другую подтверждённую запись.':'Часть беседы ещё не распознана. Неполный текст не передан в протокол. Запись временно хранится в этой вкладке.'}</p>
          {!interruptedRef.current&&<button type="button" className="border border-[#9C4221] px-3 py-2 text-sm" onClick={()=>void transcribeSegments()}>Повторить оставшуюся расшифровку (возможна повторная оплата)</button>}
          <button type="button" className="border border-gray-400 px-3 py-2 text-sm" onClick={()=>{segmentsRef.current=[];segmentResultsRef.current={};interruptedRef.current=false;setHasPendingSegments(false);setError(null)}}>Удалить неготовую запись</button>
        </div>
      )}
      {lastAnalysis && !transcribing && !recording && (
        <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span>⏱️ Длительность: <b>{formatTime(Math.round(lastAnalysis.duration))}</b></span>
            {lastAnalysis.costKnown?<span>💰 Стоимость сервиса: <b>{lastAnalysis.cost.toFixed(2)} у.е.</b></span>:<span>Фактическая стоимость не сообщена провайдером</span>}
          </div>
          <button 
            onClick={() => setLastAnalysis(null)}
            className="text-indigo-400 hover:text-indigo-600"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
