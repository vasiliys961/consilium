/** Preview cloud access is active only after explicit admin approval and a verified reviewed-frame session. */
export function reviewedConnectionReady(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const status = raw as {enabled?: unknown;workstationConnected?: unknown};
  return status.enabled === true && status.workstationConnected === true;
}

/** Non-sensitive diagnostics for a clinician without exposing provider tokens. */
export function reviewedConnectionNotice(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "Не удалось проверить доступ к анализу. Снимки остаются локально.";
  const status = raw as {enabled?: unknown;workstationConnected?: unknown;configurationStatus?: unknown};
  if (status.enabled === true && status.workstationConnected === true)
    return "OpenRouter подключён к Radiology. Передача начнётся только после проверки снимков и разрешения врача.";
  switch (status.configurationStatus) {
    case "missing-provider":
      return "Radiology не получила настроенный OpenRouter. Администратору нужно проверить подключение Preview.";
    case "not-approved":
      return "Облачный анализ снимков ещё не разрешён администратором для этого Preview. Снимки остаются локально.";
    case "operator-required":
      return "Для Radiology требуется однократное подключение рабочего места администратором. Повторно подтверждать снимки не нужно.";
    case "not-development":
      return "Облачный исследовательский анализ доступен только в разрешённом локальном режиме Preview.";
    case "ready":
      return "Разрешение найдено, но сессия Radiology не подтверждена. Повторите проверку подключения.";
    default:
      return "Состояние подключения Radiology неизвестно. Облачная передача не выполняется.";
  }
}
