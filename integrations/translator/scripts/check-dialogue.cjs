// Live smoke test using synthetic phrases only. Run: node --env-file=.env.local scripts/check-dialogue.cjs
const fs = require('node:fs')
const ts = require('typescript')
const { execFileSync } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const audioMode = process.argv.includes('--audio')
const audioDirectory = audioMode ? fs.mkdtempSync(path.join(os.tmpdir(), 'medical-dialogue-')) : null
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const { dialogueRealtimeSession } = require('../lib/dialogue-realtime-session.ts')
const WebSocket = require('next/dist/compiled/ws')
const session = dialogueRealtimeSession('ru', 'en')
session.audio.input.turn_detection = null
const phrases = ['Здравствуйте, здравствуйте.', 'Алло, привет.', 'Сегодня хорошая погода.', 'What time is the meeting?', 'Большое спасибо за помощь.']
const socket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(session.model)}`, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } })
let index = 0
let audioBytes = 0
const timer = setTimeout(() => { console.error('timeout'); socket.terminate(); process.exitCode = 1 }, 60000)
const send = value => socket.send(JSON.stringify(value))
const next = () => {
  if (index === phrases.length) { clearTimeout(timer); socket.close(); return }
  if (audioMode) {
    const file = path.join(audioDirectory, `${index}.wav`)
    execFileSync('say', ['-v', index === 3 ? 'Samantha' : 'Milena', '-o', file, '--file-format=WAVE', '--data-format=LEI16@24000', phrases[index]])
    const wave = fs.readFileSync(file)
    let offset = 12
    while (offset + 8 <= wave.length && wave.toString('ascii', offset, offset + 4) !== 'data') offset += 8 + wave.readUInt32LE(offset + 4) + (wave.readUInt32LE(offset + 4) % 2)
    if (offset + 8 > wave.length) throw new Error('Missing WAV data')
    const pcm = wave.subarray(offset + 8, offset + 8 + wave.readUInt32LE(offset + 4))
    for (let start = 0; start < pcm.length; start += 24000) send({ type: 'input_audio_buffer.append', audio: pcm.subarray(start, start + 24000).toString('base64') })
    send({ type: 'input_audio_buffer.commit' })
    return
  }
  const id = `smoke_${index}`
  send({ type: 'conversation.item.create', item: { id, type: 'message', role: 'user', content: [{ type: 'input_text', text: phrases[index] }] } })
}
socket.on('open', () => send({ type: 'session.update', session }))
socket.on('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1 })
socket.on('message', data => {
  const event = JSON.parse(String(data))
  if (event.type === 'session.updated') next()
  if ((event.type === 'conversation.item.done' && event.item?.role === 'user' && !audioMode) || (audioMode && event.type === 'input_audio_buffer.committed')) send({ type: 'response.create' })
  if (event.type === 'response.output_audio.delta') audioBytes += Buffer.from(event.delta, 'base64').length
  if (event.type === 'response.output_audio_transcript.done') console.log(JSON.stringify({ input: phrases[index], translation: event.transcript }))
  if (event.type === 'response.done') {
    if (event.response.status !== 'completed') { console.error(JSON.stringify(event.response.status_details)); process.exitCode = 1; clearTimeout(timer); socket.close(); return }
    console.log(JSON.stringify({ audioBytes }))
    if (audioBytes === 0) process.exitCode = 1
    audioBytes = 0
    index++; next()
  }
  if (event.type === 'error') { console.error(JSON.stringify(event.error)); clearTimeout(timer); socket.close(); process.exitCode = 1 }
})
