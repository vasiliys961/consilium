"""Offline ECGFounder inference on the frozen 20-record ECG benchmark."""
import json, time, hashlib, re, socket, sys, os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'artifacts/ecg-comparison-2026-11-14'
OUT=ROOT/'artifacts/ecg-founder-2026-11-14'
HOME=Path('/Users/maxmobiles.ru/Desktop/ECG-opus')
OUT.mkdir(exist_ok=True)
# No network, downloads, or paid services in this experiment.
def offline(*args,**kwargs): raise RuntimeError('Network disabled for local ECGFounder benchmark')
socket.socket.connect=offline
socket.create_connection=offline
sys.dont_write_bytecode=True
sys.path.insert(0,str(HOME))
import numpy as np
import torch
torch.set_num_threads(2)
from ecg_engine.ecgfounder import predict_signal
from ecg_engine.delineation import measure_tracing
GROUPS={
 'NORM':['NORMAL ECG'],
 'AFIB':['ATRIAL FIBRILLATION'],
 'CRBBB':['RIGHT BUNDLE BRANCH BLOCK','RBBB AND LEFT ANTERIOR FASCICULAR BLOCK','RBBB AND LEFT POSTERIOR FASCICULAR BLOCK'],
 'CLBBB':['LEFT BUNDLE BRANCH BLOCK'],
 '1AVB':['WITH 1ST DEGREE AV BLOCK'],
 'LVH':['LEFT VENTRICULAR HYPERTROPHY','VOLTAGE CRITERIA FOR LEFT VENTRICULAR HYPERTROPHY'],
 'MI':['SEPTAL INFARCT','ANTERIOR INFARCT','LATERAL INFARCT','ANTEROSEPTAL INFARCT','ANTEROLATERAL INFARCT','INFERIOR INFARCT','INFERIOR-POSTERIOR INFARCT','POSTERIOR INFARCT','ACUTE MI / STEMI','ACUTE MI'],
}
manifest=json.loads((BASE/'manifest.json').read_text())
protocol={'input':'Original PTB-XL 1.0.3 500 Hz 10 s 12-lead signal, same frozen 20 cases as image comparison','manifestSha256':hashlib.sha256((BASE/'manifest.json').read_bytes()).hexdigest(),'groups':GROUPS,'threshold':0.5,'appSelection':'top 8 labels then rounded to 2 decimals, >=0.5, at most 5 labels','sevenWayMetric':'Forced argmax of maximum label scores within seven predefined groups; diagnostic aid only, not production decision or equivalent to LLM primary label','network':'disabled','apiCostUsd':0,'trainingOverlap':'PTB-XL exposure in pretrained weights has not been established; fold 10 here does not guarantee holdout from ECGFounder training.'}
(OUT/'protocol.json').write_text(json.dumps(protocol,ensure_ascii=False,indent=2))
records=[]
for case in manifest['cases']:
    target=OUT/(case['id']+'.json')
    if target.exists():
        records.append(json.loads(target.read_text()));continue
    for item in case['files']:
        if hashlib.sha256((BASE/item['file']).read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Signal hash mismatch')
    lines=(BASE/'waveforms'/(case['id']+'.hea')).read_text().splitlines()
    header=lines[0].split(); count=int(header[1]); hz=float(header[2]); samples=int(header[3])
    assert count==12 and hz==500 and samples==5000
    signal=np.fromfile(BASE/'waveforms'/(case['id']+'.dat'),dtype='<i2').reshape(samples,count).T.astype(float)
    names=[]
    for index,line in enumerate(lines[1:13]):
        fields=line.split();assert fields[1]=='16'
        gain=re.fullmatch(r'([\d.]+)\((-?\d+)\)/mV',fields[2]);assert gain
        signal[index]=(signal[index]-float(gain[2]))/float(gain[1]);names.append(fields[-1])
    started=time.perf_counter()
    prediction=predict_signal(signal,names,hz,top=150)
    inference=time.perf_counter()-started
    measured=measure_tracing(signal,hz)
    scores={s['label']:s['score'] for s in prediction['scores']}
    group_scores={group:max(scores[label] for label in labels) for group,labels in GROUPS.items()}
    selected=[s for s in prediction['scores'][:8] if round(s['score']+1e-12,2)>=0.5][:5]
    app_target=any(s['label'] in GROUPS[case['referencePrimary']] for s in selected)
    row={'caseId':case['id'],'reference':case['referencePrimary'],'inferenceSeconds':inference,'groupScores':group_scores,'forcedSevenWay':max(group_scores,key=group_scores.get),'targetAboveThreshold':group_scores[case['referencePrimary']]>=0.5,'appTargetPresent':app_target,'appSelected':selected,'prediction':prediction,'measurements':measured}
    target.write_text(json.dumps(row,ensure_ascii=False,indent=2));records.append(row)
    print(json.dumps({k:row[k] for k in ['caseId','reference','inferenceSeconds','forcedSevenWay','appTargetPresent']},ensure_ascii=False),flush=True)
summary={'completed':len(records),'apiCostUsd':0,'targetAboveThreshold':sum(r['targetAboveThreshold'] for r in records),'appTargetPresent':sum(r['appTargetPresent'] for r in records),'forcedSevenWayMatches':sum(r['forcedSevenWay']==r['reference'] for r in records),'meanInferenceSeconds':sum(r['inferenceSeconds'] for r in records)/len(records),'groups':{g:{'total':sum(r['reference']==g for r in records),'appTargetPresent':sum(r['reference']==g and r['appTargetPresent'] for r in records),'forcedSevenWayMatches':sum(r['reference']==g and r['forcedSevenWay']==g for r in records)} for g in GROUPS}}
(OUT/'results.json').write_text(json.dumps({'protocol':protocol,'summary':summary,'records':records},ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
