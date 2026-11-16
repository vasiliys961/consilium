'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import GlobalProtocolChrome from '@/components/GlobalProtocolChrome'
import GlobalCaseBridge from '@/components/GlobalCaseBridge'
import {nativeProtocolUi} from '@/lib/native-ui'
import AudioUpload from '@/components/AudioUpload'

const VoiceInput = dynamic(() => import('@/components/VoiceInput'), { ssr: false })

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } from 'docx'
import { saveAs } from 'file-saver'
import { DEFAULT_TEMPLATES, ProtocolTemplate } from '@/lib/protocol-templates'
import { UNIVERSAL_SPECIALIST_TEMPLATES } from '@/lib/prompts'
import { MODELS } from '@/lib/openrouter'
import { handleSSEStream } from '@/lib/streaming-utils'
import { logUsage, recordUsageCost } from '@/lib/simple-logger'
import { AUDIO_TRANSCRIPTION_CREDITS_PER_HOUR, calculateCost } from '@/lib/cost-calculator'
import { saveDocument, getDocumentChunks, searchLibraryLocal } from '@/lib/library-db'
import { anonymizeText } from '@/lib/anonymization'
import { finalizeProtocolDocument } from '@/lib/protocol-presentation'
import { getDiagnosticReportUi, isDiagnosticTemplateId, resolveDiagnosticKindFromTemplateId } from '@/lib/diagnostic-report'
import { finalizeStage2Note, isValidStage2Note } from '@/lib/protocol-stage2'
import { getClientLocale,setClientLocale } from '@/lib/i18n/client'
import { protocolMessages } from '@/lib/i18n/ui-client-messages'
import { isLocale, type Locale } from '@/lib/i18n/config'
import mammoth from 'mammoth'

declare global {
  interface Window {
    pdfjsLib: any
  }
}

const PROTOCOL_DRAFT_KEY = 'protocol_draft'
const PROTOCOL_TEMPLATE_RAG_KEY = 'protocol_template_rag_doc_id'
const CYRILLIC_REGEX = /[А-Яа-яЁё]/
const PROTOCOL_USAGE_SECTION = 'appointment-protocol'

type ProtocolCostPart = 'stt' | 'prep' | 'stage1' | 'stage2'

function formatConversationClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function readApiUsage(data: any): { prompt_tokens: number; completion_tokens: number; total_cost: number } | null {
  const usage = data?.usage
  if (!usage || typeof usage !== 'object') return null
  const promptTokens = Number(usage.prompt_tokens) || 0
  const completionTokens = Number(usage.completion_tokens) || 0
  const totalCost = Number(usage.total_cost) || 0
  if (totalCost <= 0 && promptTokens <= 0 && completionTokens <= 0) return null
  return { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_cost: totalCost }
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
  const [locale, setLocale] = useState<Locale>('en')
  const [speechReady,setSpeechReady]=useState<boolean|null>(null)
  const sourceMessages = protocolMessages[locale] || protocolMessages.en
  const t = Object.fromEntries(Object.entries(sourceMessages).map(([key,value])=>[key,typeof value==='string'?nativeProtocolUi(locale,value):value])) as typeof sourceMessages
  const ui=(text:string)=>nativeProtocolUi(locale,text)
  const chooseLocale=(next:Locale)=>{setClientLocale(next);setLocale(next);window.dispatchEvent(new Event('protocol-locale'));}
  const [rawText, setRawText] = useState('')
  const [showConversationRecorder, setShowConversationRecorder] = useState(false)
  const [conversationTranscriptText, setConversationTranscriptText] = useState('')
  const [recordedDraftText, setRecordedDraftText] = useState('')
  const [draftFromConversationLoading, setDraftFromConversationLoading] = useState(false)
  const [draftFromConversationError, setDraftFromConversationError] = useState('')
  const [draftFromConversationModel, setDraftFromConversationModel] = useState<string | null>(null)
  const [autoInsertConversationToProtocol, setAutoInsertConversationToProtocol] = useState(false)
  const [conversationStats, setConversationStats] = useState({ duration: 0, cost: 0 })
  const [protocol, setProtocol] = useState('')
  const [editingDraft,setEditingDraft]=useState(false)
  const [editingFinal,setEditingFinal]=useState(false)
  const [finalNote, setFinalNote] = useState('')
  const [physicianAdditions, setPhysicianAdditions] = useState('')
  const [finalNoteLoading, setFinalNoteLoading] = useState(false)
  const [finalNoteError, setFinalNoteError] = useState('')
  const [loading, setLoading] = useState(false)
  const [useStreaming, setUseStreaming] = useState(true)
  const [model, setModel] = useState<'sonnet' | 'opus' | 'gemini' | 'gpt52'>('sonnet')
  const [currentCost, setCurrentCost] = useState<number>(0)
  
  // Состояния для специалистов и шаблонов
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(DEFAULT_TEMPLATES[0].id)
  const [specialistName, setSpecialistName] = useState(DEFAULT_TEMPLATES[0].specialist)
  const [customTemplate, setCustomTemplate] = useState(DEFAULT_TEMPLATES[0].content)
  const [isEditingTemplate, setIsEditingTemplate] = useState(false)
  const [templateRagDocId, setTemplateRagDocId] = useState<string | null>(null)
  const [isTemplateLocked, setIsTemplateLocked] = useState(false)
  const [strictTemplateMode, setStrictTemplateMode] = useState(false)

  // Универсальные промпты
  const [selectedUniversalKey, setSelectedUniversalKey] = useState<string>('')
  const [universalPrompt, setUniversalPrompt] = useState<string>('')
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const conversationRecorderRef = useRef<HTMLDivElement | null>(null)
  const costPartsRef = useRef<Record<ProtocolCostPart, number>>({ stt: 0, prep: 0, stage1: 0, stage2: 0 })

  const publishSessionCost = () => {
    const parts = costPartsRef.current
    setCurrentCost(parts.stt + parts.prep + parts.stage1 + parts.stage2)
  }

  const setCostPart = (part: ProtocolCostPart, amount: number, mode: 'set' | 'add' = 'set') => {
    const next = Math.max(0, Number(amount) || 0)
    costPartsRef.current[part] = mode === 'add' ? costPartsRef.current[part] + next : next
    publishSessionCost()
  }

  const logProtocolUsage = (params: { model: string; inputTokens: number; outputTokens: number }) => {
    if (params.inputTokens <= 0 && params.outputTokens <= 0) return
    logUsage({
      section: PROTOCOL_USAGE_SECTION,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      specialty: specialistName,
    })
  }

  useEffect(()=>{let alive=true;fetch('/api/concilium/health').then(r=>r.json()).then(v=>{if(alive)setSpeechReady(v.assemblyAi===true);}).catch(()=>{if(alive)setSpeechReady(false);});return()=>{alive=false;};},[]);
  useEffect(() => {
    const requested=new URLSearchParams(location.search).get('protocolLocale');
    const saved=isLocale(requested)?requested:getClientLocale();setLocale(saved);setClientLocale(saved)
  }, [])

  useEffect(() => {
    if (!showConversationRecorder) return
    conversationRecorderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showConversationRecorder])

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
        console.warn('⚠️ Failed to load PDF.js on protocol page')
      }
      document.head.appendChild(script)
    } else if (window.pdfjsLib) {
      setPdfJsLoaded(true)
    }
  }, [])

  // Загрузка пользовательского шаблона при старте
  useEffect(() => {
    const saved = localStorage.getItem('user_protocol_template')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        const hasLegacyRussianTemplate =
          CYRILLIC_REGEX.test(parsed?.template || '') ||
          CYRILLIC_REGEX.test(parsed?.name || '')

        // Reset legacy RU template snapshot to keep EN-global branch consistent.
        if (hasLegacyRussianTemplate) {
          localStorage.removeItem('user_protocol_template')
        } else {
          setCustomTemplate(parsed.template)
          setSpecialistName(parsed.name || specialistName)
          setIsEditingTemplate(true)
          if (parsed.ragDocId) {
            setTemplateRagDocId(parsed.ragDocId)
          }
        }
      } catch (e) {}
    }
    const ragDocId = localStorage.getItem(PROTOCOL_TEMPLATE_RAG_KEY)
    if (ragDocId) setTemplateRagDocId(ragDocId)
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
      ragDocId: templateRagDocId
    }
    localStorage.setItem('user_protocol_template', JSON.stringify(data))
    alert(ui("Template saved as your personal standard!"))
  }

  const readTextFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => resolve((event.target?.result as string) || '')
      reader.onerror = () => reject(new Error('Failed to read text file'))
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

    const columnCount = Math.max(...rows.map((r) => r.length))
    const normalizeRow = (row: string[]) =>
      [...row, ...new Array(Math.max(0, columnCount - row.length)).fill('')].slice(0, columnCount)

    const header = normalizeRow(rows[0])
    const bodyRows = rows.slice(1).map(normalizeRow)
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
      throw new Error('Failed to read Word file. For .doc, prefer .docx.')
    }
  }

  const extractPdfTemplate = async (file: File): Promise<string> => {
    if (!pdfJsLoaded || !window.pdfjsLib) {
      throw new Error('PDF module is still loading. Wait 2-3 seconds and try again.')
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
        pages.push(`=== Page ${pageNum} ===\n${pageText}`)
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

    throw new Error('Supported formats: .txt, .doc/.docx, .pdf')
  }

  const handleLoadFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    void (async () => {
      const content = (await extractTemplateContent(file)).trim()
      if (!content) {
        throw new Error('File was read, but template content is empty.')
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
          name: `Protocol template: ${file.name}`,
          size: file.size,
          uploaded_at: new Date().toISOString(),
          chunksCount: chunks.length,
        },
        chunks
      )
      setTemplateRagDocId(docId)
      localStorage.setItem(PROTOCOL_TEMPLATE_RAG_KEY, docId)
      alert(ui("Template loaded and saved to library as RAG sample."))
    })().catch((error) => {
      console.error('Template load error:', error)
      alert(error?.message || 'Failed to load template file.')
    }).finally(() => {
      e.target.value = ''
    })
  }

  const handleGenerateProtocol = async () => {
    const previousProtocol=protocol;const previousFinal=finalNote;const previousCosts={...costPartsRef.current};
    if (!rawText.trim()) return

    setLoading(true)
    setProtocol('')
    setFinalNote('')
    setFinalNoteError('')
    costPartsRef.current.stage1 = 0
    costPartsRef.current.stage2 = 0
    publishSessionCost()

    const modelsMap: Record<string, string> = {
      'opus': MODELS.OPUS,
      'sonnet': MODELS.SONNET,
      'gpt52': MODELS.GPT_5_2,
      'gemini': MODELS.GEMINI_3_PRO
    };

    const finalModel = modelsMap[model] || MODELS.SONNET;
    const safeRawText = rawText.trim()

    try {
      let ragExamples: string[] = []
      if (templateRagDocId) {
        ragExamples = await getDocumentChunks(templateRagDocId, 8)
      } else if (safeRawText) {
        ragExamples = await searchLibraryLocal(`${specialistName} ${safeRawText}`, 3)
      }

      const payload = {
        rawText: safeRawText,
        useStreaming: useStreaming,
        model: model,
        templateId: selectedTemplateId,
        customTemplate: customTemplate,
        specialistName: specialistName,
        // Добавляем универсальный промпт, если он есть
        universalPrompt: universalPrompt,
        ragExamples,
        strictTemplateMode,
      };

      if (useStreaming) {
        const response = await fetch('/api/protocol', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json','x-opus-locale':locale },
          body: JSON.stringify(payload),
        })

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)

        let lastUsage: { total_cost: number; prompt_tokens: number; completion_tokens: number; model?: string } | null = null
        await handleSSEStream(response, {
          onChunk: (text) => {
            setProtocol(prev => prev + text)
          },
          onUsage: (usage) => {
            if (!(usage.total_cost > 0)) return
            lastUsage = usage
            setCostPart('stage1', usage.total_cost)
          },
          onComplete: (finalText) => {
            setProtocol(finalizeProtocolDocument(finalText, customTemplate))
            if (lastUsage) {
              logProtocolUsage({
                model: lastUsage.model || finalModel,
                inputTokens: lastUsage.prompt_tokens,
                outputTokens: lastUsage.completion_tokens,
              })
            }
          }
        })
      } else {
        const response = await fetch('/api/protocol', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json','x-opus-locale':locale },
          body: JSON.stringify(payload),
        })
        const data = await response.json()
        if (data.success) {
          setProtocol(data.protocol)
          const usage = readApiUsage(data)
          const inputTokens = usage?.prompt_tokens || Math.ceil(rawText.length / 4) + 1000
          const outputTokens = usage?.completion_tokens || Math.ceil(String(data.protocol || '').length / 4)
          const cost = usage?.total_cost || calculateCost(inputTokens, outputTokens, finalModel).totalCostUnits
          setCostPart('stage1', cost)
          logProtocolUsage({
            model: finalModel,
            inputTokens,
            outputTokens,
          })
        }
        else setProtocol(`Error: ${data.error}`)
      }
    } catch (err: any) {
      if(err?.name==='PrivacyReviewCancelled'){setProtocol(previousProtocol);setFinalNote(previousFinal);costPartsRef.current=previousCosts;publishSessionCost();return;}
      setProtocol(`Error: ${err.message}`)
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

  const diagnosticKind = resolveDiagnosticKindFromTemplateId(selectedTemplateId)
  const isDiagnosticProtocol = isDiagnosticTemplateId(selectedTemplateId)
  const exportableNote = isDiagnosticProtocol ? protocol : finalNote

  const handleGenerateFinalNote = async () => {
    if (!protocol.trim() || isDiagnosticProtocol) return

    setFinalNoteLoading(true)
    setFinalNoteError('')
    setFinalNote('')
    costPartsRef.current.stage2 = 0
    publishSessionCost()
    try {
      const payload = {
        draft: protocol,
        physicianAdditions,
        specialistName,
        model,
        useStreaming,
      }

      if (useStreaming) {
        const response = await fetch('/api/protocol/final-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json','x-opus-locale':locale },
          body: JSON.stringify(payload),
        })
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)

        let lastUsage: { total_cost: number; prompt_tokens: number; completion_tokens: number; model?: string } | null = null
        await handleSSEStream(response, {
          onChunk: (text) => {
            setFinalNote((prev) => prev + text)
          },
          onUsage: (usage) => {
            if (!(usage.total_cost > 0)) return
            lastUsage = usage
            setCostPart('stage2', usage.total_cost)
          },
          onComplete: async (finalText) => {
            const cleaned = finalizeStage2Note(finalText)
            if (lastUsage) {
              logProtocolUsage({
                model: lastUsage.model || MODELS.SONNET,
                inputTokens: lastUsage.prompt_tokens,
                outputTokens: lastUsage.completion_tokens,
              })
            }
            if (isValidStage2Note(cleaned)) {
              setFinalNote(cleaned)
              return
            }

            const retryResponse = await fetch('/api/protocol/final-note', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json','x-opus-locale':locale },
              body: JSON.stringify({ ...payload, useStreaming: false }),
            })
            const retryData = await retryResponse.json()
            if (!retryData?.success) {
              throw new Error(retryData?.error || t.finalNoteError)
            }
            setFinalNote(String(retryData.finalNote || '').trim())
            const retryUsage = readApiUsage(retryData)
            if (retryUsage) {
              setCostPart('stage2', retryUsage.total_cost, 'add')
              logProtocolUsage({
                model: String(retryData.modelUsed || payload.model),
                inputTokens: retryUsage.prompt_tokens,
                outputTokens: retryUsage.completion_tokens,
              })
            }
          },
        })
      } else {
        const response = await fetch('/api/protocol/final-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json','x-opus-locale':locale },
          body: JSON.stringify({ ...payload, useStreaming: false }),
        })
        const data = await response.json()
        if (!data?.success) {
          throw new Error(data?.error || t.finalNoteError)
        }
        setFinalNote(String(data.finalNote || '').trim())
        const usage = readApiUsage(data)
        if (usage) {
          setCostPart('stage2', usage.total_cost)
          logProtocolUsage({
            model: String(data.modelUsed || payload.model),
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
          })
        }
      }
    } catch (error: any) {
      setFinalNote('')
      setFinalNoteError(error?.message || t.finalNoteError)
    } finally {
      setFinalNoteLoading(false)
    }
  }

  const handleExportToDocx = async () => {
    if (!exportableNote) return
    try {
      const lines = exportableNote.split('\n')
      const paragraphs: any[] = []
      for (const line of lines) {
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
            if (match.index > lastIndex) textRuns.push(new TextRun({ text: line.substring(lastIndex, match.index) }))
            textRuns.push(new TextRun({ text: match[1], bold: true }))
            lastIndex = match.index + match[0].length
          }
          if (lastIndex < line.length) textRuns.push(new TextRun({ text: line.substring(lastIndex) }))
          paragraphs.push(new Paragraph({ children: textRuns.length > 0 ? textRuns : [new TextRun({ text: line })], spacing: { after: 120 } }))
        }
      }
      const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] })
      const blob = await Packer.toBlob(doc)
      const datePart = new Date().toISOString().split('T')[0]
      const filePrefix = diagnosticKind
        ? getDiagnosticReportUi(diagnosticKind).filePrefix
        : "Clinical_Note_SOAP"
      saveAs(blob, `${filePrefix}_${datePart}.docx`)
    } catch (err: any) {
      alert('Export error: ' + err.message)
    }
  }

  const buildDraftFromConversation = async (transcriptText: string) => {
    const safeTranscript = (transcriptText || '').trim()
    if (!safeTranscript) return

    setDraftFromConversationLoading(true)
    setDraftFromConversationError('')
    try {
      const response = await fetch('/api/protocol/dialogue-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json','x-opus-locale':locale },
        body: JSON.stringify({
          transcript: safeTranscript,
          specialistName,
        }),
      })
      const data = await response.json()
      if (!data?.success) {
        throw new Error(data?.error || t.draftError)
      }
      const draft = String(data?.draft || '').trim()
      if (!draft) {
        throw new Error(t.draftError)
      }
      setRecordedDraftText(draft)
      setDraftFromConversationModel(typeof data?.modelUsed === 'string' ? data.modelUsed : null)
      const usage = readApiUsage(data)
      if (usage) {
        setCostPart('prep', usage.total_cost, 'add')
        logProtocolUsage({
          model: typeof data?.modelUsed === 'string' ? data.modelUsed : MODELS.HAIKU,
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
        })
      }
      if (autoInsertConversationToProtocol) {
        setRawText((prev) => (prev ? `${prev}\n\n${draft}` : draft))
      }
    } catch (error: any) {
      setDraftFromConversationError(error?.message || t.draftError)
      setRecordedDraftText(safeTranscript)
      setDraftFromConversationModel(null)
      if (autoInsertConversationToProtocol) {
        setRawText((prev) => (prev ? `${prev}\n\n${safeTranscript}` : safeTranscript))
      }
    } finally {
      setDraftFromConversationLoading(false)
    }
  }

  const restoreGlobal=(saved:Record<string,string>)=>{setProtocol(saved.reasoningDraft);setFinalNote(saved.finalNote);setPhysicianAdditions(saved.physicianAdditions);setSelectedTemplateId(saved.templateId);setSpecialistName(saved.specialistName);setCustomTemplate(saved.customTemplate);setUniversalPrompt(saved.universalPrompt);}
  useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';},[locale]);
  return (
    <><GlobalCaseBridge locale={locale} rawText={rawText} state={{reasoningDraft:protocol,finalNote,physicianAdditions,templateId:selectedTemplateId,specialistName,customTemplate,universalPrompt}} diagnostic={isDiagnosticProtocol} busy={loading||finalNoteLoading||draftFromConversationLoading} onImport={setRawText} onRestore={restoreGlobal} onLocale={chooseLocale}/><GlobalProtocolChrome locale={locale} onLocale={chooseLocale} busy={loading||finalNoteLoading||draftFromConversationLoading}>
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8">
      <h1 className="mb-6 border-b border-[#CDBFAE] pb-6 font-serif text-4xl font-medium text-[#1C1612]">
        {isDiagnosticProtocol
          ? `📄 ${diagnosticKind ? getDiagnosticReportUi(diagnosticKind).title : t.generatedProtocol}`
          : `📝 ${t.appointmentProtocol}`}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="min-w-0 space-y-6">
          <h2 className="text-xl font-semibold mb-4">{ui("Settings and Input")}</h2>

          {/* Специалист и Шаблоны */}
          <div className="mb-6 space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">{ui("👨‍⚕️ Who is performing the examination:")}</label>
                <input 
                  type="text" dir="auto"
                  value={specialistName}
                  onChange={(e) => setSpecialistName(e.target.value)}
                  placeholder={ui("Example: Neurologist")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">{ui("🏥 Specialty (template):")}</label>
                <select 
                  value={selectedUniversalKey}
                  onChange={(e) => handleUniversalSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white"
                >
                  <option value="">{ui("-- Select specialty --")}</option>
                  {Object.entries(UNIVERSAL_SPECIALIST_TEMPLATES).map(([key, tpl]) => (
                    <option key={key} value={key}>{ui(tpl.name)}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedUniversalKey && (
              <div className="animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-black text-indigo-600 uppercase tracking-widest">{ui("AI Instructions (editable):")}</label>
                  <span className="text-[10px] text-gray-400 italic">{ui("Focus:")}{ui(UNIVERSAL_SPECIALIST_TEMPLATES[selectedUniversalKey].focus)}</span>
                </div>
                <textarea dir="auto"
                  value={universalPrompt}
                  onChange={(e) => setUniversalPrompt(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none min-h-[60px] bg-indigo-50/30 font-medium leading-relaxed"
                  placeholder={ui("Specific instructions for this clinician...")}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider italic">{ui("Quick formatting:")}</label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all border ${
                      selectedTemplateId === tpl.id 
                        ? 'bg-primary-500 text-white border-primary-600' 
                        : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'
                    }`}
                  >
                    {ui(tpl.name)}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setIsEditingTemplate(!isEditingTemplate)}
              className="text-[10px] font-bold text-primary-600 hover:underline flex items-center gap-1 uppercase tracking-tighter"
            >
              {isEditingTemplate ? ui("🔼 Hide document structure") : ui("⚙️ Configure document structure (H1, H2...)")}
            </button>

            {isEditingTemplate && (
              <div className="mt-2 animate-in fade-in slide-in-from-top-1 space-y-2">
                <textarea dir="auto"
                  value={customTemplate}
                  onChange={(e) => {
                    setCustomTemplate(e.target.value)
                    if (!isTemplateLocked) setIsTemplateLocked(true)
                  }}
                  className="w-full px-3 py-2 text-[10px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none min-h-[150px] font-mono leading-tight bg-white"
                />
                <label className="inline-flex items-center gap-2 text-[10px] font-semibold text-indigo-700">
                  <input
                    type="checkbox"
                    checked={isTemplateLocked}
                    onChange={(e) => setIsTemplateLocked(e.target.checked)}
                    className="w-3.5 h-3.5"
                  />
                  {ui("🔒 Pin my template (do not overwrite when changing specialist)")}</label>
                <label className="inline-flex items-center gap-2 text-[10px] font-semibold text-indigo-700">
                  <input
                    type="checkbox"
                    checked={strictTemplateMode}
                    onChange={(e) => setStrictTemplateMode(e.target.checked)}
                    className="w-3.5 h-3.5"
                  />
                  {ui("🧷 Strictly preserve template structure")}</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSaveAsDefault}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    {ui("💾 Save as my standard")}</button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-[10px] font-bold hover:bg-gray-700 transition-colors shadow-sm"
                  >
                    {ui("📁 Load from file (.txt/.docx/.pdf)")}</button>
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
          
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">{ui("Text to process:")}</label>
              <VoiceInput 
                onTranscript={(text) => setRawText(prev => prev ? prev + ' ' + text : text)}
                disabled={loading}
                className="!bg-indigo-600 !text-white hover:!bg-indigo-700"
                placeholder={ui("Dictate")}
              />
            </div>
            <textarea dir="auto"
              aria-label={ui("Text to process:")}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={ui("Enter examination data or use 🎤...")}
              data-tour="protocol-input"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none min-h-[300px]"
              disabled={loading}
            />
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            <button onClick={() => setShowConversationRecorder(!showConversationRecorder)} className="px-4 py-2 bg-secondary-500 hover:bg-secondary-600 text-white rounded-lg transition-colors text-sm" disabled={loading}>
              🎙️ {t.recordConversation}
            </button>
            <button onClick={() => setRawText('')} className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm" disabled={!rawText || loading}>
              🗑️ {t.clear}
            </button>
          </div>

          {showConversationRecorder && (
            <div ref={conversationRecorderRef} className="mb-4 bg-white rounded-lg shadow-lg p-4 border border-indigo-100">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">🎙️ {t.conversationTitle}</h3>
                <button onClick={() => setShowConversationRecorder(false)} className="text-gray-500 hover:text-gray-700">✕</button>
              </div>
              <p className="text-[11px] text-gray-500 mb-2">
                {t.conversationHint}
              </p>
              <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-2">
                {t.conversationCostHint.replace('{rate}', String(AUDIO_TRANSCRIPTION_CREDITS_PER_HOUR))}
              </p>
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                {t.conversationStartHint}
              </p>
              {conversationStats.duration > 0 && (
                <p className="text-[11px] font-semibold text-indigo-800 mb-3">
                  ⏱️ {t.conversationRecorded}: {formatConversationClock(conversationStats.duration)} {ui("· STT")}{conversationStats.cost.toFixed(2)} {ui("cr.")}</p>
              )}
              <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-indigo-700 mb-3">
                <input
                  type="checkbox"
                  checked={autoInsertConversationToProtocol}
                  onChange={(e) => setAutoInsertConversationToProtocol(e.target.checked)}
                  className="w-3.5 h-3.5"
                />
                {t.autoInsertDraft}
              </label>
              {speechReady?<AudioUpload maxSize={100}
                onTranscribe={(transcript, meta) => {
                  if (meta?.cost) {
                    setCostPart('stt', meta.cost, 'add')
                    recordUsageCost({
                      section: 'appointment-protocol',
                      model: 'assemblyai',
                      costUnits: meta.cost,
                    })
                  }
                  if (meta?.duration || meta?.cost) {
                    setConversationStats((prev) => ({
                      duration: prev.duration + (Number(meta.duration) || 0),
                      cost: prev.cost + (Number(meta.cost) || 0),
                    }))
                  }
                  const nextTranscript = conversationTranscriptText
                    ? `${conversationTranscriptText}\n\n${transcript}`
                    : transcript
                  setConversationTranscriptText(nextTranscript)
                  void buildDraftFromConversation(nextTranscript)
                }}
              />:<p role="status" className="text-sm leading-relaxed">{speechReady===null?ui("Checking audio transcription..."):ui("Audio-file transcription is not configured in this installation. Browser dictation may still be available.")}</p>}
              {draftFromConversationLoading && (
                <p className="mt-2 text-xs text-indigo-600">⏳ {t.draftLoading}</p>
              )}
              {draftFromConversationError && (
                <p className="mt-2 text-xs text-amber-700">⚠️ {draftFromConversationError}</p>
              )}
              {draftFromConversationModel && (
                <p className="mt-2 text-[11px] text-blue-700">🤖 {t.draftModel}: {draftFromConversationModel}</p>
              )}
              {recordedDraftText && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-700 mb-2">{t.draftLabel}</label>
                  <textarea dir="auto"
                    value={recordedDraftText}
                    onChange={(e) => setRecordedDraftText(e.target.value)}
                    className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-xs min-h-[140px] focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder={t.draftPlaceholder}
                    disabled={loading}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => setRawText(prev => prev ? `${prev}\n\n${recordedDraftText}` : recordedDraftText)}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
                      disabled={loading || !recordedDraftText.trim()}
                    >
                      ➕ {t.insertDraft}
                    </button>
                    <button
                      onClick={() => setRecordedDraftText('')}
                      className="px-3 py-1.5 bg-gray-500 text-white rounded-lg text-xs font-semibold hover:bg-gray-600 transition-colors"
                      disabled={loading}
                    >
                      🗑️ {t.clearDraft}
                    </button>
                  </div>
                </div>
              )}
              {conversationTranscriptText && (
                <details className="mt-3">
                  <summary className="text-xs text-gray-500 cursor-pointer">{t.showRawTranscript}</summary>
                  <textarea dir="auto"
                    value={conversationTranscriptText}
                    onChange={(e) => setConversationTranscriptText(e.target.value)}
                    className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-xs min-h-[100px] focus:ring-2 focus:ring-gray-400 outline-none"
                    disabled={loading}
                  />
                </details>
              )}
            </div>
          )}

          <div className="mb-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={useStreaming} onChange={(e) => setUseStreaming(e.target.checked)} className="w-4 h-4 text-primary-600" disabled={loading} />
              <span className="text-sm">{ui("Streaming")}</span>
            </label>
            <select value={model} onChange={(e) => setModel(e.target.value as any)} className="px-2 py-1 border border-gray-300 rounded text-sm outline-none focus:ring-2 focus:ring-primary-500" disabled={loading}>
              <option value="sonnet">{ui("🤖 Sonnet 5.5")}</option>
              <option value="gpt52">{ui("🚀 GPT-6.1 Sol")}</option>
              <option value="opus">{ui("🧠 Opus 5.5")}</option>
              <option value="gemini">{ui("⚡ Gemini 3.1 Pro")}</option>
            </select>
          </div>

          <button onClick={handleGenerateProtocol} data-tour="protocol-generate-button" disabled={!rawText.trim() || loading || finalNoteLoading} className="w-full px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50 font-semibold shadow-md">
            {loading ? `⏳ ${isDiagnosticProtocol ? t.generating : t.generatingDraft}` : `📝 ${isDiagnosticProtocol ? t.generateProtocol : t.generateDraft}`}
          </button>
        </div>

        <div className="min-w-0 border border-[#E4D8C8] border-l-[6px] border-l-[#C46A3A] bg-[#FBF7F0] px-6 py-7 shadow-[0_24px_60px_rgba(28,22,18,0.12)]">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold">{isDiagnosticProtocol ? t.generatedProtocol : t.draftTitle}</h2>
              {currentCost > 0 && (
                <div className="mt-1">
                  <div className="bg-teal-50 text-teal-700 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border border-teal-200 inline-block shadow-sm">
                    💰 {t.serviceCost}: {currentCost.toFixed(2)} {ui("cr.")}</div>
                  {conversationStats.cost > 0 && (
                    <div className="mt-1 text-[10px] text-teal-700">
                      {t.conversationRecorded}: {formatConversationClock(conversationStats.duration)} {ui("· STT")}{conversationStats.cost.toFixed(2)} {ui("cr.")}</div>
                  )}
                </div>
              )}
            </div>
            {isDiagnosticProtocol && protocol && (
              <div className="flex gap-2">
                <button onClick={() => { navigator.clipboard.writeText(protocol); alert(t.copied); }} className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm">📋</button>
                <button onClick={handleExportToDocx} className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm">{ui("📄 DOCX")}</button>
              </div>
            )}
          </div>

          {!isDiagnosticProtocol && protocol && (
            <p className="mb-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {t.draftWorkHint}
            </p>
          )}
          
          {protocol ? (
            isDiagnosticProtocol ? (
              <div data-tour="protocol-generated-result" className="prose prose-sm max-w-none border border-gray-200 rounded-lg p-6 bg-white overflow-y-auto max-h-[800px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{protocol}</ReactMarkdown>
              </div>
            ) : (
              <div>
                <button type="button" onClick={()=>setEditingDraft(value=>!value)} disabled={loading||finalNoteLoading}
                  className="mb-3 border border-[#9C4221] px-3 py-1.5 text-sm text-[#9C4221] disabled:opacity-40">
                  {editingDraft ? ui("Show formatted note") : ui("Edit text")}
                </button>
                {editingDraft ? (
                  <textarea dir="auto"
                    data-tour="protocol-generated-result"
                    aria-label={t.draftTitle}
                    value={protocol}
                    onChange={(e) => {
                      setProtocol(e.target.value)
                      setFinalNote('')
                    }}
                    className="w-full min-h-[280px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    disabled={loading || finalNoteLoading}
                  />
                ) : (
                  <div dir="auto" data-tour="protocol-generated-result" className="prose prose-sm max-w-none min-h-[260px] border border-gray-200 rounded-lg bg-white p-6">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{protocol.replace(/\\([*#_])/g,'$1')}</ReactMarkdown>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="text-center text-gray-500 py-20 border-2 border-dashed border-gray-100 rounded-lg">
              {loading ? <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div> : <p className="text-4xl mb-4 opacity-20">📄</p>}
              <p>{loading ? t.aiGenerating : t.resultWillAppear}</p>{!loading&&<button type="button" disabled={!rawText.trim()} onClick={()=>setProtocol(rawText)} className="mt-4 border border-[#9C4221] px-4 py-2 disabled:opacity-40">{ui("Open an editable working draft without AI")}</button>}
            </div>
          )}

          {!isDiagnosticProtocol && protocol && (
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-gray-700">
                {t.physicianAdditions}
                <textarea dir="auto"
                  value={physicianAdditions}
                  onChange={(e) => setPhysicianAdditions(e.target.value)}
                  placeholder={t.physicianAdditionsPlaceholder}
                  className="mt-1 w-full min-h-[88px] px-3 py-2 border border-indigo-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  disabled={loading || finalNoteLoading}
                />
              </label>
              <button
                onClick={handleGenerateFinalNote}
                disabled={finalNoteLoading || loading || !protocol.trim()}
                className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 font-semibold"
              >
                {finalNoteLoading ? `⏳ ${t.generatingFinalNote}` : `📋 ${t.generateFinalNote}`}
              </button>
              {finalNoteError && (
                <p className="text-xs text-amber-700">⚠️ {finalNoteError}</p>
              )}
            </div>
          )}

          {!isDiagnosticProtocol && finalNote && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <h3 className="text-lg font-semibold">{t.finalNoteTitle}</h3>
                  <p className="text-[11px] text-gray-500">{t.finalNoteHint}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(finalNote); alert(t.copied); }} className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm">📋</button>
                  <button onClick={handleExportToDocx} className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm">{ui("📄 DOCX")}</button>
                </div>
              </div>
              <div className="prose prose-sm max-w-none border border-indigo-100 rounded-lg p-6 bg-indigo-50/30 overflow-y-auto max-h-[520px]">
                <button type="button" onClick={()=>setEditingFinal(value=>!value)} disabled={loading||finalNoteLoading}
                  className="mb-3 border border-[#9C4221] px-3 py-1.5 text-sm text-[#9C4221] disabled:opacity-40">
                  {editingFinal ? ui("Show formatted note") : ui("Edit SOAP note")}
                </button>
                {editingFinal ?
                  <label>{ui("Review and edit SOAP note")}<textarea dir="auto" aria-label={ui("Review and edit SOAP note")}
                    value={finalNote} onChange={event=>setFinalNote(event.target.value)}
                    className="mt-2 min-h-[360px] w-full border border-[#C9BBA8] bg-white px-4 py-3" disabled={loading||finalNoteLoading}/></label>
                  : <div dir="auto" className="prose prose-sm max-w-none bg-white p-4">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{finalNote.replace(/\\([*#_])/g,'$1')}</ReactMarkdown>
                    </div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div></GlobalProtocolChrome></>
  )
}
