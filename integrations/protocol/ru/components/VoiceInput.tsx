'use client'

import { useEffect, useRef, useState } from 'react'

interface VoiceInputProps {
  onTranscript: (text: string) => void
  /** Temporary recognition hypothesis, never persisted as a clinical fact. */
  onInterim?: (text: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
}

export default function VoiceInput({ onTranscript, onInterim, disabled = false, className = '', placeholder = '' }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<any>(null)
  const shouldListenRef = useRef(false)
  const pendingInterimRef = useRef('')
  const onTranscriptRef = useRef(onTranscript)
  const onInterimRef = useRef(onInterim)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])
  useEffect(() => { onInterimRef.current = onInterim }, [onInterim])

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSupported(false)
    }

    return () => {
      shouldListenRef.current = false
      recognitionRef.current?.stop?.()
      recognitionRef.current = null
    }
  }, [])

  const flushPending = () => {
    const pending = pendingInterimRef.current.trim()
    pendingInterimRef.current = ''
    onInterimRef.current?.('')
    if (pending) onTranscriptRef.current(pending)
  }

  const stopListening = () => {
    shouldListenRef.current = false
    flushPending()
    const recognition = recognitionRef.current
    recognitionRef.current = null
    try {
      recognition?.stop()
    } catch {
      // Сессия уже закрыта браузером.
    }
    setIsListening(false)
  }

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition || shouldListenRef.current) return

    const recognition = new SpeechRecognition()
    recognition.lang = 'ru-RU'
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.continuous = true

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onresult = (event: any) => {
      let finalChunk = ''
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = String(event.results[i][0]?.transcript || '')
        if (event.results[i].isFinal) finalChunk += text
        else interim += text
      }
      pendingInterimRef.current = interim
      onInterimRef.current?.(interim.trim())
      if (finalChunk.trim()) {
        pendingInterimRef.current = ''
        onInterimRef.current?.('')
        onTranscriptRef.current(finalChunk.trim())
      }
    }

    recognition.onerror = (event: any) => {
      const code = String(event?.error || '')
      if (code === 'no-speech' || code === 'aborted') return
      shouldListenRef.current = false
      setIsListening(false)
    }

    recognition.onend = () => {
      if (!shouldListenRef.current) {
        setIsListening(false)
        return
      }
      window.setTimeout(() => {
        if (!shouldListenRef.current || recognitionRef.current !== recognition) return
        try {
          recognition.start()
        } catch {
          shouldListenRef.current = false
          setIsListening(false)
        }
      }, 250)
    }

    recognitionRef.current = recognition
    shouldListenRef.current = true
    pendingInterimRef.current = ''
    recognition.start()
  }

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={() => (isListening ? stopListening() : startListening())}
      disabled={disabled}
      data-listening={isListening ? 'true' : 'false'}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 transition-all ${
        isListening
          ? '!bg-red-600 !text-white'
          : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
      } ${className} disabled:cursor-not-allowed disabled:opacity-50`}
      title={isListening ? 'Остановить запись' : (placeholder || 'Нажмите, чтобы продиктовать. Остановите запись сами.')}
      aria-pressed={isListening}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
        <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
        <line x1="12" x2="12" y1="19" y2="22"/>
      </svg>
      {isListening ? 'Стоп' : null}
    </button>
  )
}
