'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import ConciliumProtocolBridge from '@/components/ConciliumProtocolBridge'
import AudioUpload from '@/components/AudioUpload'
import VoiceInput from '@/components/VoiceInput'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } from 'docx'
import { saveAs } from 'file-saver'
import { DEFAULT_TEMPLATES, ProtocolTemplate } from '@/lib/protocol-templates'
import { UNIVERSAL_SPECIALIST_TEMPLATES } from '@/lib/prompts'
import { handleSSEStream } from '@/lib/streaming-utils'
import { logUsage } from '@/lib/simple-logger'
import { calculateCost } from '@/lib/cost-calculator'
import { saveDocument, getDocumentChunks, searchLibraryLocal } from '@/lib/library-db'
import { anonymizeText } from '@/lib/anonymization'
import { markdownToPlainText } from '@/lib/markdown-to-plain-text'
import mammoth from 'mammoth'

declare global {
  interface Window {
    pdfjsLib: any
  }
}

const PROTOCOL_DRAFT_KEY = 'protocol_draft'
const PROTOCOL_DRAFT_URL_PARAM = 'draftText'
const PROTOCOL_DRAFT_WINDOW_NAME_PREFIX = 'secure_protocol_draft:'
const PROTOCOL_TEMPLATE_RAG_KEY = 'protocol_template_rag_doc_id'
const ECG_FUNCTIONAL_TEMPLATE_ID = 'ecg-functional-conclusion'
const PROTOCOL_GPT52_MODEL = 'openai/gpt-6.1-sol'
const PROTOCOL_MODEL_IDS = {
  opus: 'anthropic/claude-opus-5.5',
  sonnet: 'anthropic/claude-sonnet-5.5',
  grok45: 'x-ai/grok-4.5',
  gemini: 'google/gemini-3.1-pro-preview',
} as const
type LlmGateway = 'polza' | 'openrouter'
type ProtocolModel = 'sonnet' | 'opus' | 'gemini' | 'gpt52' | 'grok45'

type InteractionSeverity = 'minor' | 'moderate' | 'major'

type DrugInteractionView = {
  pair: [string, string]
  severity: InteractionSeverity
  mechanism: string
  recommendation: string
  explanation: string
}

function chunkTemplateForRag(content: string, maxChunkLength: number = 1200): string[] {
  const clean = content.replace(/\r\n/g, '\n').trim()
  if (!clean) return []

  const parts = clean
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let buffer = ''

  for (const part of parts) {
    if (!buffer) {
      buffer = part
      continue
    }

    const candidate = `${buffer}\n\n${part}`
    if (candidate.length <= maxChunkLength) {
      buffer = candidate
    } else {
      chunks.push(buffer)
      buffer = part
    }
  }

  if (buffer) chunks.push(buffer)
  return chunks.slice(0, 10)
}

export default function ProtocolPage() {
  const [rawText, setRawText] = useState('')
  const [showConversationRecorder, setShowConversationRecorder] = useState(false)
  const [ambientAudioConsent, setAmbientAudioConsent] = useState(false)
  useEffect(()=>{if(new URLSearchParams(window.location.search).get('conciliumAmbient')==='1')setShowConversationRecorder(true);},[]);
  const [conversationTranscriptText, setConversationTranscriptText] = useState('')
  const [recordedDraftText, setRecordedDraftText] = useState('')
  const [draftFromConversationLoading, setDraftFromConversationLoading] = useState(false)
  const [draftFromConversationError, setDraftFromConversationError] = useState('')
  const [draftFromConversationModel, setDraftFromConversationModel] = useState<string | null>(null)
  const [protocol, setProtocol] = useState('')
  const [editingProtocol, setEditingProtocol] = useState(false)
  const [loading, setLoading] = useState(false)
  const [useStreaming, setUseStreaming] = useState(true)
  const [stabilityMode, setStabilityMode] = useState(false)
  const [model, setModel] = useState<ProtocolModel>('gpt52')
  const [gateway, setGateway] = useState<LlmGateway>('openrouter')
  const [currentCost, setCurrentCost] = useState<number>(0)
  const [resolvedModel, setResolvedModel] = useState<string | null>(null)
  const [interactionLoading, setInteractionLoading] = useState(false)
  const [interactionError, setInteractionError] = useState('')
  const [interactionDetectorModel, setInteractionDetectorModel] = useState<string | null>(null)
  const [interactionExplainerModel, setInteractionExplainerModel] = useState<string | null>(null)
  const [interactionResults, setInteractionResults] = useState<DrugInteractionView[]>([])
  const [interactionChecked, setInteractionChecked] = useState(false)
  
  // Состояния для специалистов и шаблонов
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(DEFAULT_TEMPLATES[0].id)
  const [specialistName, setSpecialistName] = useState(DEFAULT_TEMPLATES[0].specialist)
  const [customTemplate, setCustomTemplate] = useState(DEFAULT_TEMPLATES[0].content)
  const [isEditingTemplate, setIsEditingTemplate] = useState(false)
  const [templateRagDocId, setTemplateRagDocId] = useState<string | null>(null)
  const [isTemplateLocked, setIsTemplateLocked] = useState(false)
  const [strictTemplateMode, setStrictTemplateMode] = useState(false)
  const protocolModelRecommendation = useMemo<{
    model: ProtocolModel
    title: string
    reason: string
  } | null>(() => {
    const sourceText = `${rawText}\n${conversationTranscriptText}`.trim()
    const sourceLength = sourceText.length
    const hasCriticalSignals =
      /(инфаркт|инсульт|sepsis|сепсис|шок|онколог|тромб|декомпенсац|кровотеч|дыхательн)/i.test(sourceText)

    if (!sourceText) {
      return {
        model: 'gpt52',
        title: 'Быстрый старт протокола',
        reason: 'Для первичного черновика обычно достаточно самой быстрой модели.',
      }
    }

    if (stabilityMode) {
      return {
        model: 'gpt52',
        title: 'Режим стабильности',
        reason: 'Для слабых ПК и нестабильной сети чаще лучше быстрый и предсказуемый режим.',
      }
    }

    if (hasCriticalSignals || sourceLength > 7000) {
      return {
        model: 'opus',
        title: 'Сложный клинический кейс',
        reason: 'При тяжелом/объемном кейсе полезнее максимально глубокая клиническая логика.',
      }
    }

    return {
      model: 'sonnet',
      title: 'Баланс качества и структуры',
      reason: 'Для среднего по сложности кейса часто дает более детальный разбор без лишней задержки.',
    }
  }, [conversationTranscriptText, rawText, stabilityMode])
  const protocolModelLabelMap: Record<ProtocolModel, string> = {
    gpt52: 'GPT-6.1 Sol',
    grok45: 'Grok 4.5',
    sonnet: 'Sonnet 5.5',
    opus: 'Opus 5.5',
    gemini: 'Gemini 3.8',
  }

  // Универсальные промпты
  const [selectedUniversalKey, setSelectedUniversalKey] = useState<string>('')
  const [universalPrompt, setUniversalPrompt] = useState<string>('')
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const conversationRecorderRef = useRef<HTMLDivElement | null>(null)
  const protocolRef = useRef('')
  protocolRef.current = protocol

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.pdfjsLib) {
      const script = document.createElement('script')
      script.src = '/pdfjs/pdf.min.js'
      script.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js'
          setPdfJsLoaded(true)
        }
      }
      script.onerror = () => {
        console.warn('⚠️ PDF.js не удалось загрузить на странице протоколов')
      }
      document.head.appendChild(script)
    } else if (window.pdfjsLib) {
      setPdfJsLoaded(true)
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('protocol-llm-provider')
    setGateway('openrouter')
  }, [])

  useEffect(() => {
    if (!showConversationRecorder) return
    // Важно для UX: блок записи открывается рядом с кнопкой и сразу попадает в видимую область.
    conversationRecorderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showConversationRecorder])

  // Загрузка пользовательского шаблона при старте
  useEffect(() => {
    const saved = localStorage.getItem('user_protocol_template')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setCustomTemplate(parsed.template)
        setSpecialistName(parsed.name || specialistName)
        setIsEditingTemplate(true)
        setIsTemplateLocked(Boolean(parsed.isTemplateLocked))
        if (parsed.ragDocId) {
          setTemplateRagDocId(parsed.ragDocId)
        }
      } catch (e) {}
    }
    const ragDocId = localStorage.getItem(PROTOCOL_TEMPLATE_RAG_KEY)
    if (ragDocId) setTemplateRagDocId(ragDocId)
    if (localStorage.getItem('protocol-strict-template') === '1') setStrictTemplateMode(true)
  }, [])

  // Импорт черновика протокола (например, из анализа ЭКГ)
  useEffect(() => {
    if(new URLSearchParams(location.search).has('conciliumSession'))return
    const raw = localStorage.getItem(PROTOCOL_DRAFT_KEY)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as { kind?: string; rawText?: string; templateId?: string }
      if (!parsed?.rawText) return

      // Сразу подставляем текст и нужный шаблон, затем очищаем черновик,
      // чтобы повторно не подставлялся при обновлении страницы.
      setRawText(parsed.rawText)
      const tpl = DEFAULT_TEMPLATES.find(t => t.id === (parsed.templateId || ''))
      if (tpl) {
        applyTemplate(tpl, { force: true })
      }
    } catch (e) {
      // ignore
    } finally {
      localStorage.removeItem(PROTOCOL_DRAFT_KEY)
    }
  }, [])

  // Импорт черновика из URL (например, переход с внешнего STT-потока -> /protocol?draftText=...)
  useEffect(() => {
    if (typeof window === 'undefined') return

    if(new URLSearchParams(location.search).has('conciliumSession'))return
    // Приоритет 1: перенос через window.name (работает между localhost:8000 и localhost:3000).
    const draftFromWindowName = window.name?.startsWith(PROTOCOL_DRAFT_WINDOW_NAME_PREFIX)
      ? window.name.slice(PROTOCOL_DRAFT_WINDOW_NAME_PREFIX.length)
      : ''
    if (draftFromWindowName.trim()) {
      setRawText(draftFromWindowName)
      window.name = ''
      return
    }

    // Приоритет 2: fallback через query param.
    const url = new URL(window.location.href)
    const encoded = url.searchParams.get(PROTOCOL_DRAFT_URL_PARAM)
    if (!encoded) return

    try {
      if (encoded.trim()) {
        setRawText(encoded)
      }
    } catch {
      // ignore malformed query
    } finally {
      // Чистим URL, чтобы текст не вставлялся повторно при refresh и не светился в адресной строке.
      url.searchParams.delete(PROTOCOL_DRAFT_URL_PARAM)
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  const handleUniversalSelect = (key: string) => {
    setSelectedUniversalKey(key)
    if (key && UNIVERSAL_SPECIALIST_TEMPLATES[key]) {
      const tpl = UNIVERSAL_SPECIALIST_TEMPLATES[key]
      setUniversalPrompt(tpl.prompt)
      setSpecialistName(tpl.name)
      
      // Если у специалиста есть своя структура, подставляем её
      if (tpl.structure && !isTemplateLocked) {
        setCustomTemplate(tpl.structure)
      }
    } else {
      setUniversalPrompt('')
    }
  }

  const handleSaveAsDefault = () => {
    const data = {
      template: customTemplate,
      name: specialistName,
      ragDocId: templateRagDocId,
      isTemplateLocked
    }
    localStorage.setItem('user_protocol_template', JSON.stringify(data))
    alert('Шаблон сохранен как ваш персональный стандарт!')
  }

  const readTextFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => resolve((event.target?.result as string) || '')
      reader.onerror = () => reject(new Error('Ошибка чтения текстового файла'))
      reader.readAsText(file)
    })

  const normalizeInlineText = (value: string): string =>
    value.replace(/\s+/g, ' ').trim()

  const escapeMdCell = (value: string): string =>
    normalizeInlineText(value).replace(/\|/g, '\\|')

  const tableToMarkdown = (table: HTMLTableElement): string => {
    const rows = Array.from(table.querySelectorAll('tr'))
      .map((row) =>
        Array.from(row.querySelectorAll('th, td')).map((cell) => escapeMdCell(cell.textContent || ''))
      )
      .filter((cells) => cells.length > 0)

    if (rows.length === 0) return ''

    const firstRow = rows[0]
    const headerIsExplicit = Array.from(rows[0].length ? table.querySelectorAll('tr')[0].querySelectorAll('th') : []).length > 0
    const columnCount = Math.max(...rows.map((r) => r.length), firstRow.length)
    const normalizeRow = (row: string[]) =>
      [...row, ...new Array(Math.max(0, columnCount - row.length)).fill('')].slice(0, columnCount)

    const header = normalizeRow(firstRow)
    const bodyRows = headerIsExplicit ? rows.slice(1).map(normalizeRow) : rows.slice(1).map(normalizeRow)
    const ensuredBodyRows = bodyRows.length > 0 ? bodyRows : [new Array(columnCount).fill('')]

    const headerLine = `| ${header.join(' | ')} |`
    const separatorLine = `| ${new Array(columnCount).fill('---').join(' | ')} |`
    const bodyLines = ensuredBodyRows.map((row) => `| ${row.join(' | ')} |`)

    return [headerLine, separatorLine, ...bodyLines].join('\n')
  }

  const htmlToTemplateText = (html: string): string => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const blocks: string[] = []

    const pushBlock = (text: string) => {
      const normalized = text.replace(/\u00A0/g, ' ').replace(/\s+\n/g, '\n').trim()
      if (normalized) blocks.push(normalized)
    }

    const walk = (element: Element) => {
      const tag = element.tagName.toLowerCase()

      if (tag === 'table') {
        const mdTable = tableToMarkdown(element as HTMLTableElement)
        pushBlock(mdTable)
        return
      }

      if (tag === 'ul') {
        const items = Array.from(element.querySelectorAll(':scope > li'))
          .map((li) => normalizeInlineText(li.textContent || ''))
          .filter(Boolean)
          .map((item) => `- ${item}`)
        pushBlock(items.join('\n'))
        return
      }

      if (tag === 'ol') {
        const items = Array.from(element.querySelectorAll(':scope > li'))
          .map((li) => normalizeInlineText(li.textContent || ''))
          .filter(Boolean)
          .map((item, index) => `${index + 1}. ${item}`)
        pushBlock(items.join('\n'))
        return
      }

      if (/^h[1-6]$/.test(tag)) {
        const level = Number(tag.slice(1))
        const text = normalizeInlineText(element.textContent || '')
        if (text) pushBlock(`${'#'.repeat(level)} ${text}`)
        return
      }

      if (tag === 'p') {
        const text = normalizeInlineText(element.textContent || '')
        if (text) pushBlock(text)
        return
      }

      const children = Array.from(element.children)
      if (children.length === 0) {
        const text = normalizeInlineText(element.textContent || '')
        if (text) pushBlock(text)
        return
      }

      children.forEach(walk)
    }

    Array.from(doc.body.children).forEach(walk)
    return blocks.join('\n\n').trim()
  }

  const extractWordTemplate = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const htmlResult = await mammoth.convertToHtml({ arrayBuffer })
      const structured = htmlToTemplateText(htmlResult.value || '')
      if (structured) return structured

      const fallbackText = await mammoth.extractRawText({ arrayBuffer })
      return fallbackText.value?.trim() || ''
    } catch (error) {
      console.error('Word extract error:', error)
      throw new Error('Не удалось прочитать Word-файл. Для .doc лучше использовать .docx.')
    }
  }

  const extractPdfTemplate = async (file: File): Promise<string> => {
    if (!pdfJsLoaded || !window.pdfjsLib) {
      throw new Error('PDF модуль еще загружается. Подождите 2-3 секунды и повторите.')
    }

    const pdfjs = window.pdfjsLib
    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer, verbosity: 0 })
    const pdf = await loadingTask.promise
    const maxPages = Math.min(pdf.numPages, 15)
    const pages: string[] = []

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const items = (textContent.items || []) as Array<{ str?: string }>
      const pageText = items
        .map((item) => item.str || '')
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim()

      if (pageText) {
        pages.push(`=== Страница ${pageNum} ===\n${pageText}`)
      }
    }

    return pages.join('\n\n')
  }

  const extractTemplateContent = async (file: File): Promise<string> => {
    const name = file.name.toLowerCase()

    if (name.endsWith('.txt') || file.type.startsWith('text/')) {
      return readTextFile(file)
    }

    if (name.endsWith('.docx') || name.endsWith('.doc')) {
      return extractWordTemplate(file)
    }

    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      return extractPdfTemplate(file)
    }

    throw new Error('Поддерживаются только .txt, .doc/.docx и .pdf')
  }

  const handleLoadFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    void (async () => {
      const content = (await extractTemplateContent(file)).trim()
      if (!content) {
        throw new Error('Файл прочитан, но шаблон пустой. Проверьте формат и содержимое.')
      }

      setCustomTemplate(content)
      setIsEditingTemplate(true)
      setIsTemplateLocked(true)

      const chunks = chunkTemplateForRag(content)
      if (chunks.length === 0) return

      const docId = `protocol-template-${Date.now()}`
      await saveDocument(
        {
          id: docId,
          name: `Протокол-шаблон: ${file.name}`,
          size: file.size,
          uploaded_at: new Date().toISOString(),
          chunksCount: chunks.length,
        },
        chunks
      )
      setTemplateRagDocId(docId)
      localStorage.setItem(PROTOCOL_TEMPLATE_RAG_KEY, docId)
      alert('Шаблон загружен и сохранен в библиотеку как RAG-образец.')
    })().catch((error) => {
      console.error('Template load error:', error)
      alert(error?.message || 'Не удалось загрузить файл шаблона.')
    }).finally(() => {
      e.target.value = ''
    })
  }

  const handleGenerateProtocol = async () => {
    const previousProtocol=protocol;
    if (!rawText.trim()) return

    setLoading(true)
    setProtocol('')
    setCurrentCost(0)
    setResolvedModel(null)
    setInteractionResults([])
    setInteractionError('')
    setInteractionDetectorModel(null)
    setInteractionExplainerModel(null)
    setInteractionChecked(false)

    const modelsMap: Record<string, string> = {
      'opus': PROTOCOL_MODEL_IDS.opus,
      'sonnet': PROTOCOL_MODEL_IDS.sonnet,
      'gpt52': PROTOCOL_GPT52_MODEL,
      'grok45': PROTOCOL_MODEL_IDS.grok45,
      'gemini': PROTOCOL_MODEL_IDS.gemini
    };

    const finalModel = modelsMap[model] || PROTOCOL_MODEL_IDS.sonnet;
    const safeRawText = rawText.trim()
    const effectiveUseStreaming = stabilityMode ? false : useStreaming

    try {
      let ragExamples: string[] = []
      if (templateRagDocId) {
        // Для пользовательского шаблона берем больше чанков, чтобы модель видела
        // не только "шапку", но и блоки диагноза/лечения/результата.
        ragExamples = await getDocumentChunks(templateRagDocId, stabilityMode ? 4 : 8)
      } else if (safeRawText) {
        ragExamples = await searchLibraryLocal(`${specialistName} ${safeRawText}`, 3)
      }

      const payload = {
        rawText: safeRawText,
        useStreaming: effectiveUseStreaming,
        model: model,
        templateId: selectedTemplateId,
        customTemplate: customTemplate,
        specialistName: specialistName,
        // Добавляем универсальный промпт, если он есть
        universalPrompt: universalPrompt,
        ragExamples,
        strictTemplateMode,
        speedProfile: stabilityMode ? 'fast' : 'standard',
        provider: gateway,
      };

      if (effectiveUseStreaming) {
        const response = await fetch('/api/protocol', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
        const streamResolvedModel = response.headers.get('x-resolved-model')
        if (streamResolvedModel) {
          setResolvedModel(streamResolvedModel)
        }

        await handleSSEStream(response, {
          onChunk: (text) => {
            setProtocol(prev => prev + text)
          },
          onUsage: (usage) => {
            console.log('📊 [PROTOCOL STREAMING] Получена точная стоимость:', usage.total_cost)
            setCurrentCost(usage.total_cost)
            const effectiveUsageModel = usage.model || streamResolvedModel || finalModel
            setResolvedModel(effectiveUsageModel)
            
            logUsage({
              section: 'protocols',
              model: effectiveUsageModel,
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              specialty: specialistName // Передаем специальность для аудита
            });
          },
          onComplete: (finalText) => {
            setProtocol(
              finalText
                .split('\n')
                .filter((line) => !/^\s*(Rp\.?\s*:|D\.?\s*t\.?\s*d\b)/i.test(line.trim()))
                .join('\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim()
            )
          }
        })
      } else {
        const response = await fetch('/api/protocol', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await response.json()
        if (data.success) {
          setProtocol(data.protocol)
          const effectiveResolvedModel = data.resolvedModel || finalModel
          setResolvedModel(effectiveResolvedModel)
          const serverUsage = data.usage
          if (serverUsage && (serverUsage.prompt_tokens || serverUsage.completion_tokens || serverUsage.total_cost)) {
            const usageCost = Number(serverUsage.total_cost || 0)
            setCurrentCost(usageCost > 0 ? usageCost : calculateCost(
              Number(serverUsage.prompt_tokens || 0),
              Number(serverUsage.completion_tokens || 0),
              effectiveResolvedModel
            ).totalCostUnits)

            logUsage({
              section: 'protocols',
              model: effectiveResolvedModel,
              inputTokens: Number(serverUsage.prompt_tokens || 0),
              outputTokens: Number(serverUsage.completion_tokens || 0),
              specialty: specialistName
            });
          } else {
            const inputTokens = Math.ceil(rawText.length / 4) + 1000;
            const outputTokens = Math.ceil(data.protocol.length / 4);
            const costInfo = calculateCost(inputTokens, outputTokens, effectiveResolvedModel);
            setCurrentCost(costInfo.totalCostUnits);
            logUsage({
              section: 'protocols',
              model: effectiveResolvedModel,
              inputTokens,
              outputTokens,
              specialty: specialistName
            });
          }
        }
        else setProtocol(`Ошибка: ${data.error}`)
      }
    } catch (err: any) {
      if(err?.name==='PrivacyReviewCancelled'){setProtocol(previousProtocol);return;}
      setProtocol(`Ошибка: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Функция применения шаблона
  const applyTemplate = (tpl: ProtocolTemplate, options?: { force?: boolean }) => {
    setSelectedTemplateId(tpl.id)
    setSpecialistName(tpl.specialist)
    if (!isTemplateLocked || options?.force) {
      setCustomTemplate(tpl.content)
    }
    // Не смешиваем универсальные директивы с выбранным шаблоном
    setSelectedUniversalKey('')
    setUniversalPrompt('')
  }

  const handleExportToDocx = async () => {
    if (!protocol) return
    try {
      const lines = protocol.split('\n')
      const paragraphs: any[] = []
      let inConsent = false
      for (const line of lines) {
        if (/согласие пациента/i.test(line)) inConsent = true
        const runSize = inConsent ? 16 : undefined
        if (!line.trim()) {
          paragraphs.push(new Paragraph({ text: '' }))
          continue
        }
        if (line.startsWith('# ')) {
          paragraphs.push(new Paragraph({ text: line.replace('# ', ''), heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }))
        } else if (line.startsWith('## ')) {
          paragraphs.push(new Paragraph({ text: line.replace('## ', ''), heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }))
        } else if (line.startsWith('### ')) {
          paragraphs.push(new Paragraph({ text: line.replace('### ', ''), heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 80 } }))
        } else {
          const textRuns: TextRun[] = []
          const boldRegex = /\*\*(.*?)\*\*/g
          let lastIndex = 0
          let match
          while ((match = boldRegex.exec(line)) !== null) {
            if (match.index > lastIndex) textRuns.push(new TextRun({ text: line.substring(lastIndex, match.index), size: runSize }))
            textRuns.push(new TextRun({ text: match[1], bold: true, size: runSize }))
            lastIndex = match.index + match[0].length
          }
          if (lastIndex < line.length) textRuns.push(new TextRun({ text: line.substring(lastIndex), size: runSize }))
          paragraphs.push(new Paragraph({
            children: textRuns.length > 0 ? textRuns : [new TextRun({ text: line, size: runSize })],
            spacing: { after: inConsent ? 40 : 120 }
          }))
        }
      }
      const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] })
      const blob = await Packer.toBlob(doc)
      const datePart = new Date().toISOString().split('T')[0]
      const filePrefix = selectedTemplateId === ECG_FUNCTIONAL_TEMPLATE_ID ? 'Протокол_ЭКГ' : 'Протокол_приема'
      saveAs(blob, `${filePrefix}_${datePart}.docx`)
    } catch (err: any) {
      alert('Ошибка экспорта: ' + err.message)
    }
  }

  const handleCopyProtocol = async () => {
    if (!protocol) return
    const plainText = markdownToPlainText(protocol)
    await navigator.clipboard.writeText(plainText)
    alert('Исправленный текст скопирован')
  }

  const handleShareProtocol = async () => {
    if (!protocol.trim()) return
    const plainText = markdownToPlainText(protocol)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Протокол осмотра', text: plainText })
        return
      } catch (error: any) {
        if (error?.name === 'AbortError') return
      }
    }
    await navigator.clipboard.writeText(plainText)
    alert('На этом устройстве нет окна «Поделиться». Исправленный текст скопирован, его можно отправить.')
  }

  const handlePrintProtocol = () => {
    if (!protocol.trim()) return
    const plainText = markdownToPlainText(protocol)
    const consentAt = plainText.search(/согласие пациента/i)
    const mainText = consentAt >= 0 ? plainText.slice(0, consentAt).trimEnd() : plainText
    const consentText = consentAt >= 0 ? plainText.slice(consentAt).trim() : ''
    const html = `<!doctype html><html lang="ru"><head><meta charset="UTF-8" /><title>Протокол осмотра</title>
      <style>
        body { margin: 16mm; font-family: "Times New Roman", serif; color: #1c1612; font-size: 14px; line-height: 1.45; }
        h1 { font-size: 20px; font-weight: 600; margin: 0 0 12px; }
        pre { white-space: pre-wrap; font-family: inherit; margin: 0; }
        .consent { margin-top: 14px; font-size: 9px; line-height: 1.3; color: #444; }
      </style></head><body><h1>Протокол осмотра</h1><pre>${escapeHtml(mainText)}</pre>${consentText ? `<pre class="consent">${escapeHtml(consentText)}</pre>` : ''}</body></html>`
    const win = window.open('about:blank', '_blank', 'width=900,height=1000')
    if (!win) {
      alert('Разрешите всплывающие окна, чтобы открыть печать.')
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  const getSeverityUi = (severity: InteractionSeverity) => {
    if (severity === 'major') {
      return {
        label: 'Высокий риск',
        badgeClass: 'bg-red-100 text-red-700 border-red-200'
      }
    }
    if (severity === 'moderate') {
      return {
        label: 'Умеренный риск',
        badgeClass: 'bg-amber-100 text-amber-700 border-amber-200'
      }
    }
    return {
      label: 'Низкий риск',
      badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200'
    }
  }

  const handleAnalyzeInteractions = async () => {
    const currentProtocol = protocolRef.current.trim()
    if (!currentProtocol) return
    setInteractionLoading(true)
    setInteractionChecked(true)
    setInteractionError('')
    setInteractionResults([])
    setInteractionDetectorModel(null)
    setInteractionExplainerModel(null)
    try {
      const response = await fetch('/api/drug-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol: currentProtocol, provider: gateway })
      })
      const data = await response.json()
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Сервис проверки временно недоступен.')
      }
      setInteractionResults(Array.isArray(data.interactions) ? data.interactions : [])
      setInteractionDetectorModel(typeof data.detectorModel === 'string' ? data.detectorModel : null)
      setInteractionExplainerModel(typeof data.explainerModel === 'string' ? data.explainerModel : null)
    } catch (err: any) {
      setInteractionError(err?.message || 'Ошибка проверки взаимодействий.')
    } finally {
      setInteractionLoading(false)
    }
  }

  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const THERAPY_SECTION_MARKERS = [
    'терапия',
    'фармакотерапия',
    'лечение',
    'назначения',
    'медикаментозная терапия',
    'медикамент'
  ]

  const NON_THERAPY_SECTION_MARKERS = [
    'жалобы',
    'анамнез',
    'осмотр',
    'объективно',
    'статус',
    'диагноз',
    'обследован',
    'анализ'
  ]

  const cleanupMedicationLine = (line: string) =>
    line
      .replace(/^\s*[-*•]\s*/, '')
      .replace(/^\s*\d+[.)]\s*/, '')
      .replace(/^\s*(rp\.?|s\.?|d\.t\.d\.?)\s*[:.-]?\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim()

  const NON_MEDICATION_PHRASES = [
    'аллерг',
    'анамнез',
    'жалоб',
    'диагноз',
    'осмотр',
    'объективно',
    'статус',
    'риски',
    'наблюдение',
    'госпитализац',
    'согласие',
    'физиотерап',
    'лфк',
    'массаж',
    'магнитотерап',
    'электрофорез',
    'увч',
    'ультразвук',
    'фонофорез',
    'лазеротерап',
    'парафин',
    'озокерит',
    'грязелеч'
  ]

  const PHYSIOTHERAPY_MARKERS = [
    'физиотерап',
    'лфк',
    'массаж',
    'магнитотерап',
    'электрофорез',
    'увч',
    'ультразвук',
    'фонофорез',
    'лазеротерап',
    'парафин',
    'озокерит',
    'грязелеч',
    'процедур'
  ]

  const isMedicationLikeLine = (line: string) => {
    const low = line.toLowerCase()
    if (PHYSIOTHERAPY_MARKERS.some((marker) => low.includes(marker))) return false

    const hasMnnTag = /\(\s*м[нn]н\s*\)/i.test(low)
    const hasDose = /(\d+(?:[.,]\d+)?)\s*(мкг\/кг|mcg\/kg|мг\/кг|mg\/kg|мг\/мл|mg\/ml|мг|mg|мл|ml|г|mcg|мкг|ед|%)\b/i.test(low)
    const hasForm = /таб|капс|амп|раств|сироп|спрей|крем|маз|свеч|капл|инъ|sol|tab|caps|ung|supp|gtt/i.test(low)
    const hasScheme = /подкож|per os|в\/м|в\/в|внутрь|наружно|по\s+\d+|раз[а]?\s+в\s+(сутки|день)|ежедневно|на\s+ночь/i.test(low)
    const hasNoiseOnly = NON_MEDICATION_PHRASES.some((marker) => low.includes(marker))

    if (hasNoiseOnly && !hasMnnTag) return false
    return hasMnnTag || ((hasDose || hasForm) && (hasScheme || hasForm))
  }

  type ParsedMedication = {
    drugDisplayName: string
    dosage: string
    form: 'Tab.' | 'Sol.' | 'Ung.' | 'Caps.' | 'Supp.' | 'Gtt.'
    signa: string
    dispenseCount: number
    sourceType: 'mnn' | 'brand' | 'unknown'
    sourceLine: string
  }

  const CYR_TO_LAT: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'u', я: 'a'
  }

  const translitRuToLat = (value: string) =>
    value
      .toLowerCase()
      .split('')
      .map((ch) => CYR_TO_LAT[ch] ?? ch)
      .join('')

  const toLatinGenitiveWord = (word: string) => {
    const w = word.toLowerCase()
    if (w.endsWith('um')) return `${w.slice(0, -2)}i`
    if (w.endsWith('us')) return `${w.slice(0, -2)}i`
    if (w.endsWith('a')) return `${w.slice(0, -1)}ae`
    if (w.endsWith('is')) return w
    if (w.endsWith('e')) return `${w.slice(0, -1)}is`
    if (w.endsWith('on')) return `${w}i`
    return `${w}i`
  }

  const normalizeToLatinGenitive = (name: string): string => {
    const latinBase = translitRuToLat(name)
      .replace(/[^a-z\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!latinBase) return '________________'

    return latinBase
      .split(' ')
      .map((part) =>
        part
          .split('-')
          .map((word) => (word.length > 2 ? toLatinGenitiveWord(word) : word))
          .join('-')
      )
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

  const extractDrugIdentity = (line: string): { name: string; sourceType: ParsedMedication['sourceType'] } => {
    const cleaned = cleanupMedicationLine(line)
    const mnnTaggedMatch = cleaned.match(/^(.+?)\s*\(\s*м[нn]н\s*\)/i)
    const beforeDash = cleaned.split('—')[0]
    const beforeColon = beforeDash.split(':')[0]
    const beforeComma = beforeColon.split(',')[0]
    const candidate = (mnnTaggedMatch?.[1] || beforeComma)
      .replace(/\([^)]*\)/g, '')
      .replace(/\b(бренд|генерик|коммерческ\w*|торгов\w*|таб|табл|капс|раствор|мазь|крем|капли)\b/gi, '')
      .replace(/\d+([.,]\d+)?\s?(мг|mg|мл|ml|г|mcg|мкг|ед|%)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (NON_MEDICATION_PHRASES.some((marker) => candidate.toLowerCase().includes(marker))) {
      return { name: '', sourceType: 'unknown' }
    }
    if (mnnTaggedMatch?.[1]?.trim()) {
      return { name: mnnTaggedMatch[1].trim(), sourceType: 'mnn' }
    }
    if (candidate.length >= 3) {
      return { name: candidate, sourceType: 'brand' }
    }
    return { name: '', sourceType: 'unknown' }
  }

  const detectForm = (line: string): ParsedMedication['form'] => {
    const low = line.toLowerCase()
    if (/(маз|крем|гель|ung)/i.test(low)) return 'Ung.'
    if (/(подкож|в\/м|в\/в|раств|амп|инъ|sol)/i.test(low)) return 'Sol.'
    if (/(капл|gtt)/i.test(low)) return 'Gtt.'
    if (/(свеч|supp)/i.test(low)) return 'Supp.'
    if (/(капс|caps)/i.test(low)) return 'Caps.'
    return 'Tab.'
  }

  const normalizeDoseForRp = (line: string, form: ParsedMedication['form']) => {
    const low = line.toLowerCase()
    const mcgPerKgMatch = low.match(/(\d+(?:[.,]\d+)?)\s*(мкг|mcg)\s*\/\s*(кг|kg)/i)
    const mgPerKgMatch = low.match(/(\d+(?:[.,]\d+)?)\s*(мг|mg)\s*\/\s*(кг|kg)/i)
    const mgPerMlMatch = low.match(/(\d+(?:[.,]\d+)?)\s*(мг|mg)\s*\/\s*(мл|ml)/i)
    const percentMatch = low.match(/(\d+(?:[.,]\d+)?)\s*%/)
    const mlMatch = low.match(/(\d+(?:[.,]\d+)?)\s*(мл|ml)\b/i)
    const gMatch = low.match(/(\d+(?:[.,]\d+)?)\s*(г|g)\b/i)
    const mgMatch = low.match(/(\d+(?:[.,]\d+)?)\s*(мг|mg)\b/i)
    const mcgMatch = low.match(/(\d+(?:[.,]\d+)?)\s*(мкг|mcg)\b/i)

    if (mcgPerKgMatch) {
      return `${mcgPerKgMatch[1].replace('.', ',')} mcg/kg`
    }

    if (mgPerKgMatch) {
      return `${mgPerKgMatch[1].replace('.', ',')} mg/kg`
    }

    if (form === 'Sol.' && mgPerMlMatch) {
      const conc = `${mgPerMlMatch[1].replace('.', ',')} mg/ml`
      const vol = mlMatch ? `${mlMatch[1].replace('.', ',')} ml` : '____ ml'
      return `${conc} — ${vol}`
    }

    if (form === 'Sol.' && percentMatch) {
      const percent = percentMatch[1].replace('.', ',')
      const vol = mlMatch ? `${mlMatch[1].replace('.', ',')} ml` : '____ ml'
      return `${percent}% — ${vol}`
    }

    if (gMatch) {
      return `${gMatch[1].replace('.', ',')} g`
    }

    if (mcgMatch) {
      return `${mcgMatch[1].replace('.', ',')} mcg`
    }

    if (mgMatch) {
      return `${mgMatch[1].replace('.', ',')} mg`
    }

    if (form === 'Sol.' && mlMatch) {
      return `____% — ${mlMatch[1].replace('.', ',')} ml`
    }

    return '____'
  }

  const buildMediumTherapeuticSigna = (form: ParsedMedication['form']) => {
    if (form === 'Sol.') return 'S.: По 5 ml 2 раза в день.'
    if (form === 'Ung.') return 'S.: Наносить тонким слоем 2 раза в день.'
    if (form === 'Gtt.') return 'S.: По 2 капли 3 раза в день.'
    if (form === 'Supp.') return 'S.: По 1 супп. 1-2 раза в день.'
    if (form === 'Caps.') return 'S.: По 1 капс. 2 раза в день.'
    return 'S.: По 1 таб. 2 раза в день.'
  }

  const extractSignaFromLine = (line: string, form: ParsedMedication['form']) => {
    const low = line.toLowerCase()

    const route =
      /(подкож)/i.test(low) ? 'подкожно' :
      /(в\/м)/i.test(low) ? 'в/м' :
      /(в\/в)/i.test(low) ? 'в/в' :
      /(внутрь|per os)/i.test(low) ? 'внутрь' :
      /(наружно)/i.test(low) ? 'наружно' : ''

    const frequencyMatch = low.match(/(\d+)\s*раз[а]?\s*в\s*(сутки|день)/i)
    const frequency = frequencyMatch
      ? `${frequencyMatch[1]} раз${frequencyMatch[1] === '1' ? '' : 'а'} в ${frequencyMatch[2]}`
      : ''

    const untilMatch = low.match(/(до\s+[^.,;]+)/i)
    const durationMatch = low.match(/(в\s+течение\s+\d+\s*(дн|дней|нед|недель|мес|месяц\w*))/i)
    const tail = untilMatch?.[1] || durationMatch?.[1] || ''

    if (!route && !frequency && !tail) {
      return buildMediumTherapeuticSigna(form)
    }

    const chunks = [route, frequency, tail].filter(Boolean)
    return `S.: ${chunks.join(', ')}.`
  }

  const parseMedicationLine = (line: string): ParsedMedication | null => {
    if (!isMedicationLikeLine(line)) return null
    if (PHYSIOTHERAPY_MARKERS.some((marker) => line.toLowerCase().includes(marker))) return null

    const form = detectForm(line)
    const dosage = normalizeDoseForRp(line, form)
    let signa = extractSignaFromLine(line, form)
    const identity = extractDrugIdentity(line)
    const hasUsefulDose = dosage !== '____'
    if (!identity.name && !hasUsefulDose) return null

    const drugDisplayName =
      identity.sourceType === 'mnn'
        ? normalizeToLatinGenitive(identity.name)
        : identity.name || '________________'

    return { drugDisplayName, dosage, form, signa, dispenseCount: form === 'Ung.' || form === 'Gtt.' ? 1 : form === 'Sol.' ? 10 : 20, sourceType: identity.sourceType, sourceLine: line }
  }

  const parseRpLine = (line: string): ParsedMedication | null => {
    const cleaned = cleanupMedicationLine(line)
      .replace(/\bD\.?\s*t\.?\s*d\.?\b[\s.:-]*N\.?\s*\d*/i, '')
      .replace(/\bS\.?\s*[:.-].*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!cleaned) return null

    const fallback = parseMedicationLine(cleaned)
    if (fallback) {
      return { ...fallback, sourceLine: line }
    }

    const form = detectForm(cleaned)
    const dosage = normalizeDoseForRp(cleaned, form)
    const identity = extractDrugIdentity(cleaned)
    const drugDisplayName =
      identity.sourceType === 'mnn'
        ? normalizeToLatinGenitive(identity.name)
        : identity.name || '________________'

    if (!drugDisplayName && dosage === '____') return null
    return {
      drugDisplayName: drugDisplayName || '________________',
      dosage,
      form,
      signa: buildMediumTherapeuticSigna(form),
      dispenseCount: form === 'Ung.' || form === 'Gtt.' ? 1 : form === 'Sol.' ? 10 : 20,
      sourceType: identity.sourceType,
      sourceLine: line
    }
  }

  const normalizeMedicationsWithAi = async (items: ParsedMedication[], sourceText: string): Promise<ParsedMedication[]> => {
    try {
      const response = await fetch('/api/prescription/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, protocol: sourceText, provider: gateway })
      })
      if (!response.ok) return items

      const data = await response.json()
      if (!data?.success || !Array.isArray(data?.items) || data.items.length === 0) return items

      return data.items.map((normalized: any, idx: number) => {
        const original = items[idx]
        const form = ['Tab.', 'Sol.', 'Ung.', 'Caps.', 'Supp.', 'Gtt.'].includes(normalized.form)
          ? normalized.form
          : original?.form || 'Tab.'
        const count = Number(normalized.dispenseCount)
        return {
          drugDisplayName: String(normalized.drugDisplayName || original?.drugDisplayName || '').trim(),
          dosage: String(normalized.dosage || original?.dosage || '____').trim(),
          form,
          signa: String(normalized.signa || original?.signa || 'S.: По схеме врача.').trim(),
          dispenseCount: Number.isFinite(count) && count >= 1 ? Math.round(count) : (original?.dispenseCount || 20),
          sourceType: 'mnn' as const,
          sourceLine: original?.sourceLine || ''
        }
      }).filter((item: ParsedMedication) => item.drugDisplayName)
    } catch {
      return items
    }
  }

  const parseCompactTherapyPair = (nameLine: string, signaLine: string): ParsedMedication | null => {
    const rawName = cleanupMedicationLine(nameLine)
    const name = rawName.split('(')[0].replace(/[.;]+$/g, '').trim()
    if (name.length < 3) return null
    if (PHYSIOTHERAPY_MARKERS.some((marker) => `${nameLine} ${signaLine}`.toLowerCase().includes(marker))) return null
    if (NON_MEDICATION_PHRASES.some((marker) => name.toLowerCase().includes(marker))) return null

    const combined = `${nameLine} ${signaLine}`
    const form = detectForm(combined)
    const dosage = normalizeDoseForRp(combined, form)
    const signaBody = signaLine.replace(/^s\.?\s*[:.-]?\s*/i, '').trim()

    return {
      drugDisplayName: normalizeToLatinGenitive(name),
      dosage,
      form,
      signa: signaBody ? `S.: ${signaBody}` : buildMediumTherapeuticSigna(form),
      dispenseCount: form === 'Ung.' || form === 'Gtt.' ? 1 : form === 'Sol.' ? 10 : 20,
      sourceType: 'mnn',
      sourceLine: `${nameLine}\n${signaLine}`
    }
  }

  const extractMedicationsFromProtocol = (text: string): ParsedMedication[] => {
    const lines = text.split('\n')
    const medsFromRp: ParsedMedication[] = []

    for (let i = 0; i < lines.length; i += 1) {
      const rawLine = lines[i]
      const line = rawLine.trim()
      if (!line) continue
      if (!/^rp\.?\s*[:.-]/i.test(line)) continue

      const parsedRp = parseRpLine(line)
      if (!parsedRp) continue

      let signaFromNearby = ''
      for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j += 1) {
        const next = lines[j].trim()
        if (!next) continue
        if (/^s\.?\s*[:.-]/i.test(next)) {
          signaFromNearby = next.replace(/^s\.?\s*[:.-]?\s*/i, '').trim()
          break
        }
        if (/^rp\.?\s*[:.-]/i.test(next)) break
      }

      medsFromRp.push({
        ...parsedRp,
        signa: signaFromNearby ? `S.: ${signaFromNearby}` : parsedRp.signa
      })
      if (medsFromRp.length >= 16) break
    }

    if (medsFromRp.length > 0) {
      return medsFromRp.filter(
        (med, idx, arr) =>
          arr.findIndex(
            (m) =>
              m.drugDisplayName.toLowerCase() === med.drugDisplayName.toLowerCase() &&
              m.dosage.toLowerCase() === med.dosage.toLowerCase()
          ) === idx
      )
    }

    const compactMeds: ParsedMedication[] = []
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim()
      if (!/^\d+\.\s+\S/.test(line)) continue

      let signaLine = ''
      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j += 1) {
        const next = lines[j].trim()
        if (!next) continue
        if (/^s\.?\s*[:.-]/i.test(next)) {
          signaLine = next
        }
        break
      }
      if (!signaLine) continue

      const parsed = parseCompactTherapyPair(line, signaLine)
      if (!parsed) continue
      compactMeds.push(parsed)
      if (compactMeds.length >= 16) break
    }

    if (compactMeds.length > 0) {
      return compactMeds.filter(
        (med, idx, arr) =>
          arr.findIndex((m) => m.drugDisplayName.toLowerCase() === med.drugDisplayName.toLowerCase()) === idx
      )
    }

    let inTherapyBlock = false
    const meds: ParsedMedication[] = []

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue

      const normalized = line
        .replace(/^#+\s*/, '')
        .replace(/[:.]$/, '')
        .toLowerCase()

      const isHeadingLike = /^#+\s+/.test(line) || /^[А-Яа-яA-Za-z\s-]{4,40}[:.]$/.test(line)
      if (isHeadingLike) {
        if (THERAPY_SECTION_MARKERS.some((marker) => normalized.includes(marker))) {
          inTherapyBlock = true
          continue
        }
        if (NON_THERAPY_SECTION_MARKERS.some((marker) => normalized.includes(marker))) {
          inTherapyBlock = false
          continue
        }
      }

      if (!inTherapyBlock && !/\(\s*м[нn]н\s*\)/i.test(line)) {
        continue
      }

      const parsed = parseMedicationLine(line)
      if (!parsed) continue
      meds.push(parsed)
      if (meds.length >= 16) break
    }

    return meds.filter(
      (med, idx, arr) =>
        arr.findIndex((m) => m.drugDisplayName.toLowerCase() === med.drugDisplayName.toLowerCase()) === idx
    )
  }

  const buildRxBlockHtml = (medication?: ParsedMedication) => {
    if (!medication) {
      return `
        <div class="rx-line" contenteditable="true">Rp.: Tab. ________________________________ ____</div>
        <div class="rx-line" contenteditable="true">D.t.d. N. ______</div>
        <div class="rx-line" contenteditable="true">S.: ________________________________</div>
      `
    }

    return `
      <div class="rx-line" contenteditable="true">Rp.: ${medication.form} ${escapeHtml(medication.drugDisplayName)} ${escapeHtml(medication.dosage)}</div>
      <div class="rx-line" contenteditable="true">D.t.d. N. ${escapeHtml(String(medication.dispenseCount || '______'))}</div>
      <div class="rx-line" contenteditable="true">${escapeHtml(medication.signa)}</div>
    `
  }

  const openPrescriptionLayout = async () => {
    const currentProtocol = protocolRef.current
    if (!currentProtocol.trim()) return
    const extractedMedications = await normalizeMedicationsWithAi(
      extractMedicationsFromProtocol(currentProtocol),
      currentProtocol
    )
    const cardCount = Math.min(6, Math.max(1, Math.ceil(extractedMedications.length / 3)))
    const cards = Array.from({ length: cardCount }, (_, idx) => ({ number: idx + 1 }))
    const childPrescription = /педиатр|ребён|ребен|детск/i.test(`${currentProtocol}\n${specialistName}`)

    const cardsHtml = cards
      .map((card) => {
        const medA = extractedMedications[(card.number - 1) * 3]
        const medB = extractedMedications[(card.number - 1) * 3 + 1]
        const medC = extractedMedications[(card.number - 1) * 3 + 2]

        return `
          <section class="rx-card">
            <div class="rx-form-top">
              <div class="rx-form-top-left">
                <div>Министерство здравоохранения<br/>Российской Федерации</div>
                <div class="rx-form-stamp-line">Наименование (штамп)<br/>медицинской организации</div>
                <div class="rx-form-stamp-line">Наименование (штамп) индивидуального предпринимателя<br/>и дату лицензии, наименование органа<br/>государственной власти, выдавшего лицензию)</div>
              </div>
              <div class="rx-form-top-right">
                <div>Код формы по ОКУД</div>
                <div>Код учреждения по ОКПО</div>
                <div>Медицинская документация</div>
                <div><strong>Форма № 107-1/у</strong></div>
                <div>Утверждена приказом<br/>Министерства здравоохранения<br/>Российской Федерации<br/>от 14 января 2019 г. № 4н</div>
              </div>
            </div>
            <div class="rx-form-title-block">
              <div class="rx-title">РЕЦЕПТ</div>
              <div class="rx-subtitle">${childPrescription ? '(взрослый, <u>детский</u> — нужное подчеркнуть)' : '(<u>взрослый</u>, детский — нужное подчеркнуть)'}</div>
              <div class="rx-date">« <span contenteditable="true">__</span> » <span contenteditable="true">__________</span> 20<span contenteditable="true">__</span> г.</div>
            </div>
            <div class="rx-meta">
              Ф.И.О. пациента: <span contenteditable="true">__________________________</span>
            </div>
            <div class="rx-meta">
              Ф.И.О. врача: <span contenteditable="true">__________________________</span>
            </div>

            ${buildRxBlockHtml(medA)}
            ${buildRxBlockHtml(medB)}
            ${buildRxBlockHtml(medC)}

            <div class="rx-foot">
              <div class="rx-foot-sign-row">
                <div>
                  Подпись<br/>
                  и печать лечащего врача<br/>
                  (подпись фельдшера, акушерки)
                </div>
                <div class="rx-foot-mp">М. П.</div>
              </div>
              <div class="rx-foot-valid-row">
                <span>Рецепт действителен в течение 60 дней, до 1 года</span>
                <span class="rx-foot-months-line"><span contenteditable="true">__________</span></span>
              </div>
              <div class="rx-foot-hints-row">
                <span>(нужное подчеркнуть)</span>
                <span>(указать количество месяцев)</span>
              </div>
            </div>
          </section>
        `
      })
      .join('')

    const html = `
      <!doctype html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <title>Рецепты для печати</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Times New Roman", serif;
            background: #f3f4f6;
            color: #111827;
          }
          .toolbar {
            position: sticky;
            top: 0;
            z-index: 10;
            background: #111827;
            color: #fff;
            padding: 10px 14px;
            display: flex;
            gap: 10px;
            align-items: center;
          }
          .toolbar button {
            border: 0;
            border-radius: 8px;
            padding: 8px 12px;
            background: #2563eb;
            color: #fff;
            cursor: pointer;
            font-weight: 700;
          }
          .toolbar button.secondary {
            background: #374151;
          }
          .page {
            width: 210mm;
            min-height: 297mm;
            margin: 14px auto;
            padding: 10mm;
            background: #fff;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-auto-rows: minmax(33mm, auto);
            gap: 8mm 8mm;
          }
          .rx-card {
            border: 1px dashed #6b7280;
            padding: 5mm;
            display: flex;
            flex-direction: column;
            gap: 2mm;
          }
          .rx-form-top {
            display: flex;
            justify-content: space-between;
            gap: 6px;
            font-size: 9px;
            line-height: 1.2;
            border-bottom: 1px solid #111827;
            padding-bottom: 2px;
            margin-bottom: 2px;
          }
          .rx-form-top-left {
            width: 58%;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .rx-form-top-right {
            width: 42%;
            display: flex;
            flex-direction: column;
            gap: 1px;
            text-align: left;
          }
          .rx-form-stamp-line {
            min-height: 26px;
          }
          .rx-form-title-block {
            border-bottom: 1px solid #111827;
            padding-bottom: 2px;
            margin-bottom: 2px;
          }
          .rx-title {
            font-weight: 700;
            font-size: 15px;
            letter-spacing: 2px;
            text-align: center;
          }
          .rx-subtitle {
            font-size: 11px;
            text-align: center;
            margin-top: 1px;
          }
          .rx-date {
            font-size: 12px;
            text-align: center;
            margin-top: 1px;
          }
          .rx-meta {
            font-size: 11px;
            border-bottom: 1px solid #d1d5db;
            padding-bottom: 2px;
          }
          .rx-line {
            font-size: 12px;
            min-height: 14px;
            border-bottom: 1px dotted #d1d5db;
            padding: 1px 0;
          }
          .rx-foot {
            margin-top: auto;
            font-size: 11px;
            border-top: 1px solid #d1d5db;
            padding-top: 3px;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .rx-foot-sign-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 8px;
            min-height: 32px;
          }
          .rx-foot-mp {
            font-size: 14px;
            min-width: 56px;
            text-align: right;
            padding-bottom: 2px;
          }
          .rx-foot-valid-row {
            display: flex;
            justify-content: space-between;
            gap: 6px;
            align-items: flex-end;
            white-space: nowrap;
          }
          .rx-foot-months-line {
            flex: 1;
            border-bottom: 1px solid #111827;
            min-height: 14px;
            display: inline-flex;
            justify-content: center;
            align-items: flex-end;
          }
          .rx-foot-hints-row {
            display: flex;
            justify-content: space-between;
            gap: 6px;
            font-size: 10px;
          }
          [contenteditable="true"] {
            outline: none;
          }
          [contenteditable="true"]:focus {
            background: #eff6ff;
          }
          @media print {
            body { background: #fff; }
            .toolbar { display: none; }
            .page {
              margin: 0;
              width: auto;
              min-height: auto;
              padding: 0;
              gap: 4mm;
            }
            .rx-card {
              break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button onclick="window.print()">🖨 Печать</button>
          <button class="secondary" onclick="window.close()">✖ Закрыть</button>
          <span>${extractedMedications.length ? 'Прописи заполнены: МНН на латыни, доза, D.t.d. N. и сигнатура. Врач и пациент — вручную.' : 'В протоколе не найдены лекарственные назначения.'}</span>
        </div>
        <main class="page">
          ${cardsHtml}
        </main>
      </body>
      </html>
    `

    const win = window.open('about:blank', '_blank', 'width=1200,height=900')
    if (!win) {
      alert('Разрешите всплывающие окна для открытия бланка рецептов.')
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  const buildDraftFromConversation = async (transcriptText: string) => {
    const safeTranscript = (transcriptText || '').trim()
    if (!safeTranscript) return

    setDraftFromConversationLoading(true)
    setDraftFromConversationError('')
    try {
      const response = await fetch('/api/protocol/dialogue-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: safeTranscript,
          specialistName,
          provider: gateway,
        }),
      })
      const data = await response.json()
      if (!data?.success) {
        throw new Error(data?.error || 'Не удалось собрать черновик')
      }
      const draft = String(data?.draft || '').trim()
      if (!draft) {
        throw new Error('Черновик получился пустым')
      }
      setRecordedDraftText(draft)
      setDraftFromConversationModel(typeof data?.modelUsed === 'string' ? data.modelUsed : null)
    } catch (error: any) {
      setDraftFromConversationError(error?.message || 'Ошибка формирования черновика')
      // An STT transcript must not masquerade as a structured clinical draft on failure.
      setDraftFromConversationModel(null)
    } finally {
      setDraftFromConversationLoading(false)
    }
  }

  const fieldClass = 'w-full border-0 border-b border-[#C9BBA8] bg-transparent px-0 py-2 text-sm text-[#1C1612] outline-none focus:border-[#9C4221]'
  const labelClass = 'block mb-1 text-[11px] uppercase tracking-[0.16em] text-[#8A7563]'
  const quietButton = 'border border-[#C9BBA8] px-3 py-1.5 text-xs tracking-wide text-[#5C4636] hover:border-[#9C4221] disabled:opacity-50'
  const docAction = 'border border-[#C9BBA8] bg-white px-3 py-2 text-left text-xs text-[#1C1612] hover:border-[#9C4221] disabled:cursor-not-allowed disabled:opacity-40'
  const templateLabel = (name: string) => name.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim()

  return (
    <><ConciliumProtocolBridge transcript={conversationTranscriptText} rawText={rawText} protocol={protocol} busy={loading||draftFromConversationLoading||interactionLoading} onImport={setRawText} onProtocolImport={setProtocol}/><div className="min-h-screen bg-[#E7E0D4] text-[#1C1612] lg:pl-16">
      <aside className="fixed inset-y-0 left-0 hidden w-16 flex-col items-center justify-between bg-[#1C1612] py-7 text-[#F3E7D3] lg:flex">
        <span className="text-sm font-semibold">П</span>
        <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] uppercase tracking-[0.32em]">Осмотр</span>
        <span className="h-2 w-2 rounded-full bg-[#C46A3A]" />
      </aside>

      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8">
        <header className="-mx-5 mb-8 flex flex-col gap-5 border-b border-[#CDBFAE] px-5 py-5 sm:-mx-8 sm:flex-row sm:items-end sm:justify-between sm:px-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-[#8A7563]">Кабинет врача</p>
            <h1 className="mt-2 font-serif text-5xl font-medium tracking-tight text-[#1C1612] sm:text-6xl">
              {selectedTemplateId === ECG_FUNCTIONAL_TEMPLATE_ID ? 'Протокол ЭКГ' : 'Осмотр'}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[#5C4636]">
              Сначала беседа и заметки, затем лист. Рецепт и печать берутся уже из правки.
            </p>
          </div>
          <div className="flex items-center gap-4 sm:flex-col sm:items-end">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#9C4221]">
              {protocol ? 'Готов к проверке' : 'Черновик'}
            </p>
            <button onClick={handleGenerateProtocol} data-tour="protocol-generate-button" disabled={!rawText.trim() || loading} className="bg-[#9C4221] px-5 py-3 text-sm tracking-wide text-[#FBF7F0] transition-colors hover:bg-[#7C341A] disabled:opacity-50">
              {loading ? 'Формируем протокол...' : 'Составить протокол'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section>

          {/* Специалист и Шаблоны */}
          <div className="mb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Кто проводит осмотр</label>
                <input
                  type="text"
                  value={specialistName}
                  onChange={(e) => setSpecialistName(e.target.value)}
                  placeholder="Например: Врач-невролог"
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Специализация</label>
                <select
                  value={selectedUniversalKey}
                  onChange={(e) => handleUniversalSelect(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">-- Выберите профиль --</option>
                  {Object.entries(UNIVERSAL_SPECIALIST_TEMPLATES).map(([key, tpl]) => (
                    <option key={key} value={key}>{tpl.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedUniversalKey && (
              <div className="animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8A7563]">Инструкция для модели</label>
                  <span className="text-[10px] text-gray-400 italic">Фокус: {UNIVERSAL_SPECIALIST_TEMPLATES[selectedUniversalKey].focus}</span>
                </div>
                <textarea
                  value={universalPrompt}
                  onChange={(e) => setUniversalPrompt(e.target.value)}
                  className={`${fieldClass} min-h-[60px] text-xs leading-relaxed`}
                  placeholder="Специфические инструкции для этого врача..."
                />
              </div>
            )}

            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <label className={labelClass}>Каркас протокола</label>
                <span className="truncate text-sm text-[#1C1612]">
                  {templateLabel(DEFAULT_TEMPLATES.find((tpl) => tpl.id === selectedTemplateId)?.name || 'Не выбран')}
                </span>
              </div>
              <div className="flex max-h-28 flex-wrap content-start gap-x-3 gap-y-1 overflow-y-auto border-t border-[#E4D8C8] pt-2">
                {DEFAULT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl)}
                    className={`border-b px-0.5 py-1 text-left text-xs transition-colors ${
                      selectedTemplateId === tpl.id
                        ? 'border-[#9C4221] font-medium text-[#1C1612]'
                        : 'border-transparent text-[#8A7563] hover:text-[#1C1612]'
                    }`}
                  >
                    {templateLabel(tpl.name)}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setIsEditingTemplate(!isEditingTemplate)}
              className="text-xs uppercase tracking-[0.14em] text-[#9C4221] hover:underline"
            >
              {isEditingTemplate ? 'Скрыть структуру документа' : 'Структура документа'}
            </button>

            {isEditingTemplate && (
              <div className="mt-2 animate-in fade-in slide-in-from-top-1 space-y-2">
                <textarea
                  value={customTemplate}
                  onChange={(e) => {
                    setCustomTemplate(e.target.value)
                    if (!isTemplateLocked) setIsTemplateLocked(true)
                  }}
                  className={`${fieldClass} min-h-[150px] font-mono text-xs leading-tight`}
                />
                <label className="inline-flex items-center gap-2 text-[11px] text-[#5C4636]">
                  <input
                    type="checkbox"
                    checked={isTemplateLocked}
                    onChange={(e) => setIsTemplateLocked(e.target.checked)}
                    className="w-3.5 h-3.5"
                  />
                  Закрепить мой шаблон и не перезаписывать его при смене специалиста
                </label>
                <label className="inline-flex items-center gap-2 text-[10px] font-semibold text-[#5C4636]">
                  <input
                    type="checkbox"
                    checked={strictTemplateMode}
                    onChange={(e) => {
                      const enabled = e.target.checked
                      setStrictTemplateMode(enabled)
                      localStorage.setItem('protocol-strict-template', enabled ? '1' : '0')
                    }}
                    className="w-3.5 h-3.5"
                  />
                  Строго заполнять структуру шаблона
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSaveAsDefault}
                    className="bg-[#9C4221] px-3 py-1.5 text-xs text-[#FBF7F0] hover:bg-[#7C341A]"
                  >
                    Сохранить как мой стандарт
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={quietButton}
                  >
                    Загрузить из файла
                  </button>
                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleLoadFromFile}
                    accept=".txt,.doc,.docx,.pdf,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                  />
                </div>
              </div>
            )}
          </div>
          
          <div className="mb-4 border border-[#E4D8C8] bg-[#FBF7F0] p-4 shadow-[0_12px_30px_rgba(28,22,18,0.05)]">
            <div className="mb-2 flex items-center justify-between">
              <label className={labelClass}>Заметки осмотра</label>
              <div className="flex items-center gap-2 text-xs text-[#9C4221]">
                <span>Голос врача</span>
                <VoiceInput
                  onTranscript={(text) => setRawText(prev => prev ? prev + ' ' + text : text)}
                  disabled={loading}
                  className="bg-transparent text-[#9C4221] hover:bg-[#F3E7D3] data-[listening=true]:bg-red-600 data-[listening=true]:text-white"
                  placeholder="Голосовой ввод. Запись идёт, пока не нажмёте «Стоп»."
                />
              </div>
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Жалобы, анамнез, то, что уже осмотрели. Можно продиктовать."
              data-tour="protocol-input"
              className="min-h-[220px] w-full resize-y border border-[#E4D8C8] bg-white px-3 py-3 text-sm leading-6 text-[#1C1612] outline-none focus:border-[#9C4221]"
              disabled={loading}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setShowConversationRecorder(!showConversationRecorder)} className="border border-[#9C4221] px-3 py-1.5 text-xs tracking-wide text-[#9C4221] hover:bg-[#F3E7D3] disabled:opacity-50" disabled={loading}>
                {showConversationRecorder ? 'Скрыть запись беседы' : 'Запись беседы'}
              </button>
              <button onClick={() => setRawText('')} className={quietButton} disabled={!rawText || loading}>
                Очистить
              </button>
            </div>

          {showConversationRecorder && (
            <div ref={conversationRecorderRef} className="mt-4 border-t border-[#E4D8C8] pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-serif text-lg text-[#1C1612]">Беседа с пациентом</h3>
                <button onClick={() => setShowConversationRecorder(false)} className="text-xs uppercase tracking-[0.14em] text-[#8A7563] hover:text-[#9C4221]">Закрыть</button>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-[#5C4636]">
                Микрофон слушает приём, пока вы сами не остановите запись. Из разговора соберётся черновик жалоб и анамнеза. Чего не прозвучало, черновик не допишет.
              </p>
              <label className="mb-3 flex items-start gap-2 text-xs leading-relaxed text-[#5C4636]">
                <input type="checkbox" checked={ambientAudioConsent} onChange={e=>setAmbientAudioConsent(e.target.checked)}/>
                Подтверждаю необходимое согласие пациента на запись и передачу исходного аудио внешнему сервису распознавания. Даже без ФИО голос может раскрывать личность; перед передачей требуется проверка приватности. Запись включается только по кнопке.
              </label>
              {ambientAudioConsent ? <AudioUpload
                variant="cabinet"
                provider={gateway}
                onTranscribe={(transcript) => {
                  const nextTranscript = conversationTranscriptText
                    ? `${conversationTranscriptText}\n\n${transcript}`
                    : transcript
                  setConversationTranscriptText(nextTranscript)
                  // C14: a transcript is only source material. Do not make a paid
                  // LLM draft request until the physician explicitly asks for one.
                }}
              /> : <p role="status" className="text-xs text-[#5C4636]">Подтвердите согласие, затем нажмите «Начать запись» или выберите аудиофайл. Открытие панели не запускает микрофон.</p>}
              {draftFromConversationLoading && (
                <p className="mt-2 text-xs text-[#9C4221]">Лёгкая модель формирует черновик по транскрипту...</p>
              )}
              {draftFromConversationError && (
                <p className="mt-2 text-xs text-amber-800">{draftFromConversationError}</p>
              )}
              {draftFromConversationModel && (
                <p className="mt-2 text-[11px] text-[#5E726E]">Черновик собран моделью: {draftFromConversationModel}</p>
              )}
              {recordedDraftText && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-700 mb-2">Черновик по жалобам/анамнезу (можно редактировать перед вставкой):</label>
                  <textarea
                    value={recordedDraftText}
                    onChange={(e) => setRecordedDraftText(e.target.value)}
                    className={`${fieldClass} min-h-[140px] text-xs`}
                    placeholder="Транскрипт беседы появится здесь..."
                    disabled={loading}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => setRawText(prev => prev ? `${prev}\n\n${recordedDraftText}` : recordedDraftText)}
                      className="bg-[#9C4221] px-3 py-1.5 text-xs text-[#FBF7F0] hover:bg-[#7C341A] disabled:opacity-50"
                      disabled={loading || !recordedDraftText.trim()}
                    >
                      Вставить черновик в протокол
                    </button>
                    <button
                      onClick={() => setRecordedDraftText('')}
                      className={quietButton}
                      disabled={loading}
                    >
                      Очистить черновик
                    </button>
                  </div>
                </div>
              )}
              {conversationTranscriptText && (
                <button type="button" className="mt-3 border border-[#9C4221] px-3 py-2 text-xs text-[#9C4221] disabled:opacity-50" disabled={loading||draftFromConversationLoading} onClick={()=>void buildDraftFromConversation(conversationTranscriptText)}>
                  Сформировать черновик из расшифровки (внешняя модель, возможна оплата)
                </button>
              )}
              {conversationTranscriptText && (
                <details className="mt-3">
                  <summary className="text-xs text-gray-500 cursor-pointer">Показать исходную транскрипцию беседы</summary>
                  <textarea
                    value={conversationTranscriptText}
                    onChange={(e) => setConversationTranscriptText(e.target.value)}
                    className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-xs min-h-[100px] focus:ring-2 focus:ring-gray-400 outline-none"
                    disabled={loading}
                  />
                </details>
              )}
            </div>
          )}
          </div>

          <details className="mb-4 border-t border-[#E4D8C8] pt-3 text-[#5C4636]">
            <summary className="cursor-pointer text-[11px] uppercase tracking-[0.16em] text-[#8A7563]">Модель и шлюз</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useStreaming}
                onChange={(e) => setUseStreaming(e.target.checked)}
                className="w-4 h-4 text-primary-600"
                disabled={loading || stabilityMode}
              />
              <span className="text-sm">Streaming</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={stabilityMode}
                onChange={(e) => {
                  const enabled = e.target.checked
                  setStabilityMode(enabled)
                  if (enabled) setUseStreaming(false)
                }}
                className="w-4 h-4 text-amber-600"
                disabled={loading}
              />
              <span className="text-sm leading-tight">
                <span className="font-medium text-[#6B5A32]">Режим стабильности</span>
                <span className="block text-[11px] text-gray-500">
                  Для слабых ПК/Windows и нестабильной сети: отключает streaming, снижает риск таймаутов.
                </span>
              </span>
            </label>
            <select
              value={gateway}
              onChange={(e) => {
                const next = e.target.value as LlmGateway
                setGateway(next)
                localStorage.setItem('protocol-llm-provider', next)
              }}
              className={fieldClass}
              disabled={loading}
            >
              
              <option value="openrouter">Шлюз: OpenRouter</option>
            </select>
            <select value={model} onChange={(e) => setModel(e.target.value as any)} className={fieldClass} disabled={loading}>
              <option value="gpt52">GPT-6.1 Sol, быстрее</option>
              <option value="grok45">Grok 4.5</option>
              <option value="sonnet">Sonnet 5.5, подробнее</option>
              <option value="opus">Opus 5.5</option>
              <option value="gemini">Gemini 3.8</option>
            </select>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[#5E726E]">
              Протокол сначала запрашивается у Polza. Если она недоступна, запрос уходит в OpenRouter.
            </p>
          {protocolModelRecommendation && (
            <div className="mb-4 rounded-[10px] bg-[#F7F3EA] px-3 py-2.5 text-xs text-[#6B5A32]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[#6B5A32]">
                  Рекомендуем: {protocolModelLabelMap[protocolModelRecommendation.model]}
                </span>
                <span className="text-amber-800">{protocolModelRecommendation.title}</span>
                {model !== protocolModelRecommendation.model ? (
                  <button
                    type="button"
                    onClick={() => setModel(protocolModelRecommendation.model)}
                    className="ml-auto bg-[#9C4221] px-3 py-1 text-[11px] text-[#FBF7F0] hover:bg-[#7C341A]"
                    disabled={loading}
                  >
                    Применить
                  </button>
                ) : (
                  <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    Уже выбрано
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-amber-700">{protocolModelRecommendation.reason}</p>
            </div>
          )}
          </details>

          <button onClick={handleGenerateProtocol} data-tour="protocol-generate-button" disabled={!rawText.trim() || loading} className="bg-[#9C4221] px-6 py-3 text-sm font-medium tracking-wide text-[#FBF7F0] transition-colors hover:bg-[#7C341A] disabled:opacity-50">
            {loading ? 'Формируем протокол...' : 'Составить протокол'}
          </button>
        </section>

        <section className="relative border border-[#E4D8C8] bg-[#FBF7F0] px-6 py-7 shadow-[0_24px_60px_rgba(28,22,18,0.12)] before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-[#C46A3A]">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3 pl-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#8A7563]">Лист приёма</p>
              <h2 className="mt-1 font-serif text-3xl font-medium">Протокол</h2>
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-[#5C4636]">
                {protocol ? 'Правьте прямо здесь. Рецепты, печать и взаимодействия читают этот текст.' : 'После составления лист откроется здесь.'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {currentCost > 0 && (
                  <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#9C4221]">
                    Стоимость: {currentCost.toFixed(2)} ед.
                  </span>
                )}
                {resolvedModel && (
                  <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#8A7563]">
                    {resolvedModel}
                  </span>
                )}
              </div>
            </div>
            <button onClick={handleCopyProtocol} disabled={!protocol || loading} className="text-[11px] uppercase tracking-[0.14em] text-[#8A7563] hover:text-[#9C4221] disabled:opacity-40">
              Копия
            </button>
          </div>

          {protocol ? (
            <section className="mb-5 block pl-2" aria-label="Редактор протокола">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <span className={labelClass}>{editingProtocol ? 'Редактирование протокола' : 'Готовый вид протокола'}</span>
                <button type="button" onClick={()=>setEditingProtocol(value=>!value)} disabled={loading}
                  className="border border-[#9C4221] px-3 py-1.5 text-sm text-[#9C4221] hover:bg-[#f5e6d7] disabled:opacity-40">
                  {editingProtocol ? 'Завершить редактирование' : 'Редактировать текст'}
                </button>
              </div>
              {editingProtocol ? (
                <textarea
                  data-tour="protocol-generated-result"
                  aria-label="Текст протокола для исправления врачом"
                  value={protocol}
                  onChange={(e) => {
                    setProtocol(e.target.value)
                    setInteractionChecked(false)
                    setInteractionResults([])
                  }}
                  disabled={loading}
                  className="mt-1 min-h-[420px] w-full resize-y border border-[#C9BBA8] bg-white px-4 py-3 font-serif text-[15px] leading-7 text-[#1C1612] outline-none focus:border-[#9C4221]"
                />
              ) : (
                <div data-tour="protocol-generated-result" className="prose max-w-none min-h-[280px] border border-[#C9BBA8] bg-white px-5 py-4 font-serif text-[15px] leading-7 text-[#1C1612]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{protocol.replace(/\\([*#_])/g,'$1')}</ReactMarkdown>
                </div>
              )}
            </section>
          ) : (
            <div className="mb-5 border border-dashed border-[#C9BBA8] px-6 py-16 text-sm text-[#8A7563]">
              {loading ? 'Формируем протокол. Он появится в этом поле, и его можно будет править сразу.' : 'Нажмите «Составить протокол». Текст откроется в этом поле для правки.'}
            </div>
          )}

          <div className="mb-5 grid grid-cols-1 gap-2 pl-2 sm:grid-cols-2">
            <button onClick={openPrescriptionLayout} disabled={!protocol || loading} className="bg-[#9C4221] px-3 py-2.5 text-left text-xs text-[#FBF7F0] hover:bg-[#7C341A] disabled:cursor-not-allowed disabled:opacity-40">Написать рецепты</button>
            <button onClick={handlePrintProtocol} disabled={!protocol || loading} className={docAction}>Печать протокола</button>
            <button onClick={handleShareProtocol} disabled={!protocol || loading} className={docAction}>Поделиться</button>
            <button onClick={handleExportToDocx} disabled={!protocol || loading} className={docAction}>Скачать документ</button>
            <button onClick={handleAnalyzeInteractions} disabled={!protocol || loading || interactionLoading} className={`${docAction} sm:col-span-2`}>
              {interactionLoading ? 'Проверяем правку...' : 'Проверить взаимодействие по правке'}
            </button>
          </div>

          {protocol && (
            <div className="mt-4 rounded-[10px] bg-[#F8F4EE] p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium text-[#6B5A32]">Взаимодействия по исправленному тексту</h3>
                {interactionDetectorModel && (
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border bg-white text-orange-700 border-orange-200">
                    Detect: {interactionDetectorModel}
                  </span>
                )}
                {interactionExplainerModel && (
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border bg-white text-orange-700 border-orange-200">
                    Explain: {interactionExplainerModel}
                  </span>
                )}
              </div>

              {!interactionLoading && !interactionError && interactionResults.length === 0 && (
                interactionChecked ? (
                  <p className="text-xs text-gray-600">
                    По локальному справочнику клинически значимые взаимодействия не выявлены.
                  </p>
                ) : (
                  <p className="text-xs text-gray-600">
                    Нажмите «Проверить взаимодействие по правке»: проверка возьмёт текст, который сейчас на листе.
                  </p>
                )
              )}

              {interactionError && (
                <p className="text-xs text-red-700">{interactionError}</p>
              )}

              {interactionLoading && (
                <p className="text-xs text-orange-700">Проверяем потенциальные взаимодействия...</p>
              )}

              {interactionResults.length > 0 && (
                <div className="space-y-2">
                  {interactionResults.map((item, idx) => {
                    const severityUi = getSeverityUi(item.severity)
                    return (
                      <div key={`${item.pair[0]}-${item.pair[1]}-${idx}`} className="bg-white border border-orange-100 rounded-md p-3">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <strong className="text-sm text-gray-900">{item.pair[0]} + {item.pair[1]}</strong>
                          <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${severityUi.badgeClass}`}>
                            {severityUi.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700"><strong>Механизм:</strong> {item.mechanism}</p>
                        <p className="text-xs text-gray-700"><strong>Пояснение:</strong> {item.explanation}</p>
                        <p className="text-xs text-gray-700"><strong>Тактика:</strong> {item.recommendation}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </section>
        </div>
      </div>
    </div></>
  )
}
