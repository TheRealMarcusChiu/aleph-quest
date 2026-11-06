# Aleph Quest

An original tile-world adventure for learning Biblical Hebrew from zero. You are an apprentice scribe. A storm scattered your archive across the country, and words hide in the reeds until someone can read them.

Walk the map, learn from your mentor Tamar, capture real Hebrew words by showing them three different ways, get past your rival Neri, solve the Field Gate, and earn the Reed Seal.

**Status: opening region only.** Letter Grove is complete and playable. The full game is planned as eight regions, 150 words and 600 questions, and those aren't built. `npm run validate` fails on purpose until they are.

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

Your objective is always shown under the map. Sound is off by default and is procedural sound effects only. No Hebrew pronunciation audio is supplied. Timers don't exist. The Menu has Calm reading, sound, and a choice of typed or multiple-choice written answers.

## How it plays

Find Tamar for a worked example and guided practice. A word then surfaces in the reeds. Study its card, then Read a letter, Understand its meaning, and Inscribe its spelling. Three different successes capture it, and mistakes explain themselves and lead to a fresh question. Captures are permanent. Words come back for review on later days. Six words travel in your party, and the Worddex keeps every word's status, forms, sources and history.

Saves are automatic, with three slots, and export and import as JSON. If a browser blocks storage, the game warns you and keeps playing in memory, so you can still export. Unreadable slot data is never overwritten without confirmation.

## What's in the repo

- `src/`: vanilla ES modules. `engine`, `learning`, `checkpoints`, `answers` and `storage` are pure logic. `world` holds maps, `render` draws the canvas, `ui` and `app` are the DOM.
- `data/`: all language content, separate from code. See `docs/SCHEMA.md`.
- `scripts/validate-content.mjs`: checks references, answer keys against the word itself, source tokens, capture readiness, and prerequisites.
- `tests/`: Node native tests, including a jsdom run through the real UI code. `test-output/` receives rasterized map PNGs.
- `docs/`: `SCHEMA.md`, `LEARNING.md`, `CURRICULUM.md`, `LICENSES.md`, and the delivery contract and plan.

## Sources and licenses

Source code and original teaching text: MIT. Biblical text: Westminster Leningrad Codex (public domain), through the Open Scriptures Hebrew Bible. OSHB lemma and morphology annotations and the digital Strong's dictionary: CC BY 4.0. Font: Noto Serif Hebrew, SIL OFL 1.1. Notices ship in `public/notices/` and on the in-game Credits screen. Details: `docs/LICENSES.md`.

Lesson order follows the table of contents of Allen P. Ross, *Introducing Biblical Hebrew*, with no lesson text or exercises copied. Neither the author nor the publisher endorses this project.

## Known limits

- One region. No vowels, grammar, Build or Analyze commands, later badges, ending or postgame yet.
- Worddex has no search, sort, filter or favorites yet. The opening's 10 words don't need them, but the full game will.
- Hebrew content is source-checked by the validator, but no qualified Biblical Hebrew reviewer has approved it.
- Automated tests run under jsdom with a stubbed canvas. Font rendering, focus visuals and touch need checking in a real browser.
