# Learning design

Retrieval practice and distributed practice have strong general support. The sources below don't validate this game, Hebrew transfer, or any exact threshold here. Every number is an editable design choice.

## The loop

| Step | What happens | Why |
|---|---|---|
| Worked example | Tamar annotates a word that isn't being tested, then guides practice. Guided answers aren't scored. | Alternate worked solutions with problems (Pashler et al., 2007). |
| Study | The card shows gloss, sound guide and example. Then it hides. Reading it isn't retrieval. | Only active recall counts as evidence (Roediger & Karpicke, 2006). |
| Capture | Three first-try, unaided answers from three task families, templates and stems: a letter feature, a meaning, and a reversed-order spelling or typed form. | Capture must not be the same question three times. |
| A miss | Shows the answer and a discriminating explanation. Earned steps are kept and the stem retires. The next attempt uses a fresh stem. | Correct-answer feedback helped word learning at a week (Pashler et al., 2005). What feedback says matters, though effects vary widely (Wisniewski et al., 2020). |
| Out of stems | Study or leave with progress kept. Exposed stems return in a later encounter after two other answers or interactions. | Never a soft lock, and never instant credit for a just-revealed answer. |
| Review | One first answer on a later day, on a different family and context, and not one of the last three stems. | Spacing effects depend on gap and horizon (Cepeda et al., 2006, 2008). |
| Mixing | Due reviews mix into reed encounters with new words. Only taught skills appear. | Mixing already-introduced items helped delayed tests in the math experiments of Rohrer & Taylor (2007). Applying it to Hebrew is an extrapolation. |

## Parameters

- **Ladder:** 1, 2, 4, 7, 14, 30 days. A tunable practical ladder, not an optimal one. Cepeda et al. (2008) found that the best gap varies with the retention horizon.
- **Minimum gap:** 20 hours between reviews, and one finalized review per UTC day, so midnight can't be used to double up.
- **Independent answer:** correct, first submission, no hint, card not reopened. Anything else is a failed opportunity on a review, or a retired stem during capture.
- **Lapse:** down one stage, due again in a day. History, collection, party and badges stay.
- **Practiced:** one independent review after capture.
- **Mastered:** four independent reviews on four UTC days, across three families and three contexts, with the last five outcomes at 80% or better, and the latest correct. A later miss returns the current status to Practiced and keeps the first `masteredAt`. Mastered is provisional evidence of varied recall, not fluency.
- **Overdue:** never a penalty. Idle time and clock jumps can make a word due, but they can't create a success. A clock moved backward simply pauses eligibility.

## Adventure and learning stay separate

Badges use trial answers on unfamiliar words and need captures, never real days. A badge can't be delayed by the review schedule, and it doesn't claim mastery. Party uses are a small adventure tally. Puzzle and trial answers never count as word evidence.

## Answer checking

`src/answers.js` builds a comparison key per task, and source display strings are never changed.

- `pointed`: NFC, without cantillation and meteg. Vowels, dagesh, shin and sin dots, and qamats versus qamats qatan all stay distinct.
- `consonants`: drops all pointing. Used only when the prompt says pointing isn't tested. Final and regular forms stay distinct, and a wrong final form gets its own explanation.
- `gloss`: case, punctuation and a leading article are forgiven. Only curated aliases pass.

No key reverses a string. On-screen and physical input both produce logical order. Recognition choices meet the same goal on every typing task and are recorded as recognition, because selecting isn't proof of spelling recall.

Hints reveal part of an answer, so they cost independent credit. Input aids don't.

## Sound convention

The sound guide is a modern Israeli-oriented reading of Biblical Hebrew pointing, not ancient speech. In a word of more than one syllable, the stressed syllable is capitalized (`SE-fer`, `sha-MA-yim`, `i-SHAH`). Strong's obsolete `pron` field isn't used. There is no pronunciation audio.

Later regions use these choices consistently:

- `kh` writes het and undotted kaf. `ts` writes tsade. `q` writes qof, and it is read like k. `s` writes sin and samekh.
- Alef and ayin have no symbol when silent. Their letters still differ in spelling tasks, because this reading merges their sound.
- Word-initial shewa is sounded, written `e`. Silent shewa writes nothing.
- Qamats qatan is read `o`, as in `kol` for כָּל־.
- A furtive patah is read before its final guttural, as in `RU-akh`.

Modern speech is a convention here, and it isn't a claim about any historical stage of the language.

## Numbers are product choices

The review ladder, the capture counts, each badge's five correct answers and its six required captures are all editable design choices. None of them comes from a study. A badge's pool has at least two spare questions, so a miss can't lock a learner out.

## Sources

Links only. No paper text ships.

- Dunlosky et al. (2013), https://doi.org/10.1177/1529100612453266
- Roediger & Karpicke (2006), https://doi.org/10.1111/j.1467-9280.2006.01693.x
- Cepeda et al. (2006), https://doi.org/10.1037/0033-2909.132.3.354
- Cepeda et al. (2008), https://doi.org/10.1111/j.1467-9280.2008.02209.x
- Rohrer & Taylor (2007), https://doi.org/10.1007/s11251-007-9015-8
- Pashler et al. (2007), IES practice guide NCER 2007-2004, https://ies.ed.gov/ncee/WWC/Docs/practiceguide/20072004.pdf
- Pashler et al. (2005), https://doi.org/10.1037/0278-7393.31.1.3
- Wisniewski, Zierer & Hattie (2020), https://doi.org/10.3389/fpsyg.2019.03087
