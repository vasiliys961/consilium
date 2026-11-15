import {cookies} from 'next/headers';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import ConciliumBridge from "../components/ConciliumBridge";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opus Radiology AI — КТ и МРТ",
  description: "Локальный исследовательский прототип рабочей станции медицинских изображений",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const saved=(await cookies()).get('concilium-ui-language')?.value;
  const language=saved&&/^(?:ru|en|es|fr|ar|hi|pt-BR|id|tr|zh-CN)$/.test(saved)?saved:'ru';
  let translations:Record<string,string>={};if(language!=='ru'){try{translations=JSON.parse(await readFile(join(process.cwd(),'public','concilium-locales',language+'.json'),'utf8'));}catch{}}
  return <html lang={language} dir={language==='ar'?'rtl':'ltr'}><body><ConciliumBridge initialLanguage={language} initialTranslations={translations}>{children}</ConciliumBridge></body></html>;
}
