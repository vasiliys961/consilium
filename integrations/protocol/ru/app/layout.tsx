import ConciliumPrivacy from '@/components/ConciliumPrivacy';
import type { Metadata, Viewport } from 'next'
import './globals.css'


export const metadata: Metadata = {
  title: 'Протокол осмотра',
  description: 'Отдельное приложение протокола осмотра на клинической логике русской версии Доктора Опуса',
  other: {
    google: 'notranslate',
    'content-language': 'ru',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body><ConciliumPrivacy russian={true}/>{children}</body>
    </html>
  )
}
