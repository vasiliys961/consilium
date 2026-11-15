import assert from "node:assert/strict";
import test from "node:test";
import { writeVisitNote } from "./note.ts";

test("a visit note keeps the draft and does not write a diagnosis", () => {
  const note = writeVisitNote({
    caseId: "case-1",
    locale: "ru",
    draft: "Черновик без подписи.",
    speech: "Метопролол 50 мг два раза в день",
  });
  assert.equal(note.diagnosed, false);
  assert.equal(note.specialty, "general");
  assert.match(note.text, /Черновик без подписи/);
  assert.match(note.text, /Метопролол 50 мг два раза в день/);
  assert.equal(note.text.includes("диагноз"), false);
  assert.match(note.document, /Черновик без подписи/);
  assert.equal(note.document.includes("<script"), false);
});
