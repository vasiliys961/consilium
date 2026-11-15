export async function audioDeadline<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(code)), ms)
    })])
  } finally { if (timer) clearTimeout(timer) }
}

