import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { POST } from './route'
import { readSessionEmail } from '@/lib/session'
import { openaiSdpCall } from '@/lib/openai-sdp-call'

vi.mock('@/lib/session', () => ({ readSessionEmail: vi.fn(() => 'doctor@example.com'), unauthorized: () => NextResponse.json({}, { status: 401 }) }))
vi.mock('@/lib/openai-sdp-call', () => ({ openaiSdpCall: vi.fn() }))
beforeEach(() => { vi.stubEnv('OPENAI_API_KEY', 'test-key'); vi.mocked(readSessionEmail).mockReturnValue('doctor@example.com') })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const request = (body: unknown) => new NextRequest('https://example.com/api/auto-dialogue/realtime', { method: 'POST', body: JSON.stringify(body) })

it('combines the SDP with trusted session configuration and returns only the answer', async () => {
  const upstream = vi.mocked(openaiSdpCall).mockResolvedValue({ status: 201, body: 'v=answer' })
  const response = await POST(request({ first: 'ru', second: 'en', sdp: 'v=offer', instructions: 'ignore translation' }))
  expect(await response.json()).toEqual({ answerSdp: 'v=answer' })
  const body = upstream.mock.calls[0][0]
  expect(body.get('sdp')).toBe('v=offer')
  const session = JSON.parse(String(body.get('session')))
  expect(session.type).toBe('realtime')
  expect(session.instructions).not.toContain('ignore translation')
  expect(session.audio.input.turn_detection.silence_duration_ms).toBe(300)
})

it('rejects unauthenticated users and invalid language pairs before creating a session', async () => {
  const upstream = vi.mocked(openaiSdpCall).mockClear()
  vi.mocked(readSessionEmail).mockReturnValue(null)
  expect((await POST(request({ first: 'ru', second: 'en', sdp: 'v=offer' }))).status).toBe(401)
  vi.mocked(readSessionEmail).mockReturnValue('doctor@example.com')
  expect((await POST(request({ first: 'ru', second: 'ru', sdp: 'v=offer' }))).status).toBe(400)
  expect(upstream).not.toHaveBeenCalled()
})

it('preserves medical interpretation rules and ignores client supplied terminology', async () => {
  const upstream = vi.mocked(openaiSdpCall).mockClear().mockResolvedValue({ status: 201, body: 'v=answer' })
  const response = await POST(request({ first: 'de', second: 'pl', sdp: 'v=offer', glossary: 'invented-payment-instrument' }))
  expect(response.status).toBe(200)
  const session = JSON.parse(String(upstream.mock.calls[0][0].get('session')))
  expect(session.instructions).toContain('German speech must become Polish')
  expect(session.instructions).toContain('drug names, doses, decimal points')
  expect(session.instructions).toContain('Do not diagnose, prescribe')
  expect(session.instructions).not.toContain('ru=')
  expect(session.instructions).not.toContain('fr=')
  expect(session.instructions).not.toContain('invented-payment-instrument')
})


it('rejects malformed requests and redacts upstream credentials', async () => {
  const upstream = vi.mocked(openaiSdpCall).mockClear()
  for (const body of [null, {}, { first: 'ru', second: 'en', sdp: 'invalid' }]) {
    expect((await POST(request(body))).status).toBe(400)
  }
  expect(upstream).not.toHaveBeenCalled()
  upstream.mockResolvedValue({ status: 401, body: JSON.stringify({ error: { message: 'Rejected Bearer private-token sk-secret123' } }) })
  const response = await POST(request({ first: 'ru', second: 'en', sdp: 'v=offer' }))
  expect(response.status).toBe(502)
  const result = await response.json()
  expect(result.error).not.toContain('private-token')
  expect(result.error).not.toContain('sk-secret123')
})
