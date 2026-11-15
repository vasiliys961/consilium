"""Offline report: local signal model vs existing image-reader outputs."""
import json, html, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'artifacts/ecg-founder-2026-11-14'
r=json.loads((OUT/'results.json').read_text()); old=json.loads((ROOT/'artifacts/ecg-direct-opus-2026-11-14/results.json').read_text()); manifest=json.loads((ROOT/'artifacts/ecg-comparison-2026-11-14/manifest.json').read_text())
assert r['summary']['completed']==20 and len(r['records'])==20
assert all(len(x['prediction']['scores'])==150 for x in r['records'])
assert all(x['measurements']['available'] for x in r['records'])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
home=Path('/Users/maxmobiles.ru/Desktop/ECG-opus')
provenance={str(p.relative_to(home)):sha(p) for p in [home/'models/ecgfounder/12_lead_ECGFounder.pth',home/'ecg_engine/ecgfounder.py',home/'ecg_engine/ecgfounder_tasks.txt',home/'ecg_engine/delineation.py']}
(OUT/'provenance.json').write_text(json.dumps(provenance,indent=2))
names={'NORM':'Норма','AFIB':'ФП','CRBBB':'Полная БПНПГ','CLBBB':'Полная БЛНПГ','1AVB':'АВ-блокада I степени','LVH':'ГЛЖ','MI':'Инфарктный паттерн'}
caveat='ECGFounder выдаёт несколько независимых меток, а модели изображений выбирали один главный код: эти показатели не равнозначны. Наличие целевого признака не означает правильность всего заключения и не штрафует лишние метки. Сигмоидные оценки не являются калиброванными вероятностями диагноза. Выборка мала и целевая; возможное знакомство ECGFounder и LLM с PTB-XL не исключено. Разметка интервалов выполнена отдельным алгоритмом NeuroKit2, не самой нейросетью ECGFounder; ручного подтверждения измерений не проводилось. Это локальный запуск установленного движка на исходных сигналах; полный маршрут загрузки файла и формирования ответа приложения здесь не тестировался.'
rows=[]; details=[]
e=lambda x:html.escape(str(x))
for a in r['records']:
 c=next(x for x in manifest['cases'] if x['id']==a['caseId']); b=next(x for x in old['records'] if x['caseId']==a['caseId']); m=a['measurements']
 rows.append(f"| {a['caseId']} | {a['reference']} | {'да' if a['appTargetPresent'] else 'нет'} | {a['groupScores'][a['reference']]:.4f} | {m.get('pq_ms')} | {b['argon']['parsed']['primary_pattern']} | {b['direct']['parsed']['primary_pattern']} |")
 scores=''.join(f'<tr><td>{e(s["label"])}</td><td>{s["score"]:.4f}</td></tr>' for s in a['prediction']['scores'][:12])
 answers=''.join(f'<article><h3>{title}</h3><b>{e(b[key]["parsed"]["primary_pattern"])}</b><p>{e(b[key]["parsed"]["conclusion_ru"])}</p></article>' for key,title in [('argon','Argon по изображению'),('direct','Opus по изображению'),('chain','Argon → Opus по тексту')])
 details.append(f'<details><summary>{e(a["caseId"])} · эталон {e(names[a["reference"]])} · целевая метка {"выделена" if a["appTargetPresent"] else "не выделена"}</summary><img src="../ecg-comparison-2026-11-14/{e(c["image"])}" alt="{e(a["caseId"])}"><p>Исходная разметка: {e(c["scpCodes"])}</p><p>{e(c["referenceReport"])}</p><div class="cols"><article><h3>ECGFounder: первые 12 из 150 меток</h3><table>{scores}</table><h4>Метки, передаваемые приложением</h4><pre>{e(json.dumps(a["appSelected"],ensure_ascii=False,indent=2))}</pre><h4>Отдельный расчёт интервалов</h4><p>{e(m.get("description"))}</p><p>{e(m.get("note"))}</p></article>{answers}</div></details>')
groups='\n'.join(f'| {names[g]} | {v["appTargetPresent"]}/{v["total"]} |' for g,v in r['summary']['groups'].items())
avb=[a for a in r['records'] if a['reference']=='1AVB']
pq=', '.join(f'{a["caseId"]}: {a["measurements"].get("pq_ms")} мс' for a in avb)
md=f'''# ECGFounder: те же 20 цифровых ЭКГ

Все 20 записей обработаны. API не вызывались, списание $0. Исходные файлы проверены по SHA-256 из замороженного манифеста. Установленные исходники, веса и приложение не менялись.

| Эталонный признак | Целевая метка среди выходов приложения (порог 0,5, максимум 5) |
|---|---:|
{groups}

Всего целевая метка выделена в 15/20 случаях. Норма проверялась строго по NORMAL ECG, без расширения на otherwise normal ecg после получения результатов. В ecg-08 присутствует otherwise normal ecg (0,843); это отдельно объясняет один из пяти несовпавших случаев.

Классификатор не выделил АВ-блокаду I степени в 3/3 случаях, однако отдельный расчёт PQ дал {pq}. Это важное расхождение между измерением и выходом классификатора; результаты измерений требуют проверки врачом. Не следует удалять их из заключения только из-за отсутствия нейросетевой метки.

Прямые модели изображений на этой выборке: Argon 15/20 главных кодов, Opus 14/20, Argon→текстовый Opus 14/20. Принудительный максимум ECGFounder среди семи групп тоже совпал в 15/20, но эта вспомогательная метрика не соответствует штатному многометочному выводу.

{caveat}

Практический вывод: сохранять цифровой анализ и отдельные измерения; модель для формулирования заключения должна получать их вместе с изображением и явно показывать расхождения. Польза такого объединённого промпта ещё не проверялась. Дополнительные платные вызовы не выполнялись.

| Запись | Эталон | Целевая метка ECGFounder в выходе приложения | Оценка целевой группы | PQ, мс (алгоритм) | Главный код Argon | Главный код Opus |
|---|---|---|---:|---:|---|---|
{chr(10).join(rows)}

Полный просмотр: report.html. Сырые выходы 150 классов и измерения: ecg-01.json … ecg-20.json; SHA-256 весов и исходников: provenance.json.
'''
(OUT/'REPORT.md').write_text(md)
table='<table><tr><th>Эталонный признак</th><th>Целевая метка выделена</th></tr>'+''.join(f'<tr><td>{e(names[g])}</td><td>{v["appTargetPresent"]}/{v["total"]}</td></tr>' for g,v in r['summary']['groups'].items())+'</table>'
(OUT/'report.html').write_text(f'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ECGFounder · 20 ЭКГ</title><style>body{{font:17px/1.6 system-ui;max-width:1500px;margin:auto;padding:24px;background:#f4f7f5;color:#183c30}}table{{border-collapse:collapse;background:white}}td,th{{padding:10px;border-bottom:1px solid #ccd7cf;text-align:left}}details{{background:white;margin:18px 0;padding:18px;border-radius:12px}}summary{{cursor:pointer;font-weight:bold}}img{{width:100%}}.cols{{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}}article{{background:#f4f7f5;padding:14px}}pre{{white-space:pre-wrap;font-size:13px}}@media(max-width:900px){{.cols{{grid-template-columns:1fr}}}}</style><h1>ECGFounder · те же 20 цифровых ЭКГ</h1><p>20/20 обработаны локально. API: $0. Целевая метка выделена в 15/20 случаях.</p>{table}<p><b>Измерение и классификация расходятся:</b> метка АВ-блокады I степени не прошла порог во всех трёх примерах, но отдельный алгоритм рассчитал PQ: {e(pq)}. Эти измерения требуют ручной проверки.</p><p>{e(caveat)}</p><p>Текущая штатная выборка меток: первые 8, округление до сотых, порог 0,5, максимум 5. Сравнение LLM использует уже оплаченные ответы; новых вызовов нет.</p>{"".join(details)}</html>')
print(json.dumps({'completed':20,'report':str(OUT/'report.html'),'pq':pq,'apiCostUsd':0},ensure_ascii=False))
