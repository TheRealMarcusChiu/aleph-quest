# Aleph Quest

An original tile-world adventure for learning Biblical Hebrew from zero. You are an apprentice scribe. A storm scattered your archive across the country, and words hide in the reeds until someone can read them.

Walk the map, learn from your mentor, capture real Hebrew words by showing them three different ways, duel your rival Neri, answer the language locks, and earn a seal in each region. Bring all eight home, restore the archive, then keep your words alive in the Review Garden.

**Status: the full game is built and has been played through in real browsers by automation. It has no public deployment yet.** All eight regions are walkable with their towns, caves, secrets, quests, duels, badges, ending and postgame, and all carry reviewed language content: 154 word cards (150 lexemes by a conservative count), 1,201 questions, 43 lessons and Genesis 1:1-5. See [What has been verified](#what-has-been-verified) for what those runs do and don't show. They show that the game works. They don't show that it teaches Hebrew well.

## Run it

Needs Node 22 or newer.

```sh
npm ci                   # install the locked dependencies
npm run dev              # local dev server
npm test                 # logic, content, packaging and jsdom journey tests
npm run validate:opening # checks every content rule, and the first region's 8 to 10 words
npm run validate         # checks every content rule, and the full campaign floor
npm run build            # static site in dist/, relative paths
```

### Serve the build locally

The build needs HTTP, since browsers won't load ES modules from `file://`. Any static server works:

```sh
npm run build
npx vite preview         # or: python3 -m http.server 8080 --directory dist
```

### Deploy

`dist/` runs from any static host, at the root or on a subpath, with no server code. It also carries the MIT notice at `LICENSE` and the third-party notices in `notices/`.

For GitHub Pages, push this repository to GitHub and set **Settings > Pages > Source** to **GitHub Actions**. `.github/workflows/pages.yml` then runs on every push to `main`, or by hand from the Actions tab. It runs the tests, both validators and the build, and it deploys `dist/` only if they all pass. The deployment job reports the site's URL. No public URL exists yet, and this workflow hasn't been run on GitHub.

### Offline

The game calls no backend or API, and its font and data are bundled. Once the page and its assets have loaded, play continues with the network off. The first visit needs the network, and it isn't an installable app. Links to sources in the Worddex and Credits are ordinary web links, and they only load if you open them.

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
- `docs/`: `SCHEMA.md`, `LEARNING.md`, `CURRICULUM.md`, `RESEARCH.md`, `CONTENT-REVIEW.md`, `LICENSES.md`, and the delivery contract and plan.
- `.github/workflows/pages.yml`: the GitHub Pages build and deployment.

## Sources and licenses

Source code and original teaching text: MIT. Biblical text: Westminster Leningrad Codex (public domain), through the Open Scriptures Hebrew Bible. OSHB lemma and morphology annotations and the digital Strong's dictionary: CC BY 4.0. Font: Noto Serif Hebrew, SIL OFL 1.1. Every build includes the MIT notice as `LICENSE` and the third-party notices in `notices/`, and they also appear on the in-game Credits screen. Details: `docs/LICENSES.md`.

Lesson order follows the table of contents of Allen P. Ross, *Introducing Biblical Hebrew*, with no lesson text or exercises copied. Neither the author nor the publisher endorses this project.

## What has been verified

These results come from source revision `58aa776`. Later changes up to this README only add packaging and documentation, and don't change the game's source. All of this is automated QA by AI agents. It shows that the software works, and says nothing about how well anyone learns from it.

**Unit, content and jsdom tests.** `npm test`, both validators and the build passed, and separate AI reviewers checked the code and data. The journey tests in `tests/` run under jsdom with a stubbed canvas, so they don't show pixels, fonts or real touch.

**Full campaigns in real browsers.** Chromium driven by keyboard and WebKit driven by touch each finished all 72 required quest stages from a new game: 8 regions, 8 badges, the ending, Review Garden practice and a full reload. The runs used the normal UI, with no changes to the random numbers or clock, no injected saves, and no granted progress. The automation read the authored answer keys and planned its routes by search, so these runs show that the game can be finished, not that a person could finish it unaided. The touch run tapped the on-screen Hebrew keyboard 131 times. It didn't use a phone's own keyboard or a physical device.

**Saves and pages.** Separate browser checks covered three save slots, real file download and upload, rejected imports leaving the game unchanged, reset, storage failures, local fonts, right-to-left text and pointing, narrow layouts, and continuing offline after load. Saves from the earlier opening build load in this version. That earlier build refuses saves from this version and leaves its own state unchanged.

**Long-term and endgame behavior.**

- A collection of 44 words was checked with the six-word party limit, removing and replacing party words, and Worddex filters, sorting and favorites.
- Reviews on four simulated browser dates took two words to Mastered. No real days passed.
- Two endgame saves, with 44 and 47 captures, were imported, restored, reloaded and exported correctly. Over 52 measured actions, autosaving took about 81 to 106 ms in Chromium and 164 to 196 ms in WebKit. Those figures include automation and drawing overhead, and they aren't a guarantee for any device.
- Help stayed recorded on a pending question through going back, reading the Worddex, leaving the Hall, changing answer mode and reloading. Helped answers earned no independent credit, and a later unaided answer did.

## Known limits

- No real person has played through the course in testing, and how well it teaches is unmeasured.
- Not tested: physical phones and tablets, a phone's own keyboard, a first visit with no network, or a save holding all 154 cards with long histories.
- Sorting the Worddex by status across a mix of statuses, and every paradigm trace variant, weren't all checked in a browser.
- Hebrew content was reviewed against Strong and OSHB by AI review agents, under the conventions in `docs/CONTENT-REVIEW.md`. No qualified Biblical Hebrew reviewer has approved it.
- The course follows only the table of contents of Ross's book, through chapter 37 in the authorized preview. No lesson text was available or used, so it doesn't claim to match the book's lessons. See `docs/RESEARCH.md`.
- Worddex lookups count as help on the next answer about that word for 20 hours, and opening the Worddex over a pending question marks that question as helped. Something written on paper or read elsewhere can't be detected.
