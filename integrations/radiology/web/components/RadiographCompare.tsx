"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import { decodeDicomPreview } from "../lib/dicom-lite";
import PlainImageAnalysis, { type AnalysisView } from "./PlainImageAnalysis";
export type CompareItem = AnalysisView & {
    url?: string;
};
export default function RadiographCompare({ items }: {
    items: CompareItem[];
}) {
    const __ui = useUiTranslator();
    const key = items.map(item => item.id).join("\n");
    const previousIds = useRef("");
    const [left, setLeft] = useState(items[0]?.id ?? "");
    const [right, setRight] = useState(items[1]?.id ?? "");
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [error, setError] = useState("");
    useEffect(() => {
        const seen = new Set(previousIds.current.split("\n").filter(Boolean));
        previousIds.current = key;
        const added = items.filter(item => !seen.has(item.id));
        setLeft(current => items.some(item => item.id === current) ? current : (items[0]?.id ?? ""));
        if (added.length === 1 && items.length > 1) {
            setRight(added[0].id);
            return;
        }
        setRight(current => items.some(item => item.id === current) ? current : (items[1]?.id ?? items[0]?.id ?? ""));
    }, [key]);
    useEffect(() => {
        const owned: string[] = [];
        let stop = false;
        setError("");
        setUrls({});
        void (async () => {
            const next: Record<string, string> = {};
            for (const item of items) {
                if (stop)
                    break;
                if (item.url) {
                    next[item.id] = item.url;
                    continue;
                }
                try {
                    const preview = await decodeDicomPreview(item.file, { maxPixels: 4096 * 4096 });
                    owned.push(preview.url);
                    next[item.id] = preview.url;
                }
                catch {
                    if (!stop)
                        setError("Одну из проекций не удалось показать.");
                }
            }
            if (stop)
                owned.forEach(url => URL.revokeObjectURL(url));
            else
                setUrls({ ...next });
        })();
        return () => { stop = true; owned.forEach(url => URL.revokeObjectURL(url)); };
    }, [key]);
    const picked = [left, right].filter((id, index, list) => !!id && list.indexOf(id) === index);
    const chosen = picked.map(id => items.find(item => item.id === id)).filter((item): item is CompareItem => !!item);
    const leftItem = items.find(item => item.id === left);
    const rightItem = items.find(item => item.id === right);
    return <section className="cs-compare" aria-label={__ui("\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0446\u0438\u0439")}>
  <h3><LocalizedUi value={"\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0446\u0438\u0439"}/></h3>
  <p><LocalizedUi value={"\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0443\u044E \u0440\u0435\u043D\u0442\u0433\u0435\u043D\u043E\u0433\u0440\u0430\u043C\u043C\u0443 \u043C\u043E\u0436\u043D\u043E \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E: \u043E\u043D\u0430 \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u0441\u044F \u0441\u043F\u0440\u0430\u0432\u0430. \u0420\u0430\u0437\u0431\u043E\u0440 \u0443\u0445\u043E\u0434\u0438\u0442 \u0432 Gemini \u0438 Opus \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u043F\u0430\u0440\u0435."}/></p>
  <div className="cs-compare-controls">
   <label><LocalizedUi value={"\u0421\u043B\u0435\u0432\u0430"}/><select value={left} onChange={event => setLeft(event.target.value)}>
     <LocalizedUi value={items.map(item => <option key={item.id} value={item.id}><LocalizedUi value={item.label}/></option>)}/>
    </select>
   </label>
   <label><LocalizedUi value={"\u0421\u043F\u0440\u0430\u0432\u0430"}/><select value={right} onChange={event => setRight(event.target.value)}>
     <LocalizedUi value={items.map(item => <option key={item.id} value={item.id}><LocalizedUi value={item.label}/></option>)}/>
    </select>
   </label>
  </div>
  <LocalizedUi value={left === right && <p role="status"><LocalizedUi value={"\u0412\u044B\u0431\u0440\u0430\u043D\u0430 \u043E\u0434\u043D\u0430 \u043F\u0440\u043E\u0435\u043A\u0446\u0438\u044F."}/></p>}/>
  <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
  <div className="cs-compare-pair">
   <figure>
    <LocalizedUi value={leftItem && urls[leftItem.id] ? <img src={urls[leftItem.id]} alt={leftItem.label}/> : <p><LocalizedUi value={"\u0413\u043E\u0442\u043E\u0432\u0438\u043C \u043B\u0435\u0432\u0443\u044E \u043F\u0440\u043E\u0435\u043A\u0446\u0438\u044E\u2026"}/></p>}/>
    <figcaption><LocalizedUi value={leftItem?.label}/></figcaption>
   </figure>
   <figure>
    <LocalizedUi value={rightItem && urls[rightItem.id] ? <img src={urls[rightItem.id]} alt={rightItem.label}/> : <p><LocalizedUi value={"\u0413\u043E\u0442\u043E\u0432\u0438\u043C \u043F\u0440\u0430\u0432\u0443\u044E \u043F\u0440\u043E\u0435\u043A\u0446\u0438\u044E\u2026"}/></p>}/>
    <figcaption><LocalizedUi value={rightItem?.label}/></figcaption>
   </figure>
  </div>
  <PlainImageAnalysis key={chosen.map(item => item.id).join(",")} views={chosen}/>
 </section>;
}
