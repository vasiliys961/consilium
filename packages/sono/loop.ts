export type DicomLoop = "still" | "cine" | "unread";

export function loopReason(kind: Exclude<DicomLoop, "still">, locale: "en" | "ru"): string {
  if (kind === "cine") {
    return locale === "ru"
      ? "Петля DICOM не открывается. Ролик остаётся в списке."
      : "The DICOM loop is not opened. The clip stays in the list.";
  }
  return locale === "ru"
    ? "Кадр УЗИ не открылся. Размер не считается."
    : "The ultrasound frame did not open. No measurement was made.";
}

export function readLoop(
  file: { name?: string; loop?: string },
  locale: "en" | "ru" = "en",
): { kind: DicomLoop; reason: string } | null {
  if (!/\.(dcm|dicom)$/i.test(file.name ?? "")) return null;
  if (file.loop !== "still" && file.loop !== "cine" && file.loop !== "unread") return null;
  return {
    kind: file.loop,
    reason: file.loop === "still" ? "" : loopReason(file.loop, locale),
  };
}
