# Aleph Quest

An original tile-world adventure for learning Biblical Hebrew from zero. You are an apprentice scribe. A storm scattered your archive across the country, and words hide in the reeds until someone can read them.

Walk the map, learn from your mentor, capture real Hebrew words by showing them three different ways, duel your rival Neri, answer the language locks, and earn a seal in each region. Bring all eight home, restore the archive, then keep your words alive in the Review Garden.

**Status: the game is built, and the language content isn't all in yet.** All eight regions exist as walkable maps with their towns, caves, secrets, quests, duels, badges, ending and postgame, and the rules for all of them are tested. Only Letter Grove has real language content in this branch. Later regions open as their reviewed content is integrated, so today the first arch still ends the journey. The full journey has not been played with real content. `npm run validate` fails on purpose until 150 words and 600 questions exist.

## Run it

Needs Node 22 or newer.

```sh
npm install
npm run dev              # local dev server
npm test                 # logic, content and DOM journey tests
npm run validate:opening # checks the opening's real content
npm run validate         # checks the full campaign floor (fails today)
npm run build            # static site in dist/, relative paths, deployable to any subpath
```

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

The Worddex keeps every word you've met with its status, forms, sources, regions, history and next review. It has search, favorites, sorting, and filters for region, part of speech, root and status. A word you haven't studied keeps its meaning hidden there too.

Saves are automatic, with three slots, and export and import as JSON. Saves from the opening build load through a tested migration. If a browser blocks storage, the game warns you and keeps playing in memory, so you can still export. Unreadable slot data is never overwritten without confirmation. The game also refuses to write a save it couldn't read back, and says so.

## What's in the repo

- `src/`: vanilla ES modules. `engine`, `learning`, `checkpoints`, `answers` and `storage` are pure logic. `world` holds maps, `render` draws the canvas, `ui` and `app` are the DOM.
- `data/`: all language content, separate from code. See `docs/SCHEMA.md`.
- `scripts/validate-content.mjs`: checks references, answer keys against the word itself, source tokens, capture readiness, and prerequisites.
- `tests/`: Node native tests, including jsdom runs through the real UI code. `tests/fixtures/campaign-fixture.mjs` is synthetic r2 to r8 data for testing the game code, and nothing in `src/` imports it. `test-output/` receives rasterized map PNGs.
- `docs/`: `SCHEMA.md`, `LEARNING.md`, `CURRICULUM.md`, `LICENSES.md`, and the delivery contract and plan.

## Sources and licenses

Source code and original teaching text: MIT. Biblical text: Westminster Leningrad Codex (public domain), through the Open Scriptures Hebrew Bible. OSHB lemma and morphology annotations and the digital Strong's dictionary: CC BY 4.0. Font: Noto Serif Hebrew, SIL OFL 1.1. Notices ship in `public/notices/` and on the in-game Credits screen. Details: `docs/LICENSES.md`.

Lesson order follows the table of contents of Allen P. Ross, *Introducing Biblical Hebrew*, with no lesson text or exercises copied. Neither the author nor the publisher endorses this project.

## Known limits

- Real language content covers Letter Grove only until later regions are integrated. The eight-region journey has only been run on a labeled synthetic fixture, under jsdom.
- Hebrew content is source-checked by the validator, but no qualified Biblical Hebrew reviewer has approved it.
- Automated tests run under jsdom with a stubbed canvas. Font rendering, focus visuals and touch need checking in a real browser.
- A Worddex entry can be read before a review or capture answer. Only reading one over a seal's pending question about that word counts as help.
