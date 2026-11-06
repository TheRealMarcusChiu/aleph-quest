# Content review ledger

This is a source-based self-review by the content lane. It isn't a qualified Biblical Hebrew reviewer's approval, and it isn't independent. `tests/content/` proves the mechanical claims below against the pinned XML; a person still has to judge the teaching and the sense glosses.

## Per-question and per-word ledger

`docs/CONTENT-REVIEW-ledger/` holds one hand-written row for every question (`q-*.jsonl`) and every word (`w-*.jsonl`). No script generated these rows.

| Question row field | Meaning |
|---|---|
| `id` | Stable question id |
| `prov` | `citation` (the word card, checked in its word row), `span` (the question's source tokens), `attested` (a form or verse in the corpus, with no token on the question) or `original` (constructed for the game) |
| `inlineOriginal` | Hebrew in the prompt that isn't from the corpus, such as a bare root or an illustrative form |
| `tests` | The skills the item really tests |
| `ans` | Why the answer is right |
| `rej` | Why each distractor or spare tile is wrong, by its option id |

A word row quotes Strong (`strong`), justifies the gloss (`gloss`), gives each related form's token morphology (`forms`), and records any stress disagreement (`stressNote`).

**What `tests/content/ledger.test.mjs` proves:** every question has one row, with no leftovers. Every distractor has its own rejection. Tested skills are reachable from `requires`. Stated token spans, inline Hebrew and cited verses hold against the pinned XML. Each Strong quote really is in that entry. Related-form morphology and features match their tokens. `docs/CONTENT-REVIEW-ledger/pinned.json` fixes a digest per region, so changing an option, key, prompt or requirement fails until the rows are rechecked and the digest is updated.

**What it can't prove:** that a rationale is true. The rationale text is my judgement from reading the options against OSHB, Strong and the verse. Paraphrases of verses in prompts are checked only to the extent that the verse holds the word's lemma; I wrote them from knowledge of the text and read specific verses where unsure, not every verse.

## Sound and stress convention

The guide is a modern classroom reading, not a claim about ancient speech. `scripts/content-sound.mjs` states it as code: alef and ayin silent, tet t, qof q, het and soft kaf kh, tsade ts, soft bet v, soft pe f, soft gimel, dalet and tav unchanged, and final vowel letters silent. The test derives a pattern from each word's pointing, so a guide is checked against the pointing and not against itself.

Stress is checked against Strong's `pron` mark, comparing only final against earlier, since Strong's syllable counts differ. Two words differ and each row says why: H1961 (Strong marks no stress) and H2822 (Strong marks the last syllable; the accented Genesis tokens carry the mark on the first). The convention can't distinguish vocal from silent shewa or qamats from qamats qatan, so those cases rest on the rows.

## For the shared-validator owner

Nothing below is implemented in this branch. These are the data's semantics, for `scripts/validate-content.mjs` and its tests:

- **`tpl-read-sound` and `tpl-read-pointed`:** `keyRules` in `scripts/content-rules.mjs` states both rules. The sound rule compares with the card's transliteration; `soundPattern` in `scripts/content-sound.mjs` is the independent check. Mutation cases are in `tests/content/ledger.test.mjs`.
- **`question.key{tokenId,morph}`:** kept as is. `morph` is a substring of that token's OSHB code. It proves the parse behind the item, not the answer text. The current gameplay validator reports `key.morph` as undocumented and wants `key.answer`; the data doesn't carry `key.answer`, because the answer is already `acceptedAnswers`.
- **`question.contextKey{tokenId,form,morph,answer,basis}`:** nine context questions have an accepted answer that is inflected or contextual, such as "with you" or "my sister". `answer` must equal the accepted option, `form` must be that token and appear in the prompt, and the token's lemma must be the word's. The rule for this is in `tests/content/repair.test.mjs`. It replaces substring matching instead of restoring it.
- **Reading prerequisites:** `readingDemands` in `scripts/content-rules.mjs` names the rules a pointed form needs. `-sound` and `-pointed` questions now require them, so a word with a shewa or dagesh isn't capturable after the first vowel lesson. Seed words stay capturable. `wordCapturable` already handles this, since it checks each family's `requires`.
- **Guided practice:** these items need their own lesson's skill, on purpose. The worked example comes first, so the validator should allow it for that lesson only.
- **Reading headroom:** each Genesis passage has four questions against a `gateRequired` of two.

## What each row claims

Every row was read against `Bereshit.xml` and `HebrewStrong.xml`. For the example token: reference, lemma attribute and morphology match upstream byte for byte (`tests/content/source.test.mjs`). The headword matches Strong by comparison key, unless the row's Note says otherwise. Every row has six capture questions: two read, two understand and two inscribe. Root status is `listed` (Strong calls it a primitive root or names a verb, and `rootNote` says so) or `null`.

## Integration dependencies on the gameplay lane

Nothing below is implemented in this branch, and this lane doesn't own that code.

| Needed | Where | Why it blocks |
|---|---|---|
| Key rules for `tpl-read-sound` and `tpl-read-pointed` | `scripts/validate-content.mjs` | 280 `no answer-key rule` errors, the only full-validator errors. `scripts/content-rules.mjs` exports `keyRules` to import. |
| Drop the opening word cap | `scripts/validate-content.mjs` and `tests/validator.test.mjs` | `validate:opening` fails on 150 words, by design of the old phase. |
| Update tests that pin opening counts | existing tests, see the commit report | They assume r1-only data. |
| `reading` quest stage kind | `src/engine.js` `stageDone` | It returns false for unknown kinds, so `r8-reading` would never complete. The plan lists this kind. Target ids are passage ids. |
| `rN:rival`, `rN:gate`, `rN:exit` flags, plus puzzle pools `practice` and `reading` | gameplay | The pools hold real questions, but nothing presents them yet. |
| Capture stages scoped to `targetIds`; `requiresCaptures` scoped to the region | `src/engine.js` | `capturedCount` is global, so later stages would pass too early. |
| Command `analyze` and `build` in badge and puzzle UI | gameplay | r2 to r8 pools use them. |
| Optional fields can be ignored | `tokenIds`, `key`, `span`, `homographOf`, `citationNote`, `indeclinable`, `noOtherForm` | They carry source proof for tests. They add no required behavior, but strict readers must tolerate them. |

No `match` format was authored, so nothing depends on it.

## Format additions

- `question.tokenIds[]`: the contiguous source tokens behind a phrase, in verse order. Use it or `tokenId`, not both.
- `question.key{tokenId,morph}`: asserts a substring of that token's OSHB morphology. It is source proof, not proof the task is well taught.
- `passage.span`: `"verse"` means `sourceText` is the entire verse.
- `word.homographOf`, `word.citationNote`, `word.indeclinable`, `word.noOtherForm`: see the tests and this ledger.

## Citation decisions that differ from Strong's headword

| Word | Taught | Strong | Why |
|---|---|---|---|
| Strong 3915 | לַיְלָה | לַיִל | Strong lists both, and Genesis uses the longer form. Gen 1:5 is pausal לָיְלָה. |
| Strong 413 | אֶל | אֵל | Strong's note says only the shortened form is used. This keeps it apart from H410 god. |
| Strong 8141 | שָׁנָה | שָׁנֶה | Genesis tokens are שָׁנָה and שָׁנִים. |

## Known soft spots

- OSHB tags מִמֶּנּוּ (Gen 2:17) as first person plural, though "from it" is the sense. The token is kept as tagged, and H4480's note and `b-r5-prep-3`'s explanation say so.
- OSHB tags אִתָּךְ (Gen 6:18) as 2fs. It is a pausal form addressed to Noah. The test keeps the tag, and the question only asks which preposition it is.
- H7812 שָׁחָה: Strong's root and the Hishtaphel analysis under חוה disagree. The rootNote flags this.
- H7451 and H2416: Strong has one number for adjective and noun, while OSHB splits them. The noun forms are listed as derivations.
- H1419, H7969 and H2472 appear in Genesis in shorter spellings than the taught full ones. Their cards and prompts say so.
- Pual forms of לקח (`b-r7-stem-1`, `b-r7-parse-2`): some grammars call these Qal passives. The explanation names both.
- Sound guides are a modern classroom convention. Stress marks were assigned by hand and then cross-checked as described above. No qualified reviewer has checked them.

## Per-word ledger

| Word | Strong | Region | Example ref | Token | Lemma | Morph | Root | Note |
|---|---|---|---|---|---|---|---|---|
| H0001 | H1 | r1 | Gen.44.19 | 01tVx | 1 | HNcmsa | null | baseline |
| H0251 | H251 | r1 | Gen.44.19 | 01Z7W | 251 | HNcmsa | null | baseline |
| H0376 | H376 | r1 | Gen.2.24 | 01T85 | 376 | HNcmsa | null | baseline |
| H0517 | H517 | r1 | Gen.3.20 | 01KvW | 517 | HNcfsc | null | baseline |
| H0776 | H776 | r1 | Gen.1.10 | 01Wxx | 776 | HNcbsa | null | baseline |
| H0802 | H802 | r1 | Gen.2.23 | 01FCo | 802 | HNcfsa | null | baseline |
| H1121 | H1121 | r1 | Gen.4.25 | 01zjv | 1121 a | HNcmsa | null | baseline |
| H1323 | H1323 | r1 | Gen.24.24 | 01DQR | 1323 | HNcfsc | null | baseline |
| H4428 | H4428 | r1 | Gen.14.18 | 01rbd | 4428 | HNcmsc | listed | baseline |
| H5612 | H5612 | r1 | Gen.5.1 | 018jj | 5612 a | HNcmsc | listed | baseline |
| H0216 | H216 | r2 | Gen.1.3 | 01jbg | 216 | HNcbsa | null | seed |
| H3117 | H3117 | r2 | Gen.1.5 | 013TS | 3117 | HNcmsa | null | |
| H3915 | H3915 | r2 | Gen.1.5 | 01sMn | 3915 | HNcmsa | null | citation differs |
| H1242 | H1242 | r2 | Gen.1.5 | 01kA7 | 1242 | HNcmsa | null | no dagesh in verse |
| H4325 | H4325 | r2 | Gen.1.2 | 01TZE | d/4325 | HTd/Ncmpa | null | plural in form |
| H8064 | H8064 | r2 | Gen.1.1 | 01TSc | d/8064 | HTd/Ncmpa | null | plural in form |
| H2022 | H2022 | r2 | Gen.7.19 | 01etw | d/2022 | HTd/Ncmpa | null | |
| H5892 | H5892 | r2 | Gen.4.17 | 01D9B | 5892 b | HNcfsa | null | Strong m., OSHB f. |
| H1004 | H1004 | r2 | Gen.6.14 | 01uQX | m/1004 b | HR/Ncmsa | null | Strong only "probably" |
| H6086 | H6086 | r2 | Gen.1.12 | 01fLi | c/6086 | HC/Ncmsa | null | |
| H7218 | H7218 | r2 | Gen.3.15 | 01duZ | 7218 a | HNcmsa | null | |
| H3027 | H3027 | r2 | Gen.3.22 | 01m2e | 3027 | HNcbsc/Sp3ms | null | suffix hidden from r2 tasks |
| H5869 | H5869 | r2 | Gen.3.7 | 01XFF | 5869 a | HNcbdc | null | also "spring" |
| H1870 | H1870 | r2 | Gen.3.24 | 01fSj | 1870 | HNcbsc | null | |
| H7704 | H7704 | r2 | Gen.2.5 | 01GmF | d/7704 b | HTd/Ncmsa | null | sin |
| H1697 | H1697 | r2 | Gen.11.1 | 0142S | c/1697 | HC/Ncmpa | listed | H1696 |
| H3605 | H3605 | r2 | Gen.1.21 | 01ZPN | 3605 | HNcmsc | null | qamats qatan |
| H3808 | H3808 | r2 | Gen.2.5 | 01brh | 3808 | HTn | null | indeclinable |
| H6963 | H6963 | r2 | Gen.3.8 | 011go | 6963 a | HNcmsc | null | |
| H2233 | H2233 | r2 | Gen.1.11 | 01VA9 | 2233 | HNcmsa | listed | H2232 |
| H5650 | H5650 | r3 | Gen.9.25 | 01N1Q | 5650 | HNcmsc | null | seed; separate from H5647 |
| H5921 | H5921 | r3 | Gen.1.2 | 01qNN | 5921 a | HR | null | |
| H0413 | H413 | r3 | Gen.1.9 | 01tRR | 413 | HR | null | citation differs |
| H4480 | H4480 | r3 | Gen.2.7 | 01CFo | 4480 a | HR | null | |
| H0996 | H996 | r3 | Gen.1.4 | 01CsU | 996 | HR | null | |
| H2896 | H2896 | r3 | Gen.1.10 | 01nRZ | 2896 a | HAamsa | null | |
| H7451 | H7451 | r3 | Gen.2.9 | 015ED | c/7451 b | HC/Aamsa | null | noun as derivation |
| H1419 | H1419 | r3 | Gen.1.16 | 01hxo | d/1419 a | HTd/Aamsa | null | defective in verse |
| H6996 | H6996 | r3 | Gen.1.16 | 01dSQ | d/6996 b | HTd/Aamsa | null | |
| H2416 | H2416 | r3 | Gen.1.20 | 01ecS | 2416 a | HAafsa | null | noun as derivation |
| H5775 | H5775 | r3 | Gen.1.21 | 01q1G | 5775 | HNcmsa | null | |
| H0929 | H929 | r3 | Gen.1.24 | 01ou4 | 929 | HNcfsa | null | |
| H1320 | H1320 | r3 | Gen.2.21 | 01nRw | 1320 | HNcmsa | null | |
| H3899 | H3899 | r3 | Gen.3.19 | 012Ss | 3899 | HNcbsa | null | |
| H3701 | H3701 | r3 | Gen.17.12 | 013BN | 3701 | HNcmsa | null | |
| H6629 | H6629 | r3 | Gen.4.2 | 01HQC | 6629 | HNcbsa | null | |
| H5288 | H5288 | r3 | Gen.18.7 | 01ixu | d/5288 | HTd/Ncmsa | null | |
| H5971 | H5971 | r3 | Gen.11.6 | 01WQT | 5971 a | HNcmsa | null | not עִם |
| H4725 | H4725 | r3 | Gen.1.9 | 01Q7E | 4725 | HNcmsa | null | |
| H0120 | H120 | r3 | Gen.1.26 | 01gPX | 120 | HNcmsa | null | |
| H0127 | H127 | r3 | Gen.2.7 | 015Ja | d/127 | HTd/Ncfsa | null | |
| H0430 | H430 | r3 | Gen.1.1 | 01TyA | 430 | HNcmpa | null | plural in form |
| H8085 | H8085 | r4 | Gen.16.11 | 01GmR | 8085 | HVqp3ms | listed | seed |
| H0559 | H559 | r4 | Gen.3.1 | 016Tj | 559 | HVqp3ms | listed | |
| H7971 | H7971 | r4 | Gen.42.4 | 01wkv | 7971 | HVqp3ms | listed | |
| H3947 | H3947 | r4 | Gen.2.22 | 01cgg | 3947 | HVqp3ms | listed | |
| H0398 | H398 | r4 | Gen.14.24 | 01nzk | 398 | HVqp3cp | listed | no 3ms perfect found |
| H7901 | H7901 | r4 | Gen.26.10 | 01sDb | 7901 | HVqp3ms | listed | |
| H5647 | H5647 | r4 | Gen.2.5 | 01idy | l/5647 | HR/Vqc | listed | example is an infinitive |
| H5674 | H5674 | r4 | Gen.15.17 | 01bfb | 5674 a | HVqp3ms | listed | |
| H6912 | H6912 | r4 | Gen.23.19 | 01dPE | 6912 | HVqp3ms | listed | |
| H1980 | H1980 | r4 | Gen.26.26 | 01nVC | 1980 | HVqp3ms | listed | akin to H3212 |
| H3045 | H3045 | r4 | Gen.4.1 | 01Nkc | 3045 | HVqp3ms | listed | |
| H0589 | H589 | r4 | Gen.6.17 | 01T4t | c/589 | HC/Pp1cs | null | |
| H0595 | H595 | r4 | Gen.3.10 | 01GFP | 595 | HPp1cs | null | |
| H0859 | H859 | r4 | Gen.3.11 | 01SMW | 859 a | HPp2ms | null | pausal in verse |
| H1931 | H1931 | r4 | Gen.2.11 | 01ELV | 1931 | HPp3ms | null | |
| H1992 | H1992 | r4 | Gen.3.7 | 01pVx | 1992 | HPp3mp | null | |
| H2088 | H2088 | r4 | Gen.5.1 | 015Xt | 2088 | HPdxms | null | |
| H2063 | H2063 | r4 | Gen.2.23 | 01WMK | 2063 | HPdxfs | null | |
| H0428 | H428 | r4 | Gen.2.4 | 01idA | 428 | HPdxcp | null | |
| H0853 | H853 | r4 | Gen.1.1 | 01vuQ | 853 | HTo | null | homograph of H854 |
| H3588 | H3588 | r4 | Gen.1.4 | 01qCU | 3588 a | HC | null | |
| H6440 | H6440 | r4 | Gen.1.2 | 01EVS | 6440 | HNcbpc | null | plural in form |
| H8034 | H8034 | r4 | Gen.2.11 | 01EL8 | 8034 | HNcmsc | null | not שָׁם |
| H1285 | H1285 | r5 | Gen.9.13 | 01JcF | 1285 | HNcfsa | null | seed |
| H0854 | H854 | r5 | Gen.6.18 | 014Zw | 854 | HR/Sp2fs | null | homograph of H853 |
| H5973 | H5973 | r5 | Gen.21.10 | 011TR | 5973 a | HR | null | |
| H3426 | H3426 | r5 | Gen.18.24 | 01RLR | 3426 | HTm | null | |
| H0369 | H369 | r5 | Gen.2.5 | 01Pht | 369 | HTn | null | |
| H0834 | H834 | r5 | Gen.1.7 | 015Pr | 834 a | HTr | null | |
| H4672 | H4672 | r5 | Gen.2.20 | 01vAa | 4672 | HVqp3ms | listed | |
| H7121 | H7121 | r5 | Gen.1.5 | 01LeN | 7121 | HVqp3ms | listed | |
| H1254 | H1254 | r5 | Gen.1.1 | 01Nvk | 1254 a | HVqp3ms | listed | |
| H0269 | H269 | r5 | Gen.4.22 | 01Ssu | c/269 | HC/Ncfsc | null | |
| H0113 | H113 | r5 | Gen.18.12 | 01v6K | c/113 | HC/Ncmsc/Sp1cs | null | |
| H5315 | H5315 | r5 | Gen.1.20 | 01dSp | 5315 | HNcbsa | null | |
| H6310 | H6310 | r5 | Gen.4.11 | 01NH6 | 6310 | HNcmsc/Sp3fs | null | |
| H1571 | H1571 | r5 | Gen.3.6 | 01Bxn | 1571 | HTa | null | |
| H2009 | H2009 | r5 | Gen.1.29 | 01Ygn | 2009 | HTm | null | |
| H5750 | H5750 | r5 | Gen.4.25 | 0125j | 5750 | HD | null | |
| H3651 | H3651 | r5 | Gen.1.7 | 01n5f | 3651 c | HD | null | |
| H8104 | H8104 | r6 | Gen.17.9 | 01odJ | 8104 | HVqi2ms | listed | seed |
| H1961 | H1961 | r6 | Gen.1.2 | 01Qzf | 1961 | HVqp3fs | listed | |
| H3201 | H3201 | r6 | Gen.13.6 | 0196q | 3201 | HVqp3cp | listed | |
| H7291 | H7291 | r6 | Gen.14.14 | 01nXq | c/7291 | HC/Vqw3ms | listed | |
| H1431 | H1431 | r6 | Gen.21.8 | 01vz3 | c/1431 | HC/Vqw3ms | listed | |
| H4390 | H4390 | r6 | Gen.6.13 | 01xRq | 4390 | HVqp3fs | listed | |
| H3372 | H3372 | r6 | Gen.19.30 | 01GAD | 3372 | HVqp3ms | listed | |
| H0518 | H518 | r6 | Gen.4.7 | 01DK9 | 518 a | HC | null | |
| H4100 | H4100 | r6 | Gen.2.19 | 01CVM | 4100 | HTi | null | |
| H4310 | H4310 | r6 | Gen.3.11 | 01Cdg | 4310 | HTi | null | |
| H0408 | H408 | r6 | Gen.13.8 | 012zb | 408 | HTn | null | |
| H4994 | H4994 | r6 | Gen.12.11 | 01qtY | 4994 | HTe | null | |
| H8033 | H8033 | r6 | Gen.2.8 | 01x72 | 8033 | HD | null | |
| H3966 | H3966 | r6 | Gen.1.31 | 01dPK | 3966 | HD | null | |
| H0259 | H259 | r6 | Gen.1.9 | 01dv1 | 259 | HAcmsa | null | |
| H8147 | H8147 | r6 | Gen.1.16 | 01YHH | 8147 | HAcmdc | null | |
| H7969 | H7969 | r6 | Gen.5.22 | 01Lrp | 7969 | HAcfsa | null | defective in verse |
| H2568 | H2568 | r6 | Gen.5.6 | 01nnJ | 2568 | HAcfsa | null | |
| H7651 | H7651 | r6 | Gen.5.7 | 015VT | 7651 | HAcfsa | null | |
| H6235 | H6235 | r6 | Gen.5.14 | 01EBC | 6235 | HAcfsa | null | H6240 separate |
| H3967 | H3967 | r6 | Gen.5.3 | 01ZiN | c/3967 | HC/Acbsc | null | |
| H3206 | H3206 | r6 | Gen.4.23 | 01UeK | c/3206 | HC/Ncmsa | null | |
| H8141 | H8141 | r6 | Gen.5.3 | 01NAb | 8141 | HNcfsa | null | citation differs |
| H2472 | H2472 | r6 | Gen.20.3 | 01M8s | b/2472 | HR/Ncmsa | null | |
| H6213 | H6213 | r7 | Gen.1.7 | 01bmv | c/6213 a | HC/Vqw3ms | listed | seed |
| H1696 | H1696 | r7 | Gen.8.15 | 01ZXK | c/1696 | HC/Vpw3ms | listed | Strong's headword has no dagesh |
| H1288 | H1288 | r7 | Gen.1.22 | 01kDf | c/1288 | HC/Vpw3ms | listed | |
| H6680 | H6680 | r7 | Gen.2.16 | 01RFe | c/6680 | HC/Vpw3ms | listed | |
| H7812 | H7812 | r7 | Gen.18.2 | 01bdm | c/7812 | HC/Vtw3ms | listed | root disputed; flagged |
| H7650 | H7650 | r7 | Gen.21.31 | 01TR3 | 7650 | HVNp3cp | listed | |
| H0914 | H914 | r7 | Gen.1.4 | 01jQb | c/914 | HC/Vhw3ms | listed | |
| H7200 | H7200 | r7 | Gen.1.4 | 01USR | c/7200 | HC/Vqw3ms | listed | |
| H5927 | H5927 | r7 | Gen.2.6 | 018Js | 5927 | HVqi3ms | listed | |
| H2421 | H2421 | r7 | Gen.5.3 | 01Anx | c/2421 | HC/Vqw3ms | listed | |
| H7235 | H7235 | r7 | Gen.1.22 | 01DDb | c/7235 a | HC/Vqv2mp | listed | |
| H5414 | H5414 | r7 | Gen.1.17 | 01B6c | c/5414 | HC/Vqw3ms | listed | |
| H5375 | H5375 | r7 | Gen.4.13 | 01C5b | m/5375 | HR/Vqc | listed | |
| H3318 | H3318 | r7 | Gen.10.11 | 01T6a | 3318 | HVqp3ms | listed | |
| H3381 | H3381 | r7 | Gen.11.5 | 011w4 | c/3381 | HC/Vqw3ms | listed | |
| H3427 | H3427 | r7 | Gen.4.16 | 01AuA | c/3427 | HC/Vqw3ms | listed | |
| H3205 | H3205 | r7 | Gen.4.18 | 01ZPm | 3205 | HVqp3ms | listed | |
| H4191 | H4191 | r7 | Gen.2.17 | 01myi | 4191 | HVqa | listed | |
| H7725 | H7725 | r7 | Gen.18.33 | 01ExA | 7725 | HVqp3ms | listed | |
| H6965 | H6965 | r7 | Gen.4.8 | 01nk3 | c/6965 b | HC/Vqw3ms | listed | |
| H0935 | H935 | r7 | Gen.6.13 | 01Wuj | 935 | HVqp3ms | listed | |
| H7760 | H7760 | r7 | Gen.2.8 | 01irW | c/7760 a | HC/Vqw3ms | listed | |
| H5046 | H5046 | r7 | Gen.3.11 | 01Uv6 | 5046 | HVhp3ms | listed | |
| H7307 | H7307 | r8 | Gen.1.2 | 0137c | c/7307 | HC/Ncbsc | null | seed |
| H7225 | H7225 | r8 | Gen.1.1 | 01xeN | b/7225 | HR/Ncfsa | null | |
| H8414 | H8414 | r8 | Gen.1.2 | 01aPd | 8414 | HNcmsa | null | |
| H0922 | H922 | r8 | Gen.1.2 | 01eYX | c/922 | HC/Ncmsa | null | |
| H2822 | H2822 | r8 | Gen.1.5 | 013TL | c/l/2822 | HC/Rd/Ncmsa | null | |
| H8415 | H8415 | r8 | Gen.1.2 | 01PB6 | 8415 | HNcbsa | null | |
| H6153 | H6153 | r8 | Gen.1.5 | 01NQN | 6153 | HNcmsa | null | |
| H7549 | H7549 | r8 | Gen.1.6 | 01fsu | 7549 | HNcmsa | null | |
| H7363 | H7363 | r8 | Gen.1.2 | 01yNB | 7363 b | HVprfsa | listed | |
| H3974 | H3974 | r8 | Gen.1.16 | 01ddd | d/3974 | HTd/Ncmsa | null | |
| H6529 | H6529 | r8 | Gen.1.12 | 01AJj | 6529 | HNcmsa | null | |
