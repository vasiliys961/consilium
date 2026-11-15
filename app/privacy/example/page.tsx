'use client';
import {useState} from 'react';
import {reviewBeforeSending} from '@/lib/privacy-client';
import styles from '@/app/components/privacy.module.css';
export default function PrivacyExample(){const [message,setMessage]=useState('');
 async function open(){setMessage('');const canvas=document.createElement('canvas');canvas.width=900;canvas.height=300;const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,900,300);context.fillStyle='#000';context.font='28px sans-serif';context.fillText('PATIENT NAME: JOHN SMITH',30,45);context.fillText('SYNTHETIC EXAMPLE / NOT A MEDICAL IMAGE',30,155);context.fillText('HR 72 bpm    Scale 10 mm',30,225);
  try{await reviewBeforeSending({text:'Синтетический пример. ФИО: Тестов Тест Тестович; DOB: 1980-01-01. Осмотр 2026-11-08, контроль 2026-11-15. Боли нет. Доза 50 мг. Остаточная фраза для ручного удаления: SAMPLE SECRET.',files:[{name:'John-Smith-example.txt',text:'Patient name: John Smith; MRN: ABC123456; email: synthetic@example.com. No pain. Dose 50 mg. SAMPLE SECRET.'},{name:'John-Smith-example.png',image:canvas.toDataURL('image/png')}],externalSearch:false});setMessage('Пример подтверждён. Внешние модели не вызывались; реальные случаи и хранилище не изменены.');}catch{setMessage('Отправка примера отменена. Внешние модели не вызывались.');}}
 return <main className={styles.vault}><a href="/workspace">← К случаям</a><h1>Проверка обезличивания · пример</h1><p>Здесь можно попробовать автоматическую очистку, ручное удаление текста и закрытие областей изображения. Используются только встроенные синтетические данные. Пароль хранилища не требуется, запросов к ИИ нет.</p><button onClick={()=>void open()}>Открыть пример проверки</button>{message&&<p role="status">{message}</p>}</main>;
}
