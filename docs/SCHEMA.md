# Content and save schema: frozen at v1 for the opening

Later content and gameplay lanes build on this. `scripts/validate-content.mjs` enforces it. Everything below is real, checked in `data/`, and loaded only through `src/content.js`. All arrays, all stable ids.

## Differences from the plan's draft

| Change | Why |
|---|---|
| New file `data/attestations.json` | Source tokens are checked in, so the validator can prove every Hebrew form against OSHB without the research corpus. |
| `word.consonants`, `word.rootNote` | Letter tasks need a checked letters-only spelling. A listed root must say how it was checked. |
| `relatedForm.gloss`, `relatedForm.tokenId`; `example.tokenId` | Ties each form to its exact source token. |
| `question.compare` (`consonants`, `gloss` or `pointed`) | Names the comparison per task, so nothing strips pointing by accident. |
| `question.tokenId` | Lets non-vocabulary Hebrew be checked against the source. |
| `question.format` adds `door`; `match` is not implemented | `door` answers with a physical door in the world. `match` waits until a task needs it. |
| `lesson.mentor`, `lesson.chart` (`alphabet`, `finals` or null); `workedExample.tokenId`, `reference` | Names who teaches it, the chart it shows, and its source. |
| `region.seedWordId`, `badge.requiresCaptures`; `puzzleQuestionIds` is keyed by group | First safe encounter, a real capture gate, and separate puzzle pools. |
| `quest.stage.kind` adds `exit`; `targetIds` holds flag names for `puzzle` and `exit` | Stages read actual game state. |
| `passage.display`, `passage.translation` | Keeps immutable `sourceText` apart from reading display. |
| Top-level `transliteration` on words only | Shown on cards. Never shown before an answer. |

## Records

**word**: `id` (`H0001` style), `strongId`, `hebrew` (pointed citation, display string), `consonants`, `transliteration`, `gloss`, `meanings[]`, `pos`, `root` (null, or letters only with `rootNote`), `features{gender,number,state,...}`, `relatedForms[{hebrew,relationship: inflection|derivation|separate-lexeme,features,gloss,reference,tokenId,sourceId}]`, `example{hebrew,translation,reference,tokenId,sourceId,original}`, `regionIds[]`, `requires[]`, `sourceIds[]`, `notes?`.

**question**: `id`, `wordId|null`, `regionId`, `command` (read, understand, analyze, build, inscribe), `taskFamily`, `semanticStemId` (globally unique), `templateId`, `contextId`, `requires[]`, `sourceIds[]`, `tokenId?`, `format` (choice, door, type, tokens), `prompt`, `displayHebrew?`, `choices[{id,text,lang?}]`, `acceptedAnswers[]` (choice ids, or strings for `type`), `compare?`, `recognitionChoices[]` and `recognitionAccepted[]` (required for `type`), `tokenOptions[]`, `acceptedSequences[[id]]` (logical reading order), `explanation`, `hint`.

Word questions need a template with a key rule in the validator: `tpl-first-letter`, `tpl-last-letter`, `tpl-final-partner`, `tpl-gloss-choice`, `tpl-context-choice`, `tpl-gloss-type`, `tpl-inscribe-type`, `tpl-inscribe-mirror`. A new template needs a new rule, or the validator fails.

Capture families are `read-letter`, `understand-meaning` and `inscribe-spelling`. Each word needs at least two stems per family, so a miss always has a fresh retry, and at least six questions.

**lesson**: `id`, `regionId`, `title`, `mentor`, `requires[]`, `teaches[]`, `chart`, `explanation`, `workedExamples[{hebrew,translation,tokenId,reference,note}]`, `guidedQuestionIds[]`. Lessons are listed in teaching order. Guided answers are never scored.

**region**: `id`, `order`, `title`, `theme`, `rossChapters[]`, `alignment`, `requiresBadges[]`, `lessonIds[]`, `wordIds[]`, `seedWordId`, `questId`, `badge{id,title,questionIds[],requiredCorrect,requiredTaskFamilies[],requiresSkills[],requiresCaptures}`, `puzzleQuestionIds{group:[id]}`. Badge items must have `wordId: null` and must not reuse a lesson or vocabulary token.

**quest**: `id`, `regionId`, `title`, `stages[{id,text,kind: lesson|capture|puzzle|duel|exit,targetIds[],requiredCount?}]`, `reward`, `sourceIds[]`.

**passage**: `id`, `reference`, `sourceId`, `sourceText` (immutable, with accents and segmentation), `display`, `translation`, `tokens[{id,hebrew,lemma,morph,gloss}]`, `notes`, `questionIds[]`, `requires[]`.

**attestation**: `tokenId`, `reference`, `surface` (OSHB string, unchanged), `lemma`, `morph`.

**source**: `id`, `title`, `url`, `license`, `scope`, `revision?`, `changes?`, `accessLimitations?`.

## Skills in use

`alphabet`, `rtl`, `word-meaning`, `final-forms`. Later ids from the plan (`vowels`, `shewa`, `article`, and so on) are added when a lesson teaches them. The validator rejects any `requires` that no lesson teaches.

## Save format

Storage keys: `alephQuest:v1:slot:{1,2,3}` and `alephQuest:v1:lastSlot`. A slot and an export file share one envelope: `{format: "alephQuest", version: 1, exportedAt, state}`, at most 512 KB. `src/storage.js` rebuilds `state` field by field and rejects anything else, so its schema there is the normative one. The fields are `version, createdAt, updatedAt, map, x, y, dir, steps, rng, interactions, encounterCounter, reedCooldown, skills, lessons, flags, words, party, badges, settings{sound,calm,responseMode}, encounter, badgeRun, retiredCheckpoints, puzzleIndex`.

Consistency is also checked: the party is unique, at most 6, and captured. Captured words have a `dueAt`, a study record and their required skills. `captureSteps` hold unique families, templates and stems that match real questions of that word, and they cover all three capture families exactly when the word is captured. Review evidence matches real questions of its word. Skills trace to a finished lesson. Badges need their skills, captures, earlier badges, at least `requiredCorrect` of their own questions, and every `requiredTaskFamilies` entry. Flags agree with each other. The player stands on a walkable tile. An encounter's kind fits its word's capture status. A pending question matches its word, stem, family and taught skills, and only `type` questions can be pending in typing mode. A badge run credits each question once, its pending question isn't one it has already credited, and an open run's credited answers can't already meet both `requiredCorrect` and every `requiredTaskFamilies` entry, since the award closes the run at that point.

Timestamps are integer Unix milliseconds. Review days are UTC day numbers, `floor(at / 86400000)`.
