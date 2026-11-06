# Content and save schema

Content and gameplay lanes both build on this. `scripts/validate-content.mjs` enforces it. Everything below is real, checked in `data/`, and loaded only through `src/content.js`. All arrays, all stable ids. The opening's v1 shapes are all preserved. Additions are marked **(campaign)**.

## Differences from the plan's draft

| Change | Why |
|---|---|
| New file `data/attestations.json` | Source tokens are checked in, so the validator can prove every Hebrew form against OSHB without the research corpus. |
| `word.consonants`, `word.rootNote` | Letter tasks need a checked letters-only spelling. A listed root must say how it was checked. |
| `relatedForm.gloss`, `relatedForm.tokenId`; `example.tokenId` | Ties each form to its exact source token. |
| `question.compare` (`consonants`, `gloss` or `pointed`) | Names the comparison per task, so nothing strips pointing by accident. |
| `question.tokenId` | Lets non-vocabulary Hebrew be checked against the source. |
| `question.format` adds `door` and **(campaign)** `match` | `door` answers with a carved option. `match` is a real pairing board with its own checker. |
| **(campaign)** `question.key` | Word-level templates beyond the fixed list prove their answer against the word's own record. |
| `lesson.mentor`, `lesson.chart` (`alphabet`, `finals` or null); `workedExample.tokenId`, `reference` | Names who teaches it, the chart it shows, and its source. |
| `region.seedWordId`, `badge.requiresCaptures`; `puzzleQuestionIds` is keyed by group | First safe encounter, a real capture gate, and separate puzzle pools. |
| `quest.stage.kind` adds `exit` and **(campaign)** `reading`; `targetIds` holds action names for `puzzle`, `duel` and `exit` | Stages read actual game state. |
| `passage.display`, `passage.translation` | Keeps immutable `sourceText` apart from reading display. |
| Top-level `transliteration` on words only | Shown on cards. Never shown before an answer. |

## Records

**word**: `id` (`H0001` style), `strongId`, `hebrew` (pointed citation, display string), `consonants`, `transliteration`, `gloss`, `meanings[]`, `pos`, `root` (null, or letters only with `rootNote`), `features{gender,number,state,...}`, `relatedForms[{hebrew,relationship: inflection|derivation|separate-lexeme,features,gloss,reference,tokenId,sourceId}]`, `example{hebrew,translation,reference,tokenId,sourceId,original}`, `regionIds[]`, `requires[]`, `sourceIds[]`, `notes?`.

The first entry in `regionIds` must be the first region whose `wordIds` lists the word. `pos` decides a word's ability class: `verb` is a deed, anything containing `noun` or `name` is a name, and everything else is a link. Keep `verb` as its own word in the string, since `adverb` is not a verb.

**question**: `id`, `wordId|null`, `regionId`, `command` (read, understand, analyze, build, inscribe), `taskFamily`, `semanticStemId` (globally unique), `templateId`, `contextId`, `requires[]`, `sourceIds[]`, `tokenId?`, `format` (choice, door, type, tokens, match), `prompt`, `displayHebrew?`, `choices[{id,text,lang?}]`, `acceptedAnswers[]`, `compare?`, `recognitionChoices[]` and `recognitionAccepted[]` (required for `type`, optional for `match`), `tokenOptions[]`, `acceptedSequences[[id]]` (logical reading order), `pairs[{left,right}]`, `key?`, `explanation`, `hint`.

A choice with `lang: "he"` is entirely Hebrew and shows large. Any other choice or match label can mix English and Hebrew, and each Hebrew run in it gets its own right-to-left isolate at reading size.

`acceptedAnswers` holds choice ids for choice and door, and strings for `type`. For `match` it is optional and holds extra curated assignments, see below.

`requires` must be taught by the end of the question's own `regionId`, counting lessons in region order. "Some lesson somewhere teaches it" is not enough.

### Answer keys for word questions

These templates have a built-in rule against the word: `tpl-first-letter`, `tpl-last-letter`, `tpl-final-partner`, `tpl-gloss-choice`, `tpl-context-choice`, `tpl-gloss-type`, `tpl-inscribe-type`, `tpl-inscribe-mirror`, `tpl-read-sound`, `tpl-read-pointed`.

- `tpl-read-sound` is a `choice` showing the word's own pointed form in `displayHebrew`, and its answer is exactly `word.transliteration`.
- `tpl-read-pointed` is a `choice` whose answer is the word's pointed form. Every option has the word's letters, and no two options have the same pointing once compared as keys, so only the pointing can tell them apart.
- `tpl-context-choice` answers must be a listed sense or "one or the other" of those, or carry contextual evidence (below). Listed senses are the gloss, each meaning, the head of a qualified meaning ("wife, in some contexts" gives "wife"), and each item of a list of single words ("who, which, that"). Containing a sense as a substring isn't enough.

**(campaign)** Any other template on a word question needs `key`, or the validator fails with `no answer-key rule`. `key` is checked as follows, and an undocumented field is an error so nothing goes unchecked silently:

| Field | Required | Must match |
|---|---|---|
| `answer` | on word questions, and on word-free ones without `tokenId` and `morph` | The text the question accepts: the accepted choice's text, an accepted typed answer, or an accepted token sequence joined in reading order. NFC. |
| `tokenId` | no | A real attestation. If the question names its own `tokenId` or `tokenIds`, it must be one of them. On a word question its lemma must be that word's Strong number. |
| `morph` | no, and needs `tokenId` | The start of a morphology segment in that token, without the leading `H`: `Td/Nc` fits `HTd/Ncmpa`, and `cmpa` doesn't. |
| `sense` | no, word questions only | A listed sense of the word. |
| `form` | no | The word's citation form or one of its `relatedForms`, compared pointed. |
| `features` | no | Each entry matches `word.features` or the named form's `features`. |
| `relationship` | no | A known relationship, and the named form's own if `form` is given. |

So a word-free task may carry `key{tokenId, morph}` as source proof alone. That shows what the cited token is. It doesn't show the task's answer is right.

**Contextual evidence.** A `tpl-context-choice` answer that isn't a listed sense, such as "with you" or "my sister", must carry `key{answer, sense, tokenId, morph}`. Each part has to hold:

- `answer` is the accepted choice's text.
- `sense` is a listed sense, and it appears in the answer as whole words.
- `tokenId` is a real token of this word, and its surface appears in the prompt.
- `morph` fits that token.
- If the token has a pronominal suffix (`/Sp…`), the answer uses an English pronoun for that person and number: 1s my, me, mine, I; 1p our, us, we; 2 you, your; 3ms his, him, he, it, its; 3fs her, hers, she, it, its; 3p their, them, they.

For example, for Strong 854 in Genesis 6:18 the key is `{"answer":"with you","sense":"with","tokenId":"…","morph":"R/Sp2…"}`.

A key is checked for consistency with the record. It does not prove the linguistics, and the independent content audit still has to do that.

**`question.tokenIds`** names a phrase's tokens, instead of `tokenId`. They must be real, from one verse, and spell `displayHebrew` when it is present, ignoring spaces and maqqef. Other optional fields such as `span`, `homographOf`, `citationNote`, `indeclinable` and `noOtherForm` aren't read by the game or this validator.

### Formats

`match`: `pairs` has at least two rows with unique `left` sides and at least two distinct `right` sides. A right side may repeat, which is how classification works. Rows are graded by which right side each left receives, compared as text. `acceptedAnswers`, if present, is a list of alternative assignments, each one a list of right-side strings in row order. `recognitionChoices` with `recognitionAccepted` adds a choice list for players who set written answers to choices.

Pointed `type` answers must hold Hebrew with its points. Consonant answers must be Hebrew letters.

### Capture

Capture families are `read-letter`, `understand-meaning` and `inscribe-spelling`. Each word needs at least two stems per family, both answerable on the skills its home region teaches, so a miss always has a fresh retry, and at least six questions. `analyze` and `build` questions appear in encounters, reviews, puzzles and badges, and never fill a capture step. Commands `analyze` and `build` only appear on the menu once a question of that command is answerable.

**lesson**: `id`, `regionId`, `title`, `mentor`, `requires[]`, `teaches[]`, `chart`, `explanation`, `workedExamples[{hebrew,translation,tokenId,reference,note}]`, `guidedQuestionIds[]`. Lessons are listed in teaching order. Guided answers are never scored. A guided question can need this lesson's own skills, since it follows the explanation and worked examples, but no later lesson's. Independent questions only count a skill once its lesson has finished.

**region**: `id`, `order`, `title`, `theme`, `rossChapters[]`, `alignment`, `requiresBadges[]`, `lessonIds[]`, `wordIds[]`, `seedWordId`, `questId`, `badge{id,title,questionIds[],requiredCorrect,requiredTaskFamilies[],requiresSkills[],requiresCaptures}`, `puzzleQuestionIds{group:[id]}`. Badge items must have `wordId: null` and must not reuse a lesson or vocabulary token. `region.title` names the place on screen. `requiresCaptures` counts only words in this region's `wordIds`.

`puzzleQuestionIds` must have `neri` (the rival's pool) and `gate`. Where the quest reaches them, at least 3 and 2 items respectively must be answerable, and at least one more than the action needs. Any other group name is optional and plays at the region's shrine, one at a time. `rival`, `exit`, `ward` and `secret` are reserved.

**quest**: `id`, `regionId`, `title`, `stages[{id,text,kind: lesson|capture|puzzle|duel|reading|exit,targetIds[],requiredCount?}]`, `reward`, `sourceIds[]`. The last stage must be the region's exit.

| Kind | `targetIds` | Done when |
|---|---|---|
| `lesson` | this region's lesson ids | all finished |
| `capture` | word ids from this region, or empty for any of its words | `requiredCount` of them captured |
| `puzzle`, `duel` | r1: `neriCleared`, `gateOpen`, or the badge id. Later: `rN:rival`, `rN:gate`, `rN:<optional group>`, or the badge id | all done |
| `reading` | passage ids | each read and answered |
| `exit` | r1: `exitOpened`. Later: `rN:exit` | the player has opened the way out with the badge |

Stage order is enforced everywhere, including at import. A mentor won't teach a staged lesson, and a rival, lock, reading stand, badge keeper or region exit won't open, until every earlier stage is done. The ending needs every quest finished. One lesson stage can hold several lessons that build on each other, in any listed order, as the mentor offers whichever is ready. A loop among them, or a skill only a later stage teaches, is a validator error.

**passage**: `id`, `reference`, `sourceId`, `sourceText` (immutable, with accents and segmentation), `display`, `translation`, `tokens[{id,hebrew,lemma,morph,gloss}]`, `notes`, `questionIds[]`, `requires[]`. A passage named by a `reading` stage plays at the region's reading stand. The translation stays hidden until its questions are answered. It needs correct answers to `min(2, questionIds.length)` questions, and at least one spare, unless `questionIds` is empty.

**attestation**: `tokenId`, `reference`, `surface` (OSHB string, unchanged), `lemma`, `morph`.

**source**: `id`, `title`, `url`, `license`, `scope`, `revision?`, `changes?`, `accessLimitations?`.

## Region world

Maps, NPCs and palettes are gameplay data in `src/world.js`, so no content id appears there. `REGION_MAPS` names each region's outdoor map, mentor's house, badge hall and cave. Each later region has a mentor, badge keeper, Neri, a language lock, a reading stand, a shrine, a sign, a townsperson, a seal (ward) and a hidden cache. The mentor's on-screen name comes from `lesson.mentor`.

Seals are optional. Each asks for a party word with knowledge rank 2 or higher of a set ability class: name in r2 to r5, deed in r6 to r8. The validator checks such a word is available by then.

## Validator phases

`--opening` applies every structural rule plus an 8 to 10 word floor on the first region. With no flag it also applies the campaign floor: at least 150 words, at least 600 questions, exactly `r1`..`r8` in order. Lexemes must be distinct by `strongId` and `consonants`. Reachability rules apply in both phases. The full phase is expected to fail until real content lands.

## Skills in use

`alphabet`, `rtl`, `word-meaning`, `final-forms`. Later ids from the plan (`vowels`, `shewa`, `article`, and so on) are added when a lesson teaches them. The validator rejects any `requires` that no lesson teaches. `word-meaning` is taught by the first word card, so it does not block a word from being offered.

## Save format

Storage keys: `alephQuest:v1:slot:{1,2,3}` and `alephQuest:v1:lastSlot`. The key names did not change with the save version. A slot and an export file share one envelope: `{format: "alephQuest", version: 2, exportedAt, state}`, at most 2 MB. `src/storage.js` rebuilds `state` field by field and rejects anything else, so its schema there is the normative one. The fields are `version, createdAt, updatedAt, map, x, y, dir, steps, rng, interactions, encounterCounter, reedCooldown, skills, lessons, flags, words, party, badges, settings{sound,calm,responseMode,sacredName}, encounter, badgeRun, retiredCheckpoints, puzzleIndex, gates, gateCredit, attempt, endingAt`.

### Version 2, and reading version 1

The envelope `version` and `state.version` must agree. A version 1 file is the accepted opening's format, and it loads through an explicit migration in `parseImport`: new fields start empty, `sacredName` starts as `written`, and every word record gains empty `xpStems`, `formsKnown` and `formRetired`. The migrated state then passes the same validation as any other. A version 1 document holding version 2 fields is refused. Loading writes nothing, and a slot becomes version 2 at its next autosave. An older build reads a version 2 slot as unreadable and leaves it untouched. Real opening exports are kept as test fixtures.

### New state

| Field | Shape | Meaning |
|---|---|---|
| `gates` | `{key: {at, questionIds[], wordId?}}` | Finished later-region actions. r1 keeps its flags. |
| `gateCredit` | `{key: [questionId]}` | Answers earned toward an unfinished action. |
| `attempt` | `null` or `{key, questionId, hintsUsed, startedAt, responseMode, wordId?, stemId?}` | The one pending gate, duel, reading or seal question, with its hints. |
| `endingAt` | `null` or time | The archive has been restored. |
| `words[id].xpStems` | stem ids | Stems that have earned party XP. Each pays once, so XP comes from varied use. |
| `words[id].formsKnown`, `formRetired` | token ids, `{tokenId: interactions}` | Related forms traced correctly, and missed ones waiting to return. |
| `words[id].lookedUpAt` | optional time | When this word's Worddex entry was last read. See below. |

### Worddex lookups and assistance

The Worddex can give an answer away, so a lookup is treated as help, the same as a hint or reopening a word card:

- Reading a studied word's entry sets `lookedUpAt` on that word and on every word its Same root panel shows, since the panel prints their meanings. The next question about such a word, in a capture, review, practice or seal, starts assisted and clears it. The field is on the record, so retreat, reload and mode switches don't remove it. After 20 hours (`MIN_REVIEW_GAP`) it counts as memory and is dropped unused.
- Opening the Worddex with a question pending in a duel, lock, reading, seal, trial or encounter marks that question as helped, and the screen says so. The player can leave and resume it, and the answer earns nothing.
- The list and its search give a meaning only for a word that is captured and not due, so neither can answer a capture or review. The entry itself is still available as real study. A seal's word list names words in Hebrew only.
- Helped answers earn no capture step, review evidence, XP, gate credit or badge credit. The stem retires and a fresh question follows.

Keys are `rN:rival`, `rN:gate`, `rN:exit`, `rN:ward`, `rN:secret`, `rN:<optional group>` and `read:<passageId>`. Raw flags for these are not accepted, and only verified records count.

`responseMode` is `typing` or `recognition`. A `match` board uses `typing` for pairing, and `recognition` only when it has a choice list.

### Consistency

The party is unique, at most 6, and captured. Captured words have a `dueAt`, a study record and their required skills. `captureSteps` hold unique families, templates and stems that match real questions of that word, and they cover all three capture families exactly when the word is captured. Review evidence and `xpStems` match real questions of their word. Skills trace to a finished lesson. Badges need their skills, captures from their own region, earlier badges, every quest stage before them, at least `requiredCorrect` distinct questions of their own, no repeats, and every `requiredTaskFamilies` entry. Flags agree with each other, and r1's `exitOpened` needs the stages before it. The player stands on a walkable tile, in a region whose badges are earned and past the open exit of the region before it. The garden needs the ending, and the archive needs the last exit.

An encounter's kind fits its word's capture status, and a capture encounter's word must be offerable. A pending question matches its word, stem, family and taught skills. `typing` is only for `type` and `match`.

An open badge run must be qualified. Its region is unlocked, its badge is unearned, its prerequisites and earlier quest stages are met, its questions are taught, each question is credited once, its pending question isn't credited, and its credited answers can't already meet both `requiredCorrect` and every `requiredTaskFamilies` entry. Every real save satisfies these, since a run can only open once they hold and they stay true.

A `gates` record must have been possible: its region is open, every earlier quest stage is done, it holds enough distinct answers from the right pool with taught skills, a gate comes after its rival, an exit has its badge and every earlier stage, and a secret has its ward. A ward record names a captured word of the seal's class and one real question about that word. `gateCredit` must fall short of finishing, pass the same readiness check that opens the action, and credit only distinct taught questions from its pool. A pending `attempt` must pass that readiness check too. `endingAt` needs all eight badges, the last exit and every quest finished.

These rules hold for all real saves, since each action could only happen once they were true and they stay true. An unfinished reading before a badge is a normal save, with or without partial credit or a hinted question pending.

### Writing

`saveSlot` validates the state before writing, and returns `invalid` or `too-large` without touching the slot if the game itself could not read the result back. Storage failure returns `write-failed` or `unavailable`. An unreadable slot is never overwritten without confirmation. Timestamps are integer Unix milliseconds. Review days are UTC day numbers, `floor(at / 86400000)`.
