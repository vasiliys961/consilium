"use client";
import { LocalizedUi, useUiTranslator } from './ConciliumBridge';
type Section = "viewer" | "technical" | "guide";
const pages = [
    { key: "viewer", href: "/viewer", label: "Исследование" },
    { key: "technical", href: "/technical", label: "Техническая панель" },
    { key: "guide", href: "/guide", label: "Руководство" },
] as const;
export default function WorkspaceNavigation({ active }: {
    active: Section;
}) {
    const __ui = useUiTranslator();
    return <nav className="workspace-nav" aria-label={__ui("Разделы Opus Radiology AI")}>
    {pages.map(page => <a key={page.key} href={page.href} aria-current={active === page.key ? "page" : undefined}><LocalizedUi value={page.label}/></a>)}
  </nav>;
}
