import { AsyncLocalStorage } from 'async_hooks'

const DEFAULT_POLZA_BASE_URL = 'https://polza.ai/api/v1'
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export type LlmProvider = 'polza' | 'openrouter'

const providerStorage = new AsyncLocalStorage<LlmProvider>()

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

export function normalizeLlmProvider(value: unknown): LlmProvider {
  return process.env.CONCILIUM_OPENROUTER_ONLY==='1'?'openrouter':value === 'openrouter' ? 'openrouter' : 'polza'
}

export function getActiveLlmProvider(): LlmProvider {
  return process.env.CONCILIUM_OPENROUTER_ONLY==='1'?'openrouter':providerStorage.getStore() || 'polza'
}

export function runWithLlmProvider<T>(provider: unknown, fn: () => Promise<T>): Promise<T> {
  return providerStorage.run(normalizeLlmProvider(provider), fn)
}

export function getLlmBaseUrl(): string {
  if (getActiveLlmProvider() === 'openrouter') {
    return normalizeBaseUrl(process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL)
  }
  return normalizeBaseUrl(
    process.env.POLZA_BASE_URL?.trim() ||
      process.env.LLM_BASE_URL?.trim() ||
      DEFAULT_POLZA_BASE_URL
  )
}

export function getLlmChatCompletionsUrl(): string {
  return `${getLlmBaseUrl()}/chat/completions`
}

export interface LlmEndpoint {
  provider: LlmProvider
  chatCompletionsUrl: string
  apiKey: string
}

export function getLlmEndpointChain(): LlmEndpoint[] {
  const chain: LlmEndpoint[] = []
  const add = (provider: LlmProvider, baseUrl: string | undefined, apiKey: string | undefined) => {
    const key = apiKey?.trim()
    const url = baseUrl?.trim()
    if (!key || !url) return
    const chatCompletionsUrl = `${normalizeBaseUrl(url)}/chat/completions`
    if (chain.some((item) => item.chatCompletionsUrl === chatCompletionsUrl && item.apiKey === key)) return
    chain.push({ provider, chatCompletionsUrl, apiKey: key })
  }

  if(process.env.CONCILIUM_OPENROUTER_ONLY!=='1')add(
    'polza',
    process.env.POLZA_BASE_URL || process.env.LLM_BASE_URL || DEFAULT_POLZA_BASE_URL,
    process.env.POLZA_API_KEY || process.env.LLM_API_KEY
  )
  add(
    'openrouter',
    process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL,
    process.env.OPENROUTER_API_KEY
  )
  const active=getActiveLlmProvider()
  return chain.sort((a,b)=>Number(a.provider!==active)-Number(b.provider!==active))
}

export async function fetchLlmChatCompletions(
  body: unknown,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {}
): Promise<Response> {
  const endpoints = getLlmEndpointChain()
  if (endpoints.length === 0) {
    throw new Error('Не настроены ключи Polza и OpenRouter')
  }

  const timeoutMs = options.timeoutMs ?? 45000
  let lastNetworkError: unknown = null

  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index]
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(endpoint.chatCompletionsUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${endpoint.apiKey}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const hasNext = index < endpoints.length - 1
      if (response.ok || !hasNext) {
        if (response.ok) {
          console.info(`[LLM] Ответ получен через ${endpoint.provider}`)
        }
        return response
      }
      const errorText = await response.text().catch(() => '')
      console.warn(`[LLM] ${endpoint.provider} ответил ${response.status}, пробуем следующий шлюз. ${errorText.slice(0, 180)}`)
    } catch (error) {
      lastNetworkError = error
      const hasNext = index < endpoints.length - 1
      console.warn(`[LLM] ${endpoint.provider} недоступен: ${error instanceof Error ? error.message : String(error)}`)
      if (!hasNext) throw error
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastNetworkError instanceof Error
    ? lastNetworkError
    : new Error('Polza и OpenRouter не ответили')
}

export function getLlmApiKey(): string {
  if (getActiveLlmProvider() === 'openrouter') {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim()
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY не настроен')
    }
    return apiKey
  }

  const apiKey = process.env.POLZA_API_KEY?.trim() || process.env.LLM_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('POLZA_API_KEY (или LLM_API_KEY) не настроен')
  }
  return apiKey
}
