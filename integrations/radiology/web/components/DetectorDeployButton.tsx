"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useState } from "react";
import { BASIC_CATALOG, FULL_CATALOG, NOT_DEPLOYED } from "../lib/detector-deploy-plan";
type Item = {
    id: string;
    title: string;
    size: string;
    requirement: string;
    willInstall: boolean;
};
type Scope = {
    eligible: boolean;
    items: Item[];
};
type ServiceLine = {
    id: string;
    started: boolean;
    reason?: string;
};
type DeployState = {
    message: string;
    notDeployed: string;
    minimum: {
        ramGib: number;
        freeDiskGib: number;
    };
    basic: Scope;
    full: Scope;
    services?: ServiceLine[];
};
const SERVICE_NAME: Record<string, string> = {
    chest_xray_six: "Рентген грудной клетки",
    chest_nodes: "Узлы средостения",
    lung_nodules: "Узлы лёгких",
    brain_hemorrhage: "Кровоизлияние",
    chest_effusion: "Выпот",
    abdomen_ct: "Живот",
    brain_wmh: "Белое вещество",
    chest_pe: "ТЭЛА",
    lung_tumor_cln: "Опухоль лёгкого",
};
export default function DetectorDeployButton() {
    const __ui = useUiTranslator();
    const [state, setState] = useState<DeployState | null>(null);
    const [busy, setBusy] = useState<"basic" | "full" | null>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        const ctl = new AbortController();
        fetch("/api/detector-deploy", { cache: "no-store", signal: ctl.signal })
            .then(async (r) => r.ok ? r.json() : Promise.reject())
            .then(setState).catch(() => {
            if (!ctl.signal.aborted)
                setError("Проверка сервера не ответила.");
        });
        return () => ctl.abort();
    }, []);
    async function deploy(scope: "basic" | "full") {
        setBusy(scope);
        setError("");
        try {
            const response = await fetch("/api/detector-deploy", {
                method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scope }),
            });
            const data = await response.json();
            setState(data);
            if (!response.ok)
                setError(data.message ?? "Закачка не начата.");
        }
        catch {
            setError("Сервер не завершил закачку.");
        }
        finally {
            setBusy(null);
        }
    }
    function list(fallback: readonly {
        id: string;
        title: string;
        size: string;
        requirement: string;
    }[], live?: Item[]) {
        const rows = live ?? fallback.map(item => ({ ...item, willInstall: null as boolean | null }));
        return <ul><LocalizedUi value={rows.map(item => <li key={item.id}>
      <strong><LocalizedUi value={item.title}/>.</strong> <LocalizedUi value={item.size}/>. <LocalizedUi value={item.requirement}/>.
      <LocalizedUi value={item.willInstall === true ? " Скачается." : item.willInstall === false ? " На этом компьютере не скачается." : ""}/>
    </li>)}/></ul>;
    }
    return <section aria-label={__ui("\u0420\u0430\u0437\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u044B")}>
    <h3><LocalizedUi value={"\u0420\u0430\u0437\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u044B"}/></h3>
    <p><LocalizedUi value={"\u041F\u043E\u0441\u043B\u0435 \u0441\u0432\u0435\u0440\u043A\u0438 \u0432\u0435\u0441\u043E\u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0441\u0430\u043C\u043E \u0441\u0442\u0430\u0432\u0438\u0442 \u043D\u0443\u0436\u043D\u044B\u0435 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u044B Python \u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442 \u0441\u043B\u0443\u0436\u0431\u044B. \u041C\u0438\u043D\u0438\u043C\u0443\u043C: Linux,"}/><LocalizedUi value={state?.minimum.ramGib ?? 16}/><LocalizedUi value={"\u0413\u0411 \u043F\u0430\u043C\u044F\u0442\u0438,"}/><LocalizedUi value={state?.minimum.freeDiskGib ?? 30}/><LocalizedUi value={"\u0413\u0411 \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u043E."}/></p>
    <LocalizedUi value={state && <p role="status"><LocalizedUi value={state.message}/></p>}/>
    <LocalizedUi value={state?.services?.length ? <ul><LocalizedUi value={state.services.map(item => <li key={item.id}>
      <LocalizedUi value={SERVICE_NAME[item.id] ?? item.id}/>: <LocalizedUi value={item.started ? "служба отвечает." : "служба не запустилась."}/> <LocalizedUi value={item.reason ?? ""}/>
    </li>)}/></ul> : null}/>
    <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
    <div className="deploy-block">
      <h3><LocalizedUi value={"\u041F\u0435\u0440\u0432\u0430\u044F \u043A\u043D\u043E\u043F\u043A\u0430"}/></h3>
      <LocalizedUi value={list(BASIC_CATALOG, state?.basic.items)}/>
      <button type="button" disabled={!state?.basic.eligible || busy !== null} onClick={() => void deploy("basic")}>
        <LocalizedUi value={busy === "basic" ? "Скачиваем и ставим программу…" : "Развернуть рентген грудной клетки"}/>
      </button>
    </div>
    <div className="deploy-block">
      <h3><LocalizedUi value={"\u0412\u0442\u043E\u0440\u0430\u044F \u043A\u043D\u043E\u043F\u043A\u0430"}/></h3>
      <LocalizedUi value={list(FULL_CATALOG, state?.full.items)}/>
      <p><LocalizedUi value={NOT_DEPLOYED}/></p>
      <button type="button" disabled={!state?.full.eligible || busy !== null} onClick={() => void deploy("full")}>
        <LocalizedUi value={busy === "full" ? "Скачиваем веса и ставим программы…" : "Развернуть все возможные"}/>
      </button>
    </div>
  </section>;
}
