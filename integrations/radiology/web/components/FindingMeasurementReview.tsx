"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from 'react';
import type { SeriesMember } from '../lib/dicom-series';
import type { DicomCaliperMeasurement, CtRoiMeasurement } from '../lib/dicom-lite';
import DicomCaliperPanel from './DicomCaliperPanel';
import CtHuRoiPanel from './CtHuRoiPanel';
export type AcceptedFindingMeasurement = {
    findingKey: string;
    sliceNumber: number;
    lengthMm: number;
    meanHu: number | null;
    sourceId: string;
};
export default function FindingMeasurementReview({ member, file, sliceNumber, findingKey, onAccept }: {
    member: SeriesMember;
    file: File | null;
    sliceNumber: number;
    findingKey: string;
    onAccept: (measurement: AcceptedFindingMeasurement) => void;
}) {
    const __ui = useUiTranslator();
    const [length, setLength] = useState<DicomCaliperMeasurement | null>(null), [roi, setRoi] = useState<CtRoiMeasurement | null>(null);
    const ct = member.metadata.modality === 'CT';
    return <section aria-label={__ui("\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0438 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u0435 \u043D\u0430\u0445\u043E\u0434\u043A\u0438 \u0432\u0440\u0430\u0447\u043E\u043C")}>
  <h3><LocalizedUi value={"\u0418\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u0435 \u043D\u0430\u0445\u043E\u0434\u043A\u0438 \u00B7 \u0441\u0440\u0435\u0437"}/><LocalizedUi value={sliceNumber}/></h3>
  <p><LocalizedUi value={"\u0418\u0437\u043C\u0435\u0440\u044C\u0442\u0435 \u043E\u0447\u0430\u0433 \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0438 \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u0435. \u0420\u0430\u0437\u043C\u0435\u0440 \u0431\u0435\u0440\u0451\u0442\u0441\u044F \u0438\u0437 \u0434\u0432\u0443\u0445 \u0442\u043E\u0447\u0435\u043A \u0438 PixelSpacing, \u043F\u043B\u043E\u0442\u043D\u043E\u0441\u0442\u044C \u041A\u0422 \u2014 \u0438\u0437 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439. \u0414\u043B\u0438\u043D\u0430 \u043D\u0430 \u043E\u0434\u043D\u043E\u043C \u0441\u0440\u0435\u0437\u0435 \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043E\u0431\u044A\u0451\u043C\u043E\u043C \u043E\u0447\u0430\u0433\u0430."}/></p>
  <DicomCaliperPanel file={file} metadata={member.metadata} seriesKey={member.id} onSave={setLength}/>
  <LocalizedUi value={ct && <CtHuRoiPanel file={file} metadata={member.metadata} seriesKey={member.id} onSave={setRoi}/>}/>
  <p><LocalizedUi value={"\u0420\u0430\u0437\u043C\u0435\u0440:"}/><LocalizedUi value={length ? length.lengthMm.toFixed(2) + ' мм' : 'не измерен'}/>. <LocalizedUi value={ct && 'Средняя плотность: ' + (roi ? roi.meanHu.toFixed(2) + ' HU' : 'не измерена') + '.'}/></p>
  <button type="button" disabled={!length || ct && !roi} onClick={() => {
            if (!length || ct && !roi)
                return;
            onAccept({ findingKey, sliceNumber, lengthMm: length.lengthMm, meanHu: ct ? roi!.meanHu : null, sourceId: member.id });
        }}><LocalizedUi value={"\u041F\u0440\u0438\u043D\u044F\u0442\u044C \u043D\u0430\u0445\u043E\u0434\u043A\u0443 \u0441 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F\u043C\u0438 \u0432\u0440\u0430\u0447\u0430"}/></button>
 </section>;
}
