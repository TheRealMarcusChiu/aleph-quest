# Research summary

This records what was read to build the content, and what wasn't. It isn't a review of the Ross textbook, and no reviewer has certified anything here.

## Curriculum source

Allen P. Ross, *Introducing Biblical Hebrew* (Baker Academic, 2001). The only part read is the table of contents through chapter 37, in the publisher-authorized [Biblia preview](https://biblia.com/api/plugins/embeddedpreview?resourceName=LLS%3AINTROBIBHBRW). No chapter body, vocabulary list, exercise or answer key was read or copied. The preview stops after chapter 37, so anything later is unknown, and the book's hollow and geminate chapter placement isn't verified. The publisher's eSources page says no student resources exist and limits the answer key to verified professors. That key wasn't accessed.

## Hebrew sources

| Source | Revision | Used for |
|---|---|---|
| OSHB `wlc/Gen.xml` | morphhb 3d15126f | Every attested form, reference, lemma and morphology code |
| Digital Strong's Hebrew dictionary | HebrewLexicon 21c9add1 | Headwords, parts of speech, derivation notes and quoted senses. Its pronunciation field is used only to cross-check stress position, and is never taught |

`data/candidate-lemmas-150.tsv` in the research folder was only a starting list. Many rows were dropped, and some entries came from outside it. Each kept word was re-read against the XML. Known traps from the research note are handled: H413's headword isn't its usable form, H853 and H854 stay separate lexemes, and אֱלֹהִים isn't called singular in form.

## Mark order

morphhb's README warns against normalizing its text. `data/attestations.json` and each passage's `sourceText` and token `hebrew` now hold the upstream strings byte for byte. Thirteen baseline attestation surfaces had been stored in NFC order, and they are restored. Some JSON uses `\u` escapes so the order can't be changed by an editor. NFC appears only in comparison keys. `tests/content/source.test.mjs` proves this against the pinned XML when the XML is present, and it reports a skip when it isn't.

## Learning design

The research note is at `docs/LEARNING.md`. Its sources are linked there. They support retrieval and spacing in general, not this game, and not any exact number used here.
