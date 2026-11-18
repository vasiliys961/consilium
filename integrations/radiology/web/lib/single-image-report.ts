import type {RadiologyReportLanguage} from './report-language.ts';
const COVERAGE:Record<RadiologyReportLanguage,string>={
 ru:'Оценено одно представленное изображение. Полное исследование не оценивалось.',
 en:'One supplied image was assessed. The complete study was not assessed.',
 es:'Se evaluó una imagen proporcionada. No se evaluó el estudio completo.',
 fr:'Une seule image fournie a été évaluée. L’examen complet n’a pas été évalué.',
 ar:'تم تقييم صورة واحدة مقدمة. لم يتم تقييم الفحص الكامل.',
 hi:'प्रदान की गई एक छवि का मूल्यांकन किया गया। संपूर्ण अध्ययन का मूल्यांकन नहीं किया गया।',
 'pt-BR':'Foi avaliada uma imagem fornecida. O exame completo não foi avaliado.',
 id:'Satu gambar yang diberikan telah dinilai. Keseluruhan pemeriksaan belum dinilai.',
 tr:'Sunulan tek bir görüntü değerlendirildi. İncelemenin tamamı değerlendirilmedi.',
 'zh-CN':'已评估所提供的一幅影像，未评估完整检查。',
};
export function singleImageReport(summary:string,language:RadiologyReportLanguage):string{
 if(!summary.trim())throw Error('empty_report');
 return COVERAGE[language]+'\n\n'+summary;
}
