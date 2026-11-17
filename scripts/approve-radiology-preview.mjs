#!/usr/bin/env node
/**
 * One-time, explicit administrator opt-in for reviewed Radiology PNGs in the
 * isolated ChatGPT Preview. Never copies provider keys or enables automatic
 * public volume uploads. Never touches Codex/main or standalone Radiology.
 */
import {assertPreviewReady} from './preview-preflight.mjs';
import {existsSync, lstatSync, readFileSync, realpathSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';

const FLAGS = [
  'RADIOLOGY_ENABLE_DEIDENTIFIED_OPENROUTER_PILOT',
  'RADIOLOGY_OPENROUTER_HEALTH_DATA_APPROVED',
  'RADIOLOGY_LOCAL_REVIEWED_FRAME_SESSION',
];

/** Only replace these three permissions; preserve all other settings and keys. */
export function approvedRadiologyPreviewEnv(source = '') {
  const names = FLAGS.join('|');
  const permissionLine = new RegExp('^\\s*(?:export\\s+)?(?:' + names + ')\\s*=');
  const kept = source.split(/\r?\n/).filter(line => !permissionLine.test(line));
  const base = kept.join('\n').replace(/\n*$/, '');
  return (base ? base + '\n' : '') + FLAGS.map(name => name + '=1').join('\n') + '\n';
}

export async function main() {
  const root = process.cwd();
  const check = await assertPreviewReady(root, 'update');
  if (check.branch !== 'chatgpt-dev') throw Error('Разрешение можно оформить только в отдельной chatgpt-dev Preview.');
  const directory = resolve(root, 'integrations/radiology/web');
  if (realpathSync(directory) !== directory || !existsSync(join(directory, 'package.json')))
    throw Error('Не найдена отдельная Radiology Preview. Исходные установки не затронуты.');
  const target = join(directory, '.env.local');
  if (existsSync(target) || safeLstat(target)) {
    const stat = safeLstat(target);
    if (!stat?.isFile() || stat.isSymbolicLink())
      throw Error('Локальный файл настроек Radiology нельзя безопасно изменить.');
  }
  if (!process.stdin.isTTY) throw Error('Нужно явное подтверждение администратора в обычном терминале.');

  console.log('Разрешение относится только к локальному Preview Radiology (3210).');
  console.log('Будет использован уже настроенный серверный ключ OpenRouter; ключ не выводится и не меняется.');
  console.log('Условия: передавать только разрешённые обезличенные изображения, вручную проверенные врачом.');
  console.log('Убедитесь, что условия обработки медицинских данных OpenRouter и выбранных моделей допускают такую передачу.');
  console.log('Автоматическая отправка DICOM/серии и платные вызовы НЕ включаются этой командой.');
  const rl = createInterface({input:process.stdin, output:process.stdout});
  let answer;
  try { answer = (await rl.question('Если вы подтверждаете условия, введите РАЗРЕШАЮ: ')).trim(); }
  finally { rl.close(); }
  if (answer !== 'РАЗРЕШАЮ') throw Error('Разрешение не выдано; ничего не изменено.');

  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const temp = target + '.pending-' + process.pid;
  let fd;
  try {
    fd = openSync(temp, 'wx', 0o600);
    writeFileSync(fd, approvedRadiologyPreviewEnv(current), 'utf8');
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    renameSync(temp, target);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temp); } catch {}
    throw error;
  }
  console.log('Разовое разрешение сохранено в изолированной Radiology Preview.');
  console.log('Перезапустите только Preview (3207/3210). Исходные снимки и ключи не менялись.');
}
function safeLstat(path) { try { return lstatSync(path); } catch { return null; } }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('[Radiology Preview] ' + (error instanceof Error ? error.message : 'Подтверждение отменено.'));
    process.exitCode = 1;
  });
}
