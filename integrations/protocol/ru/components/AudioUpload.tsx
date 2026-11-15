'use client'

import { useState, useRef, useEffect } from 'react'

interface AudioUploadProps {
  onTranscribe: (transcript: string, data?: { duration: number; cost: number }) => void
  accept?: string
  maxSize?: number // в MB
  autoStartOnMount?: boolean
  provider?: 'polza' | 'openrouter'
  variant?: 'default' | 'cabinet'
}

export default function AudioUpload({ onTranscribe, accept = 'audio/*', maxSize = 2000, autoStartOnMount = false, provider = 'polza', variant = 'default' }: AudioUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [lastAnalysis, setLastAnalysis] = useState<{ duration: number; cost: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  useEffect(() => {
    if (!autoStartOnMount) return
    // Небольшая задержка нужна, чтобы DOM успел отрисоваться перед запросом доступа к микрофону.
    const timer = setTimeout(() => {
      void startRecording()
    }, 150)
    return () => clearTimeout(timer)
  }, [autoStartOnMount])

  const handleFile = async (file: File) => {
    setError(null)
    
    console.log('📄 Обработка файла:', {
      name: file.name,
      type: file.type,
      size: file.size,
      sizeInMB: (file.size / 1024 / 1024).toFixed(2)
    })
    
    // Проверка размера
    if (file.size > maxSize * 1024 * 1024) {
      setError(`Файл слишком большой. Максимальный размер: ${maxSize}MB`)
      return
    }

    // Проверка типа
    if (!file.type.startsWith('audio/') && !file.type.includes('webm') && !file.type.includes('octet-stream')) {
      setError('Пожалуйста, загрузите аудиофайл')
      return
    }

    setTranscribing(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('provider', provider)
      
      console.log('🚀 Отправка на транскрипцию...')

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      
      console.log('📥 Ответ от API:', data)

      if (data.success) {
        console.log('✅ Транскрипция успешна')
        setLastAnalysis({ duration: data.duration, cost: data.cost })
        onTranscribe(data.transcript, { duration: data.duration, cost: data.cost })
      } else {
        console.error('❌ Ошибка транскрипции:', data.error)
        setError(data.error || 'Ошибка транскрипции')
      }
    } catch (err: any) {
      console.error('❌ Исключение при транскрипции:', err)
      setError(err.message || 'Произошла ошибка при транскрипции')
    } finally {
      setTranscribing(false)
    }
  }

  const startRecording = async () => {
    try {
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
      
      // Определяем поддерживаемый MIME тип
      const candidateMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg',
      ]
      const mimeType = candidateMimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || ''

      let mediaRecorder: MediaRecorder
      try {
        mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream)
      } catch {
        // Fallback для браузеров/драйверов, где options с mimeType могут падать.
        mediaRecorder = new MediaRecorder(stream)
      }
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const finalMimeType = mimeType || mediaRecorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: finalMimeType })
        
        // Создаем файл из blob с правильным MIME типом
        const extension = finalMimeType.includes('webm') ? 'webm' : 
                         finalMimeType.includes('mp4') ? 'mp4' : 
                         finalMimeType.includes('ogg') ? 'ogg' : 'webm'
        const file = new File([blob], `recording.${extension}`, { type: finalMimeType })
        
        console.log('📁 Создан файл для транскрипции:', {
          name: file.name,
          type: file.type,
          size: file.size,
          mimeType: finalMimeType
        })
        
        // Останавливаем все треки
        stream.getTracks().forEach(track => track.stop())
        
        // Отправляем на транскрипцию
        await handleFile(file)
        
        // Сброс таймера
        setRecordingTime(0)
        if (timerRef.current) {
          clearInterval(timerRef.current)
        }
      }

      mediaRecorder.start()
      setRecording(true)
      setError(null)
      
      // Запускаем таймер
      setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
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
          disabled={transcribing || recording}
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
      
      {lastAnalysis && !transcribing && !recording && (
        <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span>⏱️ Длительность: <b>{formatTime(Math.round(lastAnalysis.duration))}</b></span>
            <span>💰 Стоимость сервиса: <b>{lastAnalysis.cost.toFixed(2)} у.е.</b></span>
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
