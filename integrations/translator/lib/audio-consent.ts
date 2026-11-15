import type { Locale } from './i18n/config'

export const audioConsent: Record<Locale, string> = {
  ru: 'Голосовой перевод — платный сеанс OpenAI. Разрешаю передавать исходную речь для перевода. Не произносите ФИО, адреса и номера документов.',
  en: 'Voice translation is a paid OpenAI session. I consent to sending the original speech for translation. Avoid names, addresses and document numbers.',
  es: 'La traducción de voz es una sesión de pago de OpenAI. Autorizo el envío del audio original. Evite nombres, direcciones y números de documentos.',
  fr: 'La traduction vocale utilise une session OpenAI payante. J’autorise l’envoi de la parole originale. Évitez les noms, adresses et numéros de documents.',
  ar: 'الترجمة الصوتية جلسة مدفوعة عبر OpenAI. أوافق على إرسال الكلام الأصلي للترجمة. تجنب ذكر الأسماء والعناوين وأرقام الوثائق.',
  hi: 'वॉइस अनुवाद एक सशुल्क OpenAI सत्र है। मैं अनुवाद के लिए मूल आवाज़ भेजने की अनुमति देता हूँ। नाम, पते और दस्तावेज़ संख्या न बोलें।',
  'pt-BR': 'A tradução por voz usa uma sessão paga da OpenAI. Autorizo o envio da fala original. Evite nomes, endereços e números de documentos.',
  id: 'Terjemahan suara memakai sesi OpenAI berbayar. Saya mengizinkan pengiriman ucapan asli untuk diterjemahkan. Hindari nama, alamat, dan nomor dokumen.',
  ms: 'Terjemahan suara menggunakan sesi OpenAI berbayar. Saya membenarkan pertuturan asal dihantar untuk terjemahan. Elakkan nama, alamat dan nombor dokumen.',
  tr: 'Sesli çeviri ücretli bir OpenAI oturumudur. Çeviri için özgün konuşmanın gönderilmesine izin veriyorum. Ad, adres ve belge numarası söylemeyin.',
  'zh-CN': '语音翻译使用付费的 OpenAI 会话。我同意发送原始语音进行翻译。请勿说出姓名、地址或证件号码。',
}
