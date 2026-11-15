import assert from "node:assert/strict";
import test from "node:test";
import { conduct } from "./conductor.ts";
import { direction, languageName, LOCALES, parseLocale } from "./locale.ts";
import { needsSearchTranslation } from "./literature.ts";
import { messages, text } from "./messages.ts";

test("the screen catalog keeps eleven languages and Arabic runs right to left", () => {
  assert.deepEqual(
    LOCALES.map((item) => item.code),
    ["en", "ru", "es", "fr", "ar", "hi", "pt-BR", "id", "ms", "tr", "zh-CN"],
  );
  assert.equal(direction("ar"), "rtl");
  assert.equal(direction("es"), "ltr");
  assert.equal(languageName("zh-CN"), "Chinese");
  assert.equal(parseLocale("nope"), "en");
  const keys = Object.keys(messages.en);
  for (const item of LOCALES) {
    for (const key of keys) assert.ok(text(item.code)[key as keyof typeof messages.en]);
  }
});

test("a spanish screen keeps the unsigned draft in spanish and searches the world in english", () => {
  const result = conduct({ text: "dolor torácico", locale: "es" });
  assert.equal(result.locale, "es");
  assert.match(result.draft.summary, /Borrador sin firma/);
  assert.equal(result.gateway.called, false);
  assert.equal(needsSearchTranslation("dolor torácico", "es"), true);
  assert.equal(needsSearchTranslation("chest pain", "en"), false);
  assert.equal(needsSearchTranslation("одышка", "en"), true);
  assert.equal(needsSearchTranslation("ألم الصدر", "en"), true);
});
