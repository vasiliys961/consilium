import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('original protocol applications keep native clinical generation, medication checker, prescriptions and DOCX but default to formatted Markdown view',()=>{
 const ru=readFileSync('integrations/protocol/ru/app/protocol/page.tsx','utf8');
 assert.match(ru,/onClick=\{openPrescriptionLayout\}/);
 assert.match(ru,/onClick=\{handleAnalyzeInteractions\}/);
 assert.match(ru,/onClick=\{handleExportToDocx\}/);
 assert.match(ru,/editingProtocol \? \(/);
 assert.match(ru,/ReactMarkdown remarkPlugins=\{\[remarkGfm\]\}/);
 assert.match(ru,/Редактировать текст/);
 const en=readFileSync('integrations/protocol/en/app/protocol/page.tsx','utf8');
 assert.match(en,/handleGenerateFinalNote/);
 assert.match(en,/handleExportToDocx/);
 assert.match(en,/editingDraft \? \(/);
 assert.match(en,/editingFinal \?/);
 assert.match(en,/ReactMarkdown remarkPlugins=\{\[remarkGfm\]\}/);
 assert.match(en,/Edit SOAP note/);
});
