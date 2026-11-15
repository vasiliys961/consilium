import{readFile}from'node:fs/promises';
import{join}from'node:path';
export const dynamic='force-dynamic';
export async function GET(){
 const html=await readFile(join(process.cwd(),'artifacts/gemini-vision-comparison-2026-11-12/report.html'),'utf8');
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'"}});
}
