import type {Locale} from './locale.ts';
import type {WorkspaceLanguage} from './workspace-i18n.ts';
import type {PhysicianTaskPlan,PhysicianTool} from './physician-task-router.ts';
import {workspaceText} from './workspace-i18n.ts';

/** The English text is the canonical international baseline.
 * Every English-first workflow hint has a second, selected-UI-language line.
 * This module is local: no AI translation, network calls, or additional cost.
 */
const codes=['en','es','fr','ar','hi','pt-BR','id','tr','zh-CN'] as const;
type OtherLocale=typeof codes[number];
const rows:ReadonlyArray<readonly string[]>=[
 // RU original, English, Spanish, French, Arabic, Hindi, Portuguese, Indonesian, Turkish, Chinese
 ['Opus Copilot — помощник врача','Opus Copilot — physician assistant','Opus Copilot — asistente médico','Opus Copilot — assistant médical','Opus Copilot — مساعد الطبيب','Opus Copilot — चिकित्सक सहायक','Opus Copilot — assistente médico','Opus Copilot — asisten dokter','Opus Copilot — hekim asistanı','Opus Copilot — 医生助手'],
 ['Помощник по приложению','App assistant','Asistente de la aplicación','Assistant de l’application','مساعد التطبيق','ऐप सहायक','Assistente do aplicativo','Asisten aplikasi','Uygulama asistanı','应用助手'],
 ['Нужен Opus Copilot?','Need Opus Copilot?','¿Necesita Opus Copilot?','Besoin d’Opus Copilot ?','هل تحتاج إلى Opus Copilot؟','Opus Copilot चाहिए?','Precisa do Opus Copilot?','Perlu Opus Copilot?','Opus Copilot gerekli mi?','需要 Opus Copilot 吗？'],
 ['Подскажет, куда перейти и как выполнить задачу. Короткий ответ обычно стоит доли цента.','Find the right tool and plan the next step. A short AI reply usually costs a fraction of a cent.','Encuentre la herramienta adecuada y planifique el siguiente paso. Una respuesta breve de IA suele costar una fracción de centavo.','Trouvez le bon outil et planifiez la suite. Une brève réponse IA coûte généralement une fraction de centime.','اعثر على الأداة المناسبة والخطوة التالية. تكلفة إجابة قصيرة عادة أقل من سنت.','सही उपकरण और अगला कदम चुनें। संक्षिप्त एआई उत्तर सामान्यतः एक सेंट से कम खर्च करता है।','Encontre a ferramenta certa e o próximo passo. Uma resposta curta de IA geralmente custa menos de um centavo.','Temukan alat dan langkah berikutnya. Jawaban AI singkat biasanya kurang dari satu sen.','Uygun aracı ve sonraki adımı bulun. Kısa yapay zekâ yanıtı genellikle bir sentten ucuzdur.','查找合适的工具并规划下一步。简短 AI 回复通常不到一美分。'],
 ['Включить помощника','Enable assistant','Activar asistente','Activer l’assistant','تفعيل المساعد','सहायक चालू करें','Ativar assistente','Aktifkan asisten','Asistanı aç','启用助手'],
 ['Необязательно. Приложение работает и без него.','Optional. The app also works without it.','Opcional. La aplicación funciona sin él.','Facultatif. L’application fonctionne sans lui.','اختياري، يعمل التطبيق بدونه.','वैकल्पिक। ऐप इसके बिना भी काम करता है।','Opcional. O aplicativo funciona sem ele.','Opsional. Aplikasi tetap berfungsi tanpanya.','İsteğe bağlı. Uygulama onsuz da çalışır.','可选。不启用也能使用本应用。'],
 ['Opus Copilot включён — вопросы обрабатываются через внешнюю ИИ-модель.','Opus Copilot is on. AI requests use an external model.','Opus Copilot está activo. Las consultas de IA usan un modelo externo.','Opus Copilot est activé. Les requêtes IA utilisent un modèle externe.','تم تفعيل Opus Copilot. تستخدم طلبات الذكاء الاصطناعي نموذجًا خارجيًا.','Opus Copilot चालू है। एआई प्रश्न बाहरी मॉडल से संसाधित होते हैं।','Opus Copilot ativado. As consultas de IA usam um modelo externo.','Opus Copilot aktif. Permintaan AI memakai model eksternal.','Opus Copilot açık. Yapay zekâ istekleri harici model kullanır.','Opus Copilot 已启用。AI 请求由外部模型处理。'],
 ['Отключить Copilot','Turn off Copilot','Desactivar Copilot','Désactiver Copilot','إيقاف Copilot','Copilot बंद करें','Desativar Copilot','Nonaktifkan Copilot','Copilot’u kapat','关闭 Copilot'],
 ['Выбран клинический случай','Selected clinical case','Caso clínico seleccionado','Cas clinique sélectionné','الحالة السريرية المحددة','चयनित नैदानिक मामला','Caso clínico selecionado','Kasus klinis terpilih','Seçilen klinik vaka','已选临床病例'],
 ['Случай завершён','Case closed','Caso cerrado','Cas clôturé','الحالة مغلقة','मामला बंद है','Caso encerrado','Kasus ditutup','Vaka kapalı','病例已结束'],
 ['Что хотите сделать?','What would you like to do?','¿Qué desea hacer?','Que souhaitez-vous faire ?','ماذا تريد أن تفعل؟','आप क्या करना चाहेंगे?','O que gostaria de fazer?','Apa yang ingin Anda lakukan?','Ne yapmak istersiniz?','您想做什么？'],
 ['Например: покажи, где начать разбор случая','For example: help me start reviewing a clinical case','Por ejemplo: ayúdame a analizar un caso clínico','Par exemple : aidez-moi à analyser un cas clinique','مثال: ساعدني في بدء مراجعة حالة سريرية','उदाहरण: नैदानिक मामले की समीक्षा शुरू करने में मदद करें','Exemplo: ajude-me a analisar um caso clínico','Contoh: bantu saya meninjau kasus klinis','Örneğin: klinik vaka incelemesine başlamama yardım et','例如：帮我开始分析一个临床病例'],
 ['Отвечает…','Responding…','Respondiendo…','Réponse en cours…','جارٍ الرد…','उत्तर तैयार हो रहा है…','Respondendo…','Menjawab…','Yanıt hazırlanıyor…','正在回复…'],
 ['Спросить Copilot','Ask Copilot','Preguntar a Copilot','Demander à Copilot','اسأل Copilot','Copilot से पूछें','Perguntar ao Copilot','Tanya Copilot','Copilot’a sor','询问 Copilot'],
 ['Найти инструмент','Find a tool','Buscar herramienta','Trouver un outil','البحث عن أداة','उपकरण खोजें','Encontrar ferramenta','Cari alat','Araç bul','查找工具'],
 ['Новый разговор','New conversation','Nueva conversación','Nouvelle conversation','محادثة جديدة','नई बातचीत','Nova conversa','Percakapan baru','Yeni konuşma','新对话'],
 ['Остановить микрофон','Stop microphone','Detener micrófono','Arrêter le microphone','إيقاف الميكروفون','माइक्रोफ़ोन बंद करें','Parar microfone','Hentikan mikrofon','Mikrofonu durdur','停止麦克风'],
 ['Ввести голосом','Speak your question','Dictar pregunta','Dicter la question','إملاء السؤال صوتيًا','बोलकर प्रश्न पूछें','Ditar pergunta','Ucapkan pertanyaan','Sesli soru sor','语音输入'],
 ['Разрешаю голосовой ввод. Распознавание может выполняться службой браузера. Вопрос перед отправкой можно исправить.','I allow voice input. Speech recognition may use a browser service. I can edit the text before sending it.','Permito la entrada de voz. El navegador puede procesar el audio. Puedo editar el texto antes de enviarlo.','J’autorise la dictée vocale. Le navigateur peut traiter la voix. Je peux modifier le texte avant l’envoi.','أوافق على الإدخال الصوتي. قد تستخدم عملية التعرف خدمة المتصفح. يمكنني تعديل النص قبل إرساله.','मैं ध्वनि इनपुट की अनुमति देता/देती हूँ। पहचान ब्राउज़र सेवा का उपयोग कर सकती है। भेजने से पहले पाठ संपादित किया जा सकता है।','Autorizo a entrada por voz. O navegador pode processar o áudio. Posso editar o texto antes do envio.','Saya izinkan input suara. Pengenalan dapat memakai layanan browser. Teks dapat saya edit sebelum dikirim.','Sesli girişi onaylıyorum. Tanıma tarayıcı hizmetini kullanabilir. Göndermeden önce metni düzenleyebilirim.','我同意语音输入。语音识别可能使用浏览器服务。发送前可以编辑文字。'],
 ['Подбираю инструменты…','Finding suitable tools…','Buscando herramientas…','Recherche d’outils adaptés…','جارٍ البحث عن الأدوات المناسبة…','उपयुक्त उपकरण खोजे जा रहे हैं…','Buscando ferramentas…','Mencari alat yang sesuai…','Uygun araçlar bulunuyor…','正在查找合适的工具…'],
 ['Маршрут доступен ниже.','You can still use the suggested route below.','Puede utilizar el flujo sugerido abajo.','Vous pouvez utiliser le parcours proposé ci-dessous.','يمكنك استخدام المسار المقترح أدناه.','आप नीचे सुझाया गया मार्ग उपयोग कर सकते हैं।','Você pode usar o fluxo sugerido abaixo.','Anda dapat memakai alur di bawah.','Aşağıdaki önerilen yolu kullanabilirsiniz.','您仍可使用下方建议的流程。'],
 ['История разговора','Conversation history','Historial de conversación','Historique de conversation','سجل المحادثة','बातचीत का इतिहास','Histórico da conversa','Riwayat percakapan','Konuşma geçmişi','对话历史'],
 ['Врач','Physician','Médico','Médecin','الطبيب','चिकित्सक','Médico','Dokter','Hekim','医生'],
 ['Сведения о модели и расходах','Model and cost details','Detalles del modelo y costo','Détails du modèle et du coût','تفاصيل النموذج والتكلفة','मॉडल और लागत विवरण','Detalhes do modelo e custo','Rincian model dan biaya','Model ve maliyet ayrıntıları','模型和费用详情'],
 ['Модель','Model','Modelo','Modèle','النموذج','मॉडल','Modelo','Model','Model','模型'],
 ['нет данных','Not available','No disponible','Non disponible','غير متاح','उपलब्ध नहीं','Não disponível','Tidak tersedia','Mevcut değil','暂无数据'],
 ['Примеры задач и возможности','Example tasks and capabilities','Ejemplos y funciones','Exemples et fonctionnalités','أمثلة المهام والقدرات','उदाहरण और قدرات','Exemplos e recursos','Contoh tugas dan kemampuan','Örnek görevler ve özellikler','示例任务与功能'],
 ['Показать возможности','Show capabilities','Mostrar funciones','Afficher les fonctionnalités','عرض الإمكانات','क्षमताएँ दिखाएँ','Mostrar recursos','Tampilkan kemampuan','Özellikleri göster','显示功能'],
 ['Примеры задач','Example tasks','Ejemplos de tareas','Exemples de tâches','أمثلة للمهام','उदाहरण कार्य','Exemplos de tarefas','Contoh tugas','Örnek görevler','任务示例'],
 ['Предлагаемый маршрут','Suggested workflow','Flujo sugerido','Parcours proposé','مسار العمل المقترح','सुझाया गया कार्यप्रवाह','Fluxo sugerido','Alur yang disarankan','Önerilen iş akışı','建议的工作流程'],
 ['Обсудить со специалистом','Discuss with a specialist','Consultar a un especialista','Consulter un spécialiste','استشر اختصاصيًا','विशेषज्ञ से चर्चा करें','Consultar um especialista','Diskusikan dengan spesialis','Uzmana danış','咨询专科医生'],
 ['Выбрать специальность самостоятельно','Choose specialty manually','Elegir especialidad','Choisir la spécialité','اختر التخصص بنفسك','विशेषज्ञता चुनें','Escolher especialidade','Pilih spesialisasi','Uzmanlığı kendiniz seçin','手动选择专科'],
 ['Что умеет Doctor Opus?','What can Doctor Opus do?','¿Qué puede hacer Doctor Opus?','Que peut faire Doctor Opus ?','ماذا يمكن أن يفعل Doctor Opus؟','Doctor Opus क्या कर सकता है?','O que o Doctor Opus pode fazer?','Apa yang bisa dilakukan Doctor Opus?','Doctor Opus neler yapabilir?','Doctor Opus 能做什么？'],
 ['У пациента кашель и одышка. Куда перейти для разбора?','A patient has cough and breathlessness. Which tool should I use?','Un paciente tiene tos y disnea. ¿Qué herramienta debo usar?','Un patient présente une toux et une dyspnée. Quel outil utiliser ?','مريض يعاني من السعال وضيق التنفس. أي أداة أستخدم؟','मरीज को खांसी और सांस फूलना है। कौन सा उपकरण उपयोग करूँ?','Um paciente tem tosse e falta de ar. Qual ferramenta usar?','Pasien batuk dan sesak napas. Alat apa yang digunakan?','Hastada öksürük ve nefes darlığı var. Hangi aracı kullanmalıyım?','患者咳嗽、呼吸困难，应使用哪个工具？'],
 ['Проверить взаимодействия лекарств и ограничения при сниженной СКФ.','Check drug interactions and precautions with reduced eGFR.','Comprobar interacciones farmacológicas y precauciones con TFGe reducida.','Vérifier les interactions médicamenteuses et les précautions si le DFG est réduit.','تحقق من التداخلات الدوائية والاحتياطات مع انخفاض معدل الترشيح الكبيبي.','कम eGFR में दवा पारस्परिक क्रियाओं और सावधानियों की जाँच करें।','Verificar interações medicamentosas e precauções com TFGe reduzida.','Periksa interaksi obat dan kehati-hatian saat eGFR menurun.','Düşük eGFR’de ilaç etkileşimlerini ve önlemleri kontrol et.','检查 eGFR 降低时的药物相互作用和注意事项。'],
 ['Записать приём и подготовить черновик протокола.','Record the visit and prepare a draft clinical note.','Grabar la consulta y preparar una nota clínica.','Enregistrer la consultation et préparer un brouillon de compte rendu.','سجّل الزيارة وحضّر مسودة ملاحظة سريرية.','परामर्श रिकॉर्ड करें और नैदानिक नोट का मसौदा तैयार करें।','Gravar a consulta e preparar um rascunho clínico.','Rekam kunjungan dan siapkan draf catatan klinis.','Muayeneyi kaydet ve klinik not taslağı hazırla.','录制就诊并准备病历草稿。'],
 ['Проверьте передаваемые данные.','Review the data before sending.','Revise los datos antes de enviarlos.','Vérifiez les données avant l’envoi.','راجع البيانات قبل الإرسال.','भेजने से पहले डेटा जाँचें।','Revise os dados antes de enviar.','Periksa data sebelum mengirim.','Göndermeden önce verileri kontrol edin.','发送前检查数据。'],
 ['В этой установке не настроен доступ к модели.','AI model access is not configured.','El acceso al modelo de IA no está configurado.','L’accès au modèle IA n’est pas configuré.','لم يتم إعداد الوصول إلى النموذج.','एआई मॉडल का एक्सेस कॉन्फ़िगर नहीं है।','O acesso ao modelo não está configurado.','Akses model AI belum diatur.','Yapay zekâ modeline erişim ayarlanmamış.','尚未配置 AI 模型访问。'],
 ['Помощник занят. Повторите вопрос позже.','Copilot is busy. Please retry manually.','Copilot está ocupado. Vuelva a intentarlo.','Copilot est occupé. Réessayez.','Copilot مشغول. حاول مجددًا.','Copilot व्यस्त है। फिर प्रयास करें।','Copilot está ocupado. Tente novamente.','Copilot sibuk. Coba lagi.','Copilot meşgul. Tekrar deneyin.','Copilot 忙碌，请重试。'],
 ['Помощник сейчас недоступен.','Copilot is currently unavailable.','Copilot no está disponible.','Copilot est indisponible.','Copilot غير متاح حاليًا.','Copilot अभी उपलब्ध नहीं है।','Copilot indisponível no momento.','Copilot sedang tidak tersedia.','Copilot şu anda kullanılamıyor.','Copilot 暂时不可用。'],
 ['Вопрос не отправлен. Можно воспользоваться списком возможностей.','The question was not sent. You can choose a tool manually.','No se envió la pregunta. Puede elegir una herramienta.','La question n’a pas été envoyée. Choisissez un outil.','لم يُرسل السؤال. يمكنك اختيار أداة يدويًا.','प्रश्न नहीं भेजा गया। उपकरण स्वयं चुन सकते हैं।','A pergunta não foi enviada. Escolha uma ferramenta.','Pertanyaan tidak terkirim. Anda dapat memilih alat.','Soru gönderilmedi. Aracı kendiniz seçebilirsiniz.','问题未发送，您仍可手动选择工具。'],
 ['Модель вернула некорректный ответ. Можно выбрать инструмент вручную.','The AI response was invalid. Choose a tool manually.','La respuesta de IA no fue válida. Elija una herramienta.','La réponse de l’IA était invalide. Choisissez un outil.','كانت استجابة النموذج غير صالحة. اختر أداة يدويًا.','एआई उत्तर अमान्य था। उपकरण स्वयं चुनें।','A resposta da IA foi inválida. Escolha uma ferramenta.','Jawaban AI tidak valid. Pilih alat manual.','Yapay zekâ yanıtı geçersiz. Aracı kendiniz seçin.','AI 响应无效，请手动选择工具。'],
 ['Наличие инструмента будет проверено при открытии.','Tool availability will be checked when opened.','La disponibilidad se comprobará al abrirlo.','La disponibilité sera vérifiée à l’ouverture.','سيتم التحقق من توفر الأداة عند فتحها.','उपकरण खोलने पर उपलब्धता जाँची जाएगी।','A disponibilidade será verificada ao abrir.','Ketersediaan diperiksa saat dibuka.','Araç açıldığında kullanılabilirlik kontrol edilir.','打开时将检查工具是否可用。'],
 ['Проверяем подключение.','Checking connection.','Comprobando conexión.','Vérification de la connexion.','جارٍ التحقق من الاتصال.','कनेक्शन जाँच रहे हैं।','Verificando conexão.','Memeriksa koneksi.','Bağlantı kontrol ediliyor.','正在检查连接。'],
 ['Протокол осмотра','Clinical note','Nota clínica','Compte rendu clinique','ملاحظة سريرية','नैदानिक नोट','Nota clínica','Catatan klinis','Klinik not','临床记录'],
 ['Клинический разбор','Clinical review','Revisión clínica','Analyse clinique','المراجعة السريرية','नैदानिक समीक्षा','Revisão clínica','Tinjauan klinis','Klinik değerlendirme','临床病例分析'],
 ['Спросить специалиста','Ask a specialist','Consultar a un especialista','Interroger un spécialiste','اسأل اختصاصيًا','विशेषज्ञ से पूछें','Consultar um especialista','Tanya spesialis','Uzmana sor','咨询专科医生'],
 ['Проверка лекарств','Medication safety','Seguridad farmacológica','Sécurité des médicaments','سلامة الأدوية','दवा सुरक्षा','Segurança medicamentosa','Keamanan obat','İlaç güvenliği','用药安全'],
 ['Клинические рекомендации','Clinical guidelines','Guías clínicas','Recommandations cliniques','الإرشادات السريرية','नैदानिक दिशानिर्देश','Diretrizes clínicas','Panduan klinis','Klinik kılavuzlar','临床指南'],
 ['Запись беседы в протоколе','Record the encounter','Grabar la consulta','Enregistrer la consultation','تسجيل الزيارة','परामर्श रिकॉर्ड करें','Gravar a consulta','Rekam konsultasi','Muayeneyi kaydet','录制问诊'],
 ['Документы и лаборатория','Documents and laboratory','Documentos y laboratorio','Documents et laboratoire','المستندات والتحاليل','दस्तावेज़ और प्रयोगशाला','Documentos e laboratório','Dokumen dan laboratorium','Belgeler ve laboratuvar','文档与化验'],
 ['ЭКГ','ECG','ECG','ECG','تخطيط القلب','ईसीजी','ECG','EKG','EKG','心电图'],
 ['Генетика','Genetics','Genética','Génétique','الوراثة','आनुवंशिकी','Genética','Genetika','Genetik','遗传学'],
 ['УЗИ','Ultrasound','Ecografía','Échographie','التصوير بالموجات فوق الصوتية','अल्ट्रासाउंड','Ultrassom','USG','Ultrason','超声'],
 ['Терапия','General internal medicine','Medicina interna general','Médecine interne générale','الطب الباطني العام','सामान्य आंतरिक चिकित्सा','Clínica médica geral','Penyakit dalam umum','Genel iç hastalıkları','全科内科'],
 ['Кардиология','Cardiology','Cardiología','Cardiologie','أمراض القلب','हृदय रोग','Cardiologia','Kardiologi','Kardiyoloji','心脏病学'],
 ['Пульмонология','Pulmonology','Neumología','Pneumologie','أمراض الرئة','फुफ्फुस रोग','Pneumologia','Pulmonologi','Göğüs hastalıkları','呼吸内科'],
 ['Неврология','Neurology','Neurología','Neurologie','طب الأعصاب','तंत्रिका विज्ञान','Neurologia','Neurologi','Nöroloji','神经内科'],
 ['Эндокринология','Endocrinology','Endocrinología','Endocrinologie','الغدد الصماء','अंतःस्रावी रोग','Endocrinologia','Endokrinologi','Endokrinoloji','内分泌科'],
 ['Гастроэнтерология','Gastroenterology','Gastroenterología','Gastro-entérologie','أمراض الجهاز الهضمي','जठरांत्र रोग','Gastroenterologia','Gastroenterologi','Gastroenteroloji','消化内科'],
 ['Ревматология','Rheumatology','Reumatología','Rhumatologie','أمراض الروماتيزم','रूमेटोलॉजी','Reumatologia','Reumatologi','Romatoloji','风湿科'],
 ['Гематология','Hematology','Hematología','Hématologie','أمراض الدم','रक्त रोग','Hematologia','Hematologi','Hematoloji','血液科'],
 ['Педиатрия','Pediatrics','Pediatría','Pédiatrie','طب الأطفال','बाल रोग','Pediatria','Pediatri','Pediatri','儿科'],
 ['Дерматология','Dermatology','Dermatología','Dermatologie','الأمراض الجلدية','त्वचा रोग','Dermatologia','Dermatologi','Dermatoloji','皮肤科'],
 ['Онкология','Oncology','Oncología','Oncologie','طب الأورام','ऑन्कोलॉजी','Oncologia','Onkologi','Onkoloji','肿瘤科'],
 ['Травматология и ортопедия','Traumatology and orthopedics','Traumatología y ortopedia','Traumatologie et orthopédie','طب الرضوض والعظام','आघात और अस्थि रोग','Traumatologia e ortopedia','Traumatologi dan ortopedi','Travmatoloji ve ortopedi','创伤与骨科'],
 ['Акушерство и гинекология','Obstetrics and gynecology','Obstetricia y ginecología','Obstétrique et gynécologie','أمراض النساء والتوليد','प्रसूति एवं स्त्री रोग','Obstetrícia e ginecologia','Obstetri dan ginekologi','Kadın hastalıkları ve doğum','妇产科'],
 ['Лучевая диагностика','Diagnostic imaging','Diagnóstico por imagen','Imagerie diagnostique','التصوير التشخيصي','नैदानिक इमेजिंग','Diagnóstico por imagem','Pencitraan diagnostik','Tanısal görüntüleme','影像诊断'],
];
const lookup=new Map(rows.map(row=>[row[0],row]));
export function copilotText(locale:WorkspaceLanguage,key:string):string{
 if(locale==='ru')return key;
 const index=codes.indexOf(locale as OtherLocale);
 const row=lookup.get(key);
 if(row&&index>=0)return row[index+1]??row[1];
 const translated=workspaceText(locale,key);
 return translated!==key?translated:workspaceText('en',key);
}
/** Missing translations are never silently presented as Russian in the EN product line. */
export function copilotHasTranslation(locale:Exclude<WorkspaceLanguage,'ru'>,key:string):boolean{
 const row=lookup.get(key);
 return !!row&&!!row[codes.indexOf(locale as OtherLocale)+1]?.trim();
}
export const COPILOT_UI_KEYS=rows.map(row=>row[0]);

const toolKey:Record<PhysicianTool,string>={
 radiology:'Opus Radiology',ecg:'ЭКГ',ultrasound:'УЗИ',genetics:'Генетика',
 medications:'Проверка лекарств',guidelines:'Клинические рекомендации',
 clinical:'Клинический разбор',specialist:'Спросить специалиста',
 protocol:'Протокол осмотра',ambient:'Запись беседы в протоколе',
 documents:'Документы и лаборатория',
};
export function copilotToolTitle(locale:WorkspaceLanguage,tool:PhysicianTool):string{
 return copilotText(locale,toolKey[tool]);
}

const routeLabels:Record<Locale,{suggested:string;help:string;intro:string;unknown:string;urgent:string}>={
 en:{suggested:'Suggested next step',help:'Doctor Opus tools',intro:'Choose an option below; no analysis starts automatically.',unknown:'Tell me what you need. You can also ask a general internal medicine specialist.',urgent:'For severe or persistent chest pain, seek urgent in-person assessment.'},
 ru:{suggested:'Предлагаемый следующий шаг',help:'Инструменты Doctor Opus',intro:'Выберите вариант ниже — анализ не запускается автоматически.',unknown:'Опишите задачу. Можно также обратиться к универсальному специалисту.',urgent:'При выраженной или длительной боли в груди нужна срочная очная оценка.'},
 es:{suggested:'Siguiente paso sugerido',help:'Herramientas de Doctor Opus',intro:'Elija una opción abajo; el análisis no se inicia automáticamente.',unknown:'Describa su necesidad. También puede consultar a medicina interna general.',urgent:'El dolor torácico intenso o persistente requiere valoración presencial urgente.'},
 fr:{suggested:'Prochaine étape suggérée',help:'Outils de Doctor Opus',intro:'Choisissez une option ci-dessous ; aucune analyse ne démarre automatiquement.',unknown:'Décrivez votre besoin. Vous pouvez consulter un spécialiste en médecine interne générale.',urgent:'Une douleur thoracique intense ou persistante nécessite une évaluation urgente.'},
 ar:{suggested:'الخطوة التالية المقترحة',help:'أدوات Doctor Opus',intro:'اختر خيارًا أدناه، لن يبدأ التحليل تلقائيًا.',unknown:'صف ما تحتاجه. يمكنك أيضًا استشارة اختصاصي الطب الباطني العام.',urgent:'ألم الصدر الشديد أو المستمر يتطلب تقييمًا طبيًا عاجلًا.'},
 hi:{suggested:'सुझाया गया अगला कदम',help:'Doctor Opus के उपकरण',intro:'नीचे विकल्प चुनें; विश्लेषण अपने आप शुरू नहीं होगा।',unknown:'अपनी आवश्यकता बताएं। आप सामान्य आंतरिक चिकित्सा विशेषज्ञ से भी पूछ सकते हैं।',urgent:'सीने में तीव्र या लगातार दर्द के लिए तत्काल प्रत्यक्ष चिकित्सा जाँच आवश्यक है।'},
 'pt-BR':{suggested:'Próximo passo sugerido',help:'Ferramentas do Doctor Opus',intro:'Escolha uma opção abaixo; a análise não começa automaticamente.',unknown:'Descreva o que precisa. Você também pode consultar clínica médica geral.',urgent:'Dor torácica intensa ou persistente requer avaliação presencial urgente.'},
 id:{suggested:'Langkah berikutnya yang disarankan',help:'Alat Doctor Opus',intro:'Pilih opsi di bawah; analisis tidak berjalan otomatis.',unknown:'Jelaskan kebutuhan Anda. Anda juga dapat bertanya kepada spesialis penyakit dalam umum.',urgent:'Nyeri dada berat atau menetap memerlukan penilaian medis segera.'},
 ms:{suggested:'Langkah seterusnya yang dicadangkan',help:'Alat Doctor Opus',intro:'Pilih pilihan di bawah; analisis tidak bermula secara automatik.',unknown:'Nyatakan keperluan anda. Anda juga boleh berunding dengan pakar perubatan dalaman.',urgent:'Sakit dada yang teruk atau berterusan memerlukan penilaian segera.'},
 tr:{suggested:'Önerilen sonraki adım',help:'Doctor Opus araçları',intro:'Aşağıdan bir seçenek seçin; analiz otomatik başlamaz.',unknown:'İhtiyacınızı açıklayın. Genel iç hastalıkları uzmanına da danışabilirsiniz.',urgent:'Şiddetli veya uzun süren göğüs ağrısı acil yüz yüze değerlendirme gerektirir.'},
 'zh-CN':{suggested:'建议的下一步',help:'Doctor Opus 工具',intro:'请在下方选择；不会自动开始分析。',unknown:'请描述您的需求，也可以咨询全科内科专家。',urgent:'严重或持续的胸痛需要立即现场就医评估。'},
};
export function copilotWorkflowMessage(locale:Locale,plan:PhysicianTaskPlan,options?:{urgent?:boolean;specialty?:string}):{english:string;localized:string|null}{
 const en=routeLabels.en, local=routeLabels[locale]??en;
 let first:string,second:string;
 if(plan.intent==='help'){
  first=en.help+': '+en.intro;second=local.help+': '+local.intro;
 }else if(plan.steps.length){
  const step=plan.steps[0].tool;
  const enName=options?.specialty?copilotText('en',options.specialty):copilotToolTitle('en',step);
  const localName=options?.specialty?copilotText(locale==='ms'?'en':locale,options.specialty):copilotToolTitle(locale==='ms'?'en':locale,step);
  first=en.suggested+': '+enName+'. '+en.intro;
  second=local.suggested+': '+localName+'. '+local.intro;
 }else{
  first=en.unknown;second=local.unknown;
 }
 if(options?.urgent){first+=' '+en.urgent;second+=' '+local.urgent;}
 return {english:first,localized:locale==='en'?null:second};
}
export function copilotBilingualLines(locale:Locale,plan:PhysicianTaskPlan,options?:{urgent?:boolean;specialty?:string}):string{
 const lines=copilotWorkflowMessage(locale,plan,options);
 return lines.localized?lines.english+'\n'+lines.localized:lines.english;
}

const reasonSuffix:Record<Locale,string>={
 en:'Open this module to continue; the physician reviews any result.',
 ru:'Откройте этот модуль; результаты проверяет врач.',
 es:'Abra este módulo para continuar; el médico revisa los resultados.',
 fr:'Ouvrez ce module pour continuer ; le médecin vérifie les résultats.',
 ar:'افتح هذه الوحدة للمتابعة؛ يراجع الطبيب النتائج.',
 hi:'आगे बढ़ने के लिए यह मॉड्यूल खोलें; चिकित्सक परिणाम जाँचता है।',
 'pt-BR':'Abra este módulo para continuar; o médico revisa os resultados.',
 id:'Buka modul ini untuk melanjutkan; dokter memeriksa hasilnya.',
 ms:'Buka modul ini untuk meneruskan; doktor menyemak hasilnya.',
 tr:'Devam etmek için bu modülü açın; sonuçları hekim değerlendirir.',
 'zh-CN':'打开此模块继续；结果由医生审核。',
};
export function copilotToolReason(locale:WorkspaceLanguage,_tool:PhysicianTool):string{
 return reasonSuffix[locale];
}
