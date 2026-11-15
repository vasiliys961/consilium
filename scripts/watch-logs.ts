// Run in any terminal, including Cursor, without restarting the application.
import {closeSync,existsSync,mkdirSync,openSync,readSync,statSync} from 'node:fs';
import {dirname} from 'node:path';
import {formatTerminalEvent,terminalLogPath,type RunEvent} from '../lib/telemetry.ts';
const path=terminalLogPath();mkdirSync(dirname(path),{recursive:true,mode:0o700});
const history=process.argv.includes('--history')||process.argv.includes('--once');
console.log(`Concilium · журнал разработки\n${path}\nЭто просмотр событий: вводить команды здесь не нужно.\nОткройте приложение и нажмите «Разобрать случай» — здесь появятся этапы, модели, время и расчётная стоимость.\nCtrl+C останавливает только просмотр.\n`);
if(history)console.log('СОХРАНЁННЫЕ СОБЫТИЯ · записи ниже могли произойти до запуска просмотра.\n');
else console.log('Ожидаю новые события. Прошлые записи не показываются; для истории: npm run logs -- --history\n');
let offset=history?0:(existsSync(path)?statSync(path).size:0),partial='',initial=history;
function poll(){
 try{
  if(!existsSync(path))return;
  const size=statSync(path).size;
  if(size<offset){offset=0;partial='';}
  if(size===offset)return;
  // Bound the initial read; a single JSON event is always much smaller than 256 KiB.
  if(size-offset>256*1024){offset=size-256*1024;partial='';}
  const buffer=Buffer.alloc(size-offset);const fd=openSync(path,'r');
  try{const count=readSync(fd,buffer,0,buffer.length,offset);offset+=count;partial+=buffer.subarray(0,count).toString('utf8');}finally{closeSync(fd);}
  const lines=partial.split('\n');partial=lines.pop()??'';
  for(const line of (initial?lines.slice(-40):lines)){try{const event=JSON.parse(line) as RunEvent;if(typeof event.runId==='string'&&typeof event.event==='string'&&typeof event.at==='string')console.log(process.argv.includes('--json')?line:formatTerminalEvent(event));}catch{/* Skip a partial first line after rotation. */}}
  initial=false;
 }catch{console.error('Журнал временно недоступен; повторяю чтение.');}
}
poll();
if(!process.argv.includes('--once')){const timer=setInterval(poll,500);process.on('SIGINT',()=>{clearInterval(timer);process.exit(0);});process.on('SIGTERM',()=>{clearInterval(timer);process.exit(0);});}
