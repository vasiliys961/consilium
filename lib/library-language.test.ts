import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceText,WORKSPACE_LANGUAGES} from './workspace-i18n.ts';
test('library search labels follow all ten interface languages',()=>{
 for(const language of WORKSPACE_LANGUAGES){for(const key of ['Личная библиотека','Врачебный вопрос','Предлагать книги и страницы по вопросу','Поиск по смыслу и словам','Открыть оригинал на странице','Проверяем книгу…','Обработка книги отменена.','Архив книги до 250 МБ включает оригинал и сохранённый текст для поиска. Создаётся на вашем устройстве. Иллюстрации можно проиндексировать после переноса.']){
 const value=workspaceText(language.code,key);assert.ok(value.length>0);if(language.code!=='ru')assert.notEqual(value,key,`${language.code}: ${key}`);
 }}
 assert.equal(workspaceText('en','Личная библиотека'),'Personal library');
});
