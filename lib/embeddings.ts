/**
 * Локальные текстовые эмбеддинги для семантического поиска (RAG).
 *
 * Модель и вычисления полностью в браузере (transformers.js):
 * содержимое книг НЕ уходит на сервер. Модель загружается с этого компьютера из /models/.
 * Для установки ресурсов: npm run setup:library-models.
 *
 * Модель: multilingual-e5-small (384 измерения, RU/EN).
 * Для e5 важны префиксы "query:" / "passage:".
 */

const MODEL_ID = 'Xenova/multilingual-e5-small';

export const EMBEDDING_DIM = 384;

type FeatureExtractor = (
  input: string[],
  options: { pooling: 'mean'; normalize: boolean }
) => Promise<{ data: Float32Array; dims: number[] }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

/**
 * Лениво и единожды инициализирует пайплайн извлечения эмбеддингов.
 * Модель и WASM-движок берутся ЛОКАЛЬНО из /public (вариант "всё локально"):
 * ничего не скачивается из интернета. При сбое вызывающий код должен
 * откатиться на поиск по ключевым словам.
 */
async function getExtractor(): Promise<FeatureExtractor> {
  if (extractorPromise) return extractorPromise;

  extractorPromise = (async () => {
    // Ленивый импорт: тяжёлый пакет попадает в отдельный чанк и грузится по требованию.
    const { pipeline, env } = await import('@xenova/transformers');

    // Только локальные ресурсы — никаких внешних запросов (совместимо с CSP).
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = '/models/';
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.wasmPaths = '/ort/';
      // Без COOP/COEP заголовков многопоточность недоступна — работаем в один поток.
      env.backends.onnx.wasm.numThreads = 1;
    }

    return (await pipeline('feature-extraction', MODEL_ID, {
      quantized: true,
    })) as unknown as FeatureExtractor;
  })().catch((err) => {
    // Сбрасываем кэш промиса, чтобы можно было повторить попытку позже.
    extractorPromise = null;
    throw err;
  });

  return extractorPromise;
}

/**
 * Доступна ли в принципе локальная векторизация в текущей среде.
 */
export function isEmbeddingSupported(): boolean {
  return typeof window !== 'undefined' && typeof WebAssembly !== 'undefined';
}

/**
 * Прогревает модель заранее (например, при открытии библиотеки),
 * чтобы первая индексация/поиск не ждали скачивания.
 */
export async function warmupEmbeddings(): Promise<boolean> {
  if (!isEmbeddingSupported()) return false;
  try {
    await getExtractor();
    return true;
  } catch {
    return false;
  }
}

function splitTensorRows(data: Float32Array, dim: number, count: number): Float32Array[] {
  const rows: Float32Array[] = [];
  for (let i = 0; i < count; i++) {
    rows.push(data.slice(i * dim, (i + 1) * dim));
  }
  return rows;
}

/**
 * Считает нормализованные эмбеддинги для набора текстов.
 * kind = 'passage' для фрагментов книги, 'query' для поискового запроса.
 */
export async function embedTexts(
  texts: string[],
  kind: 'passage' | 'query' = 'passage'
): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const prefixed = texts.map((t) => `${kind}: ${t}`);
  const output = await extractor(prefixed, { pooling: 'mean', normalize: true });
  const dim = output.dims[output.dims.length - 1] || EMBEDDING_DIM;
  return splitTensorRows(output.data, dim, texts.length);
}

/**
 * Эмбеддинг одиночного поискового запроса.
 */
export async function embedQuery(text: string): Promise<Float32Array> {
  const [vector] = await embedTexts([text], 'query');
  return vector;
}

/**
 * Косинусная близость двух нормализованных векторов (= скалярное произведение).
 * Возвращает значение в диапазоне ~[-1, 1].
 */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

const INT8_SCALE = 127;

/**
 * Квантование нормализованного вектора в int8 (значения [-1,1] -> [-127,127]).
 * Снижает размер хранения и потребление RAM в ~4 раза почти без потери качества.
 */
export function quantizeInt8(vec: Float32Array): Int8Array {
  const out = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const q = Math.round(vec[i] * INT8_SCALE);
    out[i] = q > 127 ? 127 : q < -127 ? -127 : q;
  }
  return out;
}

/**
 * Скалярное произведение float-запроса и сохранённого вектора, который может
 * быть как Float32 (старые данные), так и Int8 (квантованные). Для int8
 * выполняется «на лету» деквантование делением на масштаб.
 */
export function dequantizedDot(
  query: ArrayLike<number>,
  stored: Float32Array | Int8Array
): number {
  const len = Math.min(query.length, stored.length);
  let dot = 0;
  if (stored instanceof Int8Array) {
    for (let i = 0; i < len; i++) {
      dot += query[i] * (stored[i] / INT8_SCALE);
    }
    return dot;
  }
  for (let i = 0; i < len; i++) {
    dot += query[i] * stored[i];
  }
  return dot;
}

