# Aleph Quest

An original tile-world adventure for learning Biblical Hebrew from zero. You are an apprentice scribe. A storm scattered your archive across the country, and words hide in the reeds until someone can read them.

Walk the map, learn from your mentor, capture real Hebrew words by showing them three different ways, duel your rival Neri, answer the language locks, and earn a seal in each region. Bring all eight home, restore the archive, then keep your words alive in the Review Garden.

**Status: integrated, awaiting browser proof.** All eight regions are walkable with their towns, caves, secrets, quests, duels, badges, ending and postgame, and all carry reviewed language content: 154 word cards (150 lexemes by a conservative count), 1,201 questions, 43 lessons and Genesis 1:1-5. An automated run plays the real content from a new game to the ending and the Review Garden through the real UI code, using key presses and clicks. That run is jsdom with a stubbed canvas, so it doesn't show pixels, fonts or real touch. A full browser campaign and a public deployment haven't been done yet.

## Run it

Needs Node 22 or newer.

```sh
npm install
npm run dev              # local dev server
npm test                 # logic, content and DOM journey tests
npm run validate:opening # checks every content rule, and the first region's 8 to 10 words
npm run validate         # checks every content rule, and the full campaign floor
npm run build            # static site in dist/, relative paths
```

To deploy, copy `dist/` to any static host, including a subpath. It needs no server code. Everything the game needs is in `dist/`, so it makes no outside requests when it runs. No public URL exists yet.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Walk | Arrow keys or WASD | Direction pad |
| Talk, read, try a door | Enter or Space | A button |
| Choose in menus | Tab or arrows, then Enter | Tap |
| Back, retreat, close | Esc | Back or Retreat buttons |
| Menu | M, or the Menu button | Menu button |

Your objective is always shown under the map. Sound is off by default and is procedural sound effects only. No Hebrew pronunciation audio is supplied. Timers don't exist. The Menu has a Journal, Calm reading, sound, a choice of typed or multiple-choice written answers, and a display preference for the divine name. That preference changes what is drawn, never an answer key, and every altered screen says so.

## How it plays

Find the region's mentor for a worked example and guided practice. A word then surfaces in the reeds. Study its card, then Read, Understand and Inscribe it. Three different successes capture it, and mistakes explain themselves and lead to a fresh question. Captures are permanent. Later lessons add Analyze and Build, which grow what you know without being needed for capture.

Words come back for review on later days, and reviews mix in from every region you've been through. Reaching Mastered takes independent answers on four separate days, and nothing in the adventure waits on that. A missed review offers a fresh practice question right away.

Six words travel in your party. New kinds of task with a party word earn it XP, and repeating one earns nothing. Word knowledge grows from Known to Familiar to Deep through varied use and tracing related forms. Growth opens more attested lines in the Worddex and lets the word answer a cave seal, which opens a shortcut and a hidden cache. The word itself never changes.

Each region's rival and language lock block the way until you answer fresh questions without hints. A miss explains itself and moves on, and hints stay with the question through leaving, reloading and switching modes, so they can't be washed out.

The Worddex keeps every word you've met with its status, forms, sources, regions, history and next review. It has search, favorites, sorting, and filters for region, part of speech, root and status. A word you haven't studied keeps its meaning hidden there too. Reading an entry is real study, and it counts as help on your next answer about that word, so a lookup can't pass as recall.

Saves are automatic, with three slots, and export and import as JSON. Saves from the opening build load through a tested migration. If a browser blocks storage, the game warns you and keeps playing in memory, so you can still export. Unreadable slot data is never overwritten without confirmation. The game also refuses to write a save it couldn't read back, and says so.

## What's in the repo

- `src/`: vanilla ES modules. `engine`, `learning`, `checkpoints`, `answers` and `storage` are pure logic. `world` holds maps, `render` draws the canvas, `ui` and `app` are the DOM.
- `data/`: all language content, separate from code. See `docs/SCHEMA.md`.
- `scripts/validate-content.mjs`: checks references, answer keys against the word itself, source tokens, capture readiness, and prerequisites.
- `tests/`: Node native tests, including jsdom runs through the real UI code, on both the real content and a labeled fixture. `tests/fixtures/campaign-fixture.mjs` is synthetic r2 to r8 data for testing the game code's rules, and nothing in `src/` imports it. `test-output/` receives rasterized map PNGs.
- `docs/`: `SCHEMA.md`, `LEARNING.md`, `CURRICULUM.md`, `LICENSES.md`, and the delivery contract and plan.

## Sources and licenses

Source code and original teaching text: MIT. Biblical text: Westminster Leningrad Codex (public domain), through the Open Scriptures Hebrew Bible. OSHB lemma and morphology annotations and the digital Strong's dictionary: CC BY 4.0. Font: Noto Serif Hebrew, SIL OFL 1.1. Notices ship in `public/notices/` and on the in-game Credits screen. Details: `docs/LICENSES.md`.

Lesson order follows the table of contents of Allen P. Ross, *Introducing Biblical Hebrew*, with no lesson text or exercises copied. Neither the author nor the publisher endorses this project.

## Known limits

- The eight-region journey on real content has only been run under jsdom, not yet in a real browser.
- Hebrew content was reviewed against Strong and OSHB by AI review agents, under the conventions in `docs/CONTENT-REVIEW.md`. No qualified Biblical Hebrew reviewer has approved it.
- The course follows only the table of contents of Ross's book, through chapter 37 in the authorized preview. No lesson text was available or used, so it doesn't claim to match the book's lessons. See `docs/RESEARCH.md`.
- Automated tests run under jsdom with a stubbed canvas. Font rendering, focus visuals and touch need checking in a real browser.
- Worddex lookups count as help on the next answer about that word for 20 hours, and opening the Worddex over a pending question marks that question as helped. Something written on paper or read elsewhere can't be detected.
