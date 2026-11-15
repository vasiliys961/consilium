import ConciliumPrivacy from '@/components/ConciliumPrivacy';
import type { Metadata, Viewport } from 'next'
import './globals.css'


export const metadata: Metadata = {
  title: 'Doctor Opus Global · Clinical Notes',
  description: 'Independent multilingual diagnostic draft and SOAP workflow from Doctor Opus Global',
  other: {
    google: 'notranslate',
    'content-language': 'en',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><ConciliumPrivacy russian={false}/>{children}</body>
    </html>
  )
}
