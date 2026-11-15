import {LocalVault} from './components/local-vault';
import {PrivacyReview} from './components/privacy-review';
import{GeminiModelChoice}from'./components/gemini-model-choice';
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Doctor Opus",
  description: "Concilium — рабочее пространство врача для ведения клинических случаев.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body><LocalVault><PrivacyReview/><GeminiModelChoice/>{children}</LocalVault></body>
    </html>
  );
}
