# Medical Translator

Live speech translation for a doctor–patient visit. This project is a copy of the translator section from Doctor Opus, so the speech flow can be changed here without touching the clinic app.

## Automatic medical dialogue

Select **Auto dialogue** (the default), choose the doctor's and patient's languages, and press **Start**. Wait for **Listening**, then speak in turns. After a short pause the translation plays automatically. Each utterance is translated into the other selected language; consecutive phrases in one language keep their direction. Wait until playback finishes before replying. Press **Stop** to end.

This mode uses the same WebRTC speech client and automatic server VAD responses as the CIPS translator, with medical interpretation instructions. Audio plays through the remote HTML audio element; there is no custom audio graph or separate response generation. `AUTO_DIALOGUE_REALTIME_MODEL` optionally overrides the default model. The server exchanges the SDP; the API key stays on the server. Existing sign-in is required. Audio is sent to OpenAI; transcript history is kept in component memory and cleared when starting again. Changing languages or hiding the page ends the session.

The existing medical fidelity checks flag potential dose, number, negation and terminology differences in the completed text. They do not verify audio or guarantee correctness. Important medical details must be confirmed with the speaker.

**Manual mode** retains the original **Now the patient**, **Now the doctor**, and **End** controls. Manual mode uses the dedicated translation model and its own output-language list.

Sign-in, the database, and credit charges stay in Doctor Opus. This app does not deduct a balance.

## Run

```bash
cp .env.example .env.local
```

Put `OPENAI_API_KEY` in `.env.local`, then:

```bash
npm install
npm run dev
```

Open http://localhost:3001

## Tests

```bash
npm test
```


## Medical glossary coverage

A ◆ next to a dialogue language means that the voice session receives a medical terminology reference for that language. Covered languages: Russian, English, Spanish, French, Arabic, Hindi, Portuguese, Indonesian, Malay, Turkish and Chinese.

The reference contains 331 entries in each of the 11 languages (3,641 language equivalents), covering existing concepts plus symptoms, anatomy, diagnoses, examinations, laboratory tests, medicines and care. Only the selected-language terms are sent to the voice model. The full original 73-concept fidelity dictionary retains its stems and aliases and adds translated equivalents from this reference. New reference-only concepts do not automatically become heuristic warnings.

New translations were prepared with AI assistance and have not been independently clinically reviewed. The vocabulary is not comprehensive or certified. The ◆ mark identifies reference availability, not translation quality. Ambiguous MS and CP remain unexpanded. Existing drug identity, dose, negation and uncertainty rules remain in force.

`node --env-file=.env.local scripts/expand-medical-glossary.cjs` is an optional network maintenance utility for regenerating the reference. It sends only the generic term seeds, never patient records. Generation uses the configured API key and may incur API charges. `scripts/.glossary-cache/` is ignored by Git. Inspect changes and run tests before publishing regenerated data.

## English terminology

English pairs additionally receive 178 recognition variants for 106 concepts, covering UK/US spelling, established generic medicine names, common clinical abbreviations and patient wording. `english-reference.ts` also supplies explicit rules against upgrading symptoms into diagnoses or confusing drug strength, units, timing and uncertainty. Variants for existing checker concepts are included in the fidelity checks; new reference-only concepts retain the previous review boundary.

Reference reading for the English pass: [NHS heart attack](https://www.nhs.uk/conditions/heart-attack/), [NHS paracetamol](https://www.nhs.uk/medicines/paracetamol-for-adults/), and [MedlinePlus edema](https://www.medlineplus.gov/edema.html). These sources support selected terminology examples, not independent validation of the entire multilingual dictionary. Context-dependent patient wording is a recognition hint, not an unconditional diagnostic equivalence.
