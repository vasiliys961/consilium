import type {WorkspaceLanguage} from './workspace-i18n.ts';
/** Lightweight native UI text for the independent clinical-guideline module.
 * Index order matches the visible language switcher: RU EN ES FR AR HI PT ID TR ZH.
 */
const ORDER:WorkspaceLanguage[]=['ru','en','es','fr','ar','hi','pt-BR','id','tr','zh-CN'];
const STRINGS={
 back:['Клинические случаи','Clinical cases','Casos clínicos','Dossiers cliniques','الحالات السريرية','नैदानिक मामले','Casos clínicos','Kasus klinis','Klinik vakalar','临床病例'],
 title:['Клинические рекомендации','Clinical guidelines','Guías clínicas','Recommandations cliniques','الإرشادات السريرية','नैदानिक दिशानिर्देश','Diretrizes clínicas','Pedoman klinis','Klinik kılavuzlar','临床指南'],
 intro:['Самостоятельный поиск: стандартный обзор, подробный клинический разбор или актуальные рекомендации в сети.','Independent search: standard, in-depth, or online clinical guidance.','Búsqueda independiente: guía estándar, detallada o actualizada.','Recherche autonome : recommandations standard, détaillées ou en ligne.','بحث مستقل: إرشادات قياسية أو مفصلة أو حديثة.','स्वतंत्र खोज: मानक, विस्तृत या अद्यतन दिशानिर्देश।','Busca independente: diretrizes padrão, detalhadas ou atuais.','Pencarian mandiri: panduan standar, terperinci, atau terkini.','Bağımsız arama: standart, ayrıntılı veya güncel rehberler.','独立检索：标准、详细或最新临床指南。'],
 specialty:['Специальность (необязательно)','Specialty (optional)','Especialidad (opcional)','Spécialité (facultatif)','التخصص (اختياري)','विशेषज्ञता (वैकल्पिक)','Especialidade (opcional)','Spesialisasi (opsional)','Uzmanlık (isteğe bağlı)','专科（可选）'],
 any:['Любая','Any','Todas','Toutes','أي تخصص','कोई भी','Qualquer','Semua','Tümü','不限'],
 topic:['Тема или клинический вопрос','Topic or clinical question','Tema o pregunta clínica','Sujet ou question clinique','الموضوع أو السؤال السريري','विषय या नैदानिक प्रश्न','Tema ou pergunta clínica','Topik atau pertanyaan klinis','Konu veya klinik soru','主题或临床问题'],
 depth:['Глубина анализа','Search depth','Profundidad del análisis','Niveau de détail','عمق التحليل','विश्लेषण की गहराई','Profundidade da análise','Kedalaman analisis','Analiz derinliği','分析深度'],
 standard:['Стандарт · Gemini Flash','Standard · Gemini Flash','Estándar · Gemini Flash','Standard · Gemini Flash','قياسي · Gemini Flash','मानक · Gemini Flash','Padrão · Gemini Flash','Standar · Gemini Flash','Standart · Gemini Flash','标准 · Gemini Flash'],
 detailed:['Подробно · Sonnet 5.5','In-depth · Sonnet 5.5','Detallado · Sonnet 5.5','Détaillé · Sonnet 5.5','مفصل · Sonnet 5.5','विस्तृत · Sonnet 5.5','Detalhado · Sonnet 5.5','Terperinci · Sonnet 5.5','Ayrıntılı · Sonnet 5.5','详细 · Sonnet 5.5'],
 online:['Актуальные · Perplexity Sonar','Current · Perplexity Sonar','Actualizadas · Perplexity Sonar','Actualisées · Perplexity Sonar','محدثة · Perplexity Sonar','अद्यतन · Perplexity Sonar','Atuais · Perplexity Sonar','Terkini · Perplexity Sonar','Güncel · Perplexity Sonar','最新 · Perplexity Sonar'],
 output:['Язык клинических рекомендаций','Guidance output language','Idioma de las recomendaciones','Langue des recommandations','لغة الإرشادات','दिशानिर्देश की भाषा','Idioma das diretrizes','Bahasa hasil panduan','Rehber dili','指南输出语言'],
 same:['Как в интерфейсе','Match interface language','Como la interfaz','Comme l’interface','مثل لغة الواجهة','इंटरफ़ेस के समान','Igual à interface','Sama dengan antarmuka','Arayüz diliyle aynı','与界面语言一致'],
 geo:['Рекомендуемые источники','Preferred evidence sources','Fuentes recomendadas','Sources recommandées','مصادر الإرشادات المفضلة','प्रमुख स्रोत','Fontes preferidas','Sumber utama','Öncelikli kaynaklar','优先指南来源'],
 search:['Найти клинические рекомендации','Find clinical guidelines','Buscar guías clínicas','Rechercher les recommandations','البحث عن الإرشادات السريرية','नैदानिक दिशानिर्देश खोजें','Buscar diretrizes clínicas','Cari pedoman klinis','Klinik kılavuzları ara','搜索临床指南'],
 searching:['Поиск…','Searching…','Buscando…','Recherche…','جارٍ البحث…','खोज जारी है…','Buscando…','Mencari…','Aranıyor…','搜索中…'],
 result:['Рекомендации и клиническая тактика','Clinical guidance and management','Guías y manejo clínico','Recommandations et prise en charge','الإرشادات والتدبير السريري','दिशानिर्देश और उपचार योजना','Diretrizes e conduta clínica','Pedoman dan tata laksana','Kılavuzlar ve klinik yaklaşım','指南与临床处理'],
 model:['Модель','Model','Modelo','Modèle','النموذج','मॉडल','Modelo','Model','Model','模型'],
 cost:['Расчётная стоимость','Estimated cost','Coste estimado','Coût estimé','التكلفة التقديرية','अनुमानित लागत','Custo estimado','Perkiraan biaya','Tahmini maliyet','预估费用'],
 edit:['Редактировать','Edit','Editar','Modifier','تحرير','संपादित करें','Editar','Sunting','Düzenle','编辑'],
 preview:['Просмотр','Preview','Vista previa','Aperçu','معاينة','पूर्वावलोकन','Visualizar','Pratinjau','Önizleme','预览'],
 print:['Печать / PDF','Print / PDF','Imprimir / PDF','Imprimer / PDF','طباعة / PDF','प्रिंट / PDF','Imprimir / PDF','Cetak / PDF','Yazdır / PDF','打印 / PDF'],
 share:['Поделиться','Share','Compartir','Partager','مشاركة','साझा करें','Compartilhar','Bagikan','Paylaş','分享'],
 copy:['Копировать для разбора','Copy for case review','Copiar para revisión','Copier pour l’analyse','نسخ للمراجعة','समीक्षा हेतु कॉपी','Copiar para avaliação','Salin untuk telaah','Değerlendirme için kopyala','复制以供分析'],
 examples:['Примеры запросов','Example queries','Ejemplos de consultas','Exemples de requêtes','أمثلة للبحث','खोज उदाहरण','Exemplos de busca','Contoh pencarian','Örnek aramalar','查询示例'],
 disclaimer:['ИИ предлагает обследование и лечение; врач проверяет источники и редактирует рекомендации.','AI proposes investigations and treatment; the physician verifies sources and edits recommendations.','La IA propone pruebas y tratamientos; el médico verifica las fuentes.','L’IA propose examens et traitements ; le médecin vérifie les sources.','يقترح الذكاء الاصطناعي الفحوص والعلاج؛ يراجع الطبيب المصادر.','AI जांच और उपचार सुझाता है; चिकित्सक स्रोत जांचता है।','A IA sugere exames e tratamentos; o médico verifica as fontes.','AI menyarankan pemeriksaan dan terapi; dokter memeriksa sumber.','Yapay zekâ tetkik ve tedavi önerir; hekim kaynakları doğrular.','AI 提出检查和治疗建议；医生核对资料与建议。'],
} as const;
export type GuidelineUiKey=keyof typeof STRINGS;
export function guidelineUi(language:WorkspaceLanguage,key:GuidelineUiKey):string{
 const index=ORDER.indexOf(language);
 return STRINGS[key][index<0?1:index];
}
