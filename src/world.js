// Original tile maps and object placement. Hebrew never appears here: it lives in data/ and renders in the DOM.

// Legend. Solid tiles block walking. '?' looks like a pine but lets you through.
export const SOLID = new Set(['#', 'o', 'r', '~', '^', '|', 'G', '1', '2', '3', 'X', 's', 't', 'W', '%', 'M', 'A', 'T', 'P', 'Y', 'L']);
export const REEDS = '"';
// Words surface on reeds outdoors and on dark moss in caves.
export const ENCOUNTER_TILES = new Set([REEDS, ';']);
export const TILE_NAMES = new Set([...SOLID, REEDS, ';', '?', '.', ',', '=', 'D', 'f', ':', 'R', 'E', 'c', 'C', '_']);

// Maps with lowercase marks are compiled below: each mark becomes its tile and gives actors a place to stand.
const OUTDOOR_MARKS = { a: ',', b: ',', d: 'D', e: ',', g: '=', h: 'D', i: '.', j: ',', k: '.', l: '=', m: '.', n: 'C', p: '.', q: '.', u: 'C', w: '.', x: 'X', y: ',', z: '.' };
const CAVE_MARKS = { h: 'c', i: 'c', v: 'c', w: 'c', x: 'C', y: 'c', z: 'C' };

const OUTDOORS = {
  springs: {
    regionId: 'r2', biome: 'springs', title: 'Vowel Springs',
    rows: [
      '##############x###############',
      '#####.........y.........######',
      '###...^^^^^...,....YY.....u###',
      '###...||h||...,....YY.....w###',
      '###.....j,,,,,,............###',
      '~~~~~~~~~~~~~~l~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~',
      '###...........,...""""....####',
      '###..oo.......,...""""""..####',
      '###..oo...m...,,,,,,,,,,.pn###',
      '###...........,...""""....####',
      '###.i.........,.......f....###',
      '###...........,...........####',
      '~~~~~~~~~~~~~~g~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~',
      '###.......k...,......^^^^^..##',
      '###...........,......|d|||..##',
      '###...........,,,,,,,,e.....##',
      '###..z........,......q.......#',
      '###...........,...""""......##',
      '###...........,..""""""".....#',
      '####..........,...""""....####',
      '#####.........a.........######',
      '##############b###############',
    ],
  },
  market: {
    regionId: 'r3', biome: 'market', title: 'Nominal Town',
    marks: { g: '_', l: '_', k: '_', q: '_', z: '_', m: '_', i: '_', p: '_', e: '_', j: '_', w: '_', a: '_', b: '_', y: '_' },
    rows: [
      '##############################',
      '#.^^^^^...G.^^^^....G........#',
      '#.||d||...G.||||....G...^^^^.#',
      '#...e.....G.....MM..G...|h||.#',
      '#..._.....G.....MM..G....j__.#',
      '#..._.....G.........G......_.#',
      '#..._..z..G.........G......_.#',
      '#...______G.....q...G......_.#',
      '#.....""".G...""""..G."""".,.#',
      '#...""""".G...""""..G."""".,.#',
      '#_________g_________l_______.#',
      '#..k......G..i......G......,.#',
      '#.........G....m....G......,yx',
      '#...LL....G.........G........#',
      '#...LL....G..MM..pn.G.....wu.#',
      '#.........G.........G........#',
      '#..""""...G...""""..G..""""..#',
      '#..""""...G...""""..G..""""..#',
      '#.........G.........G........#',
      '#..f......GGGGGGGGGGG........#',
      '#...._....GGGGGGGGGGG........#',
      '#....a....####################',
      '#####b########################',
      '##############################',
    ],
  },
  gorge: {
    regionId: 'r4', biome: 'gorge', title: 'Perfect Gate',
    rows: [
      '#####x########################',
      '#....y......^^^^^..........###',
      '#....,......||h||..........###',
      '#....,,,,,,,,,j.........u..###',
      '#...............r.......w..###',
      '~~~~~~~~~~~l~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~=~~~~~~~~~~~~~~~~~~',
      'rrr........,...........rrrrrrr',
      'rr.........,,,,,,,......""""rr',
      'rr..i......m.....,....""""""rr',
      'rr.......pn......,....."""".rr',
      'rr...............,.....q....rr',
      'rrrr.............,..........rr',
      '~~~~~~~~~~~~~~~~~g~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~',
      'rrr..............,.....k....rr',
      'rr.^^^^^.........,...........r',
      'rr.||d||.........,....""""...r',
      'rr...e,,,,,,,,,,,,...""""....r',
      'rr...z...........,...""""....r',
      'rrr..............,,,,,,,,....r',
      'rrrrr...................,...rr',
      'rrrrrrrrrrrrrr..........a..rrr',
      '########################b#####',
    ],
  },
  foundry: {
    regionId: 'r5', biome: 'foundry', title: 'Suffix Workshop',
    marks: { g: ',' },
    rows: [
      '########################x#####',
      '##..........^^^^^^......y...##',
      '##..AA......|||h||......,...##',
      '##.............j,,,,,,,,,...##',
      '##..u.......................##',
      '##..w.........AA............##',
      '~~~~~~~~~~~~~~~~~~~~~~l~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~',
      '##....""""............,.....##',
      '##..""""""..i.....,,,,,.....##',
      '##....""""........,.....pn..##',
      '##................,.m.......##',
      'GGGGGGGGGGGGGGGGGGgGGGGGGGGGGG',
      '##................,..k......##',
      '##..^^^^^.........,....AA...##',
      '##..||d||.........,.........##',
      '##....e,,,,,,,,,,,,...""""..##',
      '##....z...........,.."""""".##',
      '##................,...""""..##',
      'ba,,,,,,,,,,,,,,,,,.q.......##',
      '##..........................##',
      '##..oo........AA....f.......##',
      '##############################',
      '##############################',
    ],
  },
  observatory: {
    regionId: 'r6', biome: 'observatory', title: 'Verb Observatory',
    marks: { g: ',', l: ',' },
    rows: [
      '##############################',
      '#..................""""......#',
      '#..^^^^^...........""""......#',
      '#..||d||...........""""..z...#',
      '#....e.......................#',
      '#............................#',
      '#...######################...#',
      '#...#....................#...#',
      '#...#..i.............pn..#...#',
      '#...#....#####l######....#...#',
      '#...#....#....,.....#....#...#',
      '#...#....#..TT,.^^^.#....#...#',
      '#...#...#xy.TT,.|h|.#....#...#',
      '#...#....#,,,,,,.j..#....#...#',
      '#...#....#.......w..#....#...#',
      '#...#....#.......u..#....#...#',
      '#...#....############....#...#',
      '#...#...""""...m..""""...#...#',
      '#...#..............k.....#...#',
      '#...##########g###########...#',
      '#...""""......,......""""....#',
      '#.q.""""......,......""""..f.#',
      '#.............a..............#',
      '##############b###############',
    ],
  },
  highlands: {
    regionId: 'r7', biome: 'highlands', title: 'Stem Highlands',
    marks: { g: ',', l: ',' },
    rows: [
      '###########x##################',
      '#..........y.........^^^^^...#',
      '#..........,.........||h||...#',
      '#..........,,,,,,,,,,,,j.....#',
      '#..u......................oo.#',
      '#..w.........................#',
      'rrrrrrrrrrrrrrrrlrrrrrrrrrrrrr',
      '#...............,............#',
      '#..""""""......,,,.........m.#',
      '#..""""""......,...........pn#',
      '#...........i..,.............#',
      'rrrrrrrgrrrrrrrrrrrrrrrrrrrrrr',
      '#......,......k..............#',
      '#......,,,,,,,,,,,,,,,,......#',
      '#..^^^^^..............,..""""#',
      '#..||d||..............,..""""#',
      '#....e,,,,,,,,,,,,,,,,,......#',
      '#....z................,......#',
      '#..oo......""""....q..,..""".#',
      '#.........."""".......,,,,,,ab',
      '#............................#',
      '##############################',
    ],
  },
  ruins: {
    regionId: 'r8', biome: 'ruins', title: 'Narrative Ruins',
    marks: { g: ',', l: ',' },
    rows: [
      '##################x###########',
      '#..P...P...P......y...P...P..#',
      '#.................,..........#',
      '#...^^^^^^^.......,......u...#',
      '#...|||h|||.......,......w...#',
      '#......j,,,,,,,,,,,..........#',
      '#..P...........P..........P..#',
      'GGGGGGGGGGGGlGGGGGGGGGGGGGGGGG',
      '#...........,................#',
      '#.i.""""....,,,,,,,,,....."""#',
      '#...""""............,..m...""#',
      '#....pn.............,........#',
      '#......P.......P....,...P....#',
      '#...................,........#',
      'GGGGGGGGGGGGGGGGGGGGgGGGGGGGGG',
      '#...................,...k....#',
      '#..^^^^^............,........#',
      '#..||d||............,..."""".#',
      '#....e,,,,,,,,,,,,,,,..."""".#',
      '#....z..............,.q......#',
      '#..P.......P........,...P....#',
      '###################.a........#',
      '####################b#########',
    ],
  },
};

const CAVES = {
  springs: [
    '%%%%%%%z%%%%%%%',
    '%%hccccyccccc%%',
    '%%c;;ccvccc;c%%',
    '%%%%%%%w%%%%%%%',
    '%ccccc;c;ccccc%',
    '%c;;ccccccc;;c%',
    '%c;;ccccccc;;c%',
    '%cccccciccccc%%',
    '%%%%%%%x%%%%%%%',
    '%%%%%%%%%%%%%%%',
  ],
  market: [
    '%%%%%%%%%%%%z%%',
    '%ccccccc%%hcyc%',
    '%c;;cccc%%cccc%',
    '%c;;ccccwvcccc%',
    '%ccccccc%%%%cc%',
    '%%%%%%cc%%%%%%%',
    '%;;;cccc;;;;%%%',
    '%;;;cccc;;;;%%%',
    '%ccccccic%%%%%%',
    '%%%%%%%x%%%%%%%',
  ],
  gorge: [
    '%%%%%%%%%%%z%%%',
    '%hccccccccycc%%',
    '%ccc;;;ccccc%%%',
    '%%%%%%%v%%%%%%%',
    '%%%%%%%w%%%%%%%',
    '%%%%%%%c%%%%%%%',
    '%;;;cccccccc;;%',
    '%;;;cccccccc;;%',
    '%ccccccicccccc%',
    '%%%%%%%x%%%%%%%',
  ],
  foundry: [
    '%%z%%%%%%%%%%%%',
    '%cycccccccccc%%',
    '%hcccc;;;;ccc%%',
    '%%%%%%%%%%v%%%%',
    '%%%%%%%%%%w%%%%',
    '%%%%ccc%%%c%%%%',
    '%;;;;cccccccc;%',
    '%;;;;ccc;;cccc%',
    '%ccccccic;;ccc%',
    '%%%%%%%x%%%%%%%',
  ],
  observatory: [
    '%%%%%%%%%%%%z%%',
    '%h;;ccccccccyc%',
    '%c;;ccccvccccc%',
    '%%%%%%%%w%%%%%%',
    '%%%%%%%%c%%%%%%',
    '%;;ccccccc;;c%%',
    '%;;c%%%%cc;;c%%',
    '%ccc%%%%cccc%%%',
    '%ccccccicccc%%%',
    '%%%%%%%x%%%%%%%',
  ],
  highlands: [
    '%%%%%%%%%%%%%z%',
    '%hc;;ccccccccy%',
    '%cc;;ccc%%%%%%%',
    '%%%%v%%%%%%%%%%',
    '%%%%w%%%%%%%%%%',
    '%%%%ccc;;;ccc%%',
    '%;;cccc%%%ccc%%',
    '%;;ccc%%%%ccc%%',
    '%cccccic%ccc%%%',
    '%%%%%%x%%%%%%%%',
  ],
  ruins: [
    '%%%%%%%z%%%%%%%',
    '%h;cccyccccc;c%',
    '%c;ccccccccc;c%',
    '%%%%%%%v%%%%%%%',
    '%%%%%%%w%%%%%%%',
    '%;;cccccccc;;c%',
    '%;;c%%%%%%c;;c%',
    '%ccc%%%%%%cccc%',
    '%cccccicccccc%%',
    '%%%%%%x%%%%%%%%',
  ],
};

// One room shape, furnished differently per building: [x, y, tile] props on the plain floor.
function room(wallDecor, props) {
  const rows = [
    '############',
    `#${wallDecor.repeat(4)}##${wallDecor.repeat(4)}#`,
    '#::::::::::#', '#::::::::::#', '#::::::::::#', '#::::::::::#', '#::::::::::#', '#::::::::::#',
    '#####EE#####', '############',
  ].map(row => [...row]);
  for (const [x, y, tile] of props) rows[y][x] = tile;
  return rows.map(row => row.join(''));
}

const ROOMS = {
  springs: { house: room('s', [[2, 3, 't'], [9, 3, 't'], [5, 5, 'R'], [6, 5, 'R'], [2, 6, 'Y']]), hall: room('W', [[2, 3, 'Y'], [9, 3, 'Y'], [2, 6, 'Y'], [9, 6, 'Y'], [5, 4, 'R'], [6, 4, 'R'], [5, 5, 'R'], [6, 5, 'R']]) },
  market: { house: room('s', [[1, 3, 't'], [2, 3, 't'], [9, 3, 'M'], [10, 3, 'M'], [5, 5, 'R'], [6, 5, 'R']]), hall: room('W', [[1, 3, 'M'], [10, 3, 'M'], [1, 5, 'M'], [10, 5, 'M'], [5, 6, 'R'], [6, 6, 'R']]) },
  gorge: { house: room('s', [[3, 3, 't'], [8, 3, 't'], [2, 6, 'r'], [9, 6, 'r']]), hall: room('W', [[2, 3, 'r'], [9, 3, 'r'], [2, 5, 'r'], [9, 5, 'r'], [5, 3, 'R'], [6, 3, 'R'], [5, 4, 'R'], [6, 4, 'R']]) },
  foundry: { house: room('s', [[2, 3, 'A'], [9, 3, 'A'], [3, 6, 't'], [8, 6, 't']]), hall: room('W', [[1, 2, 'A'], [10, 2, 'A'], [1, 6, 'A'], [10, 6, 'A'], [5, 5, 'R'], [6, 5, 'R']]) },
  observatory: { house: room('s', [[2, 3, 'T'], [9, 3, 't'], [9, 6, 't'], [5, 5, 'R']]), hall: room('W', [[2, 3, 'T'], [3, 3, 'T'], [8, 3, 'T'], [9, 3, 'T'], [5, 5, 'R'], [6, 5, 'R']]) },
  highlands: { house: room('s', [[1, 3, 'L'], [10, 3, 'L'], [3, 6, 't'], [8, 6, 't']]), hall: room('W', [[3, 3, 'L'], [8, 3, 'L'], [3, 6, 'L'], [8, 6, 'L'], [5, 6, 'R'], [6, 6, 'R']]) },
  ruins: { house: room('s', [[2, 3, 'P'], [9, 3, 'P'], [2, 6, 'P'], [9, 6, 't']]), hall: room('W', [[2, 2, 'P'], [9, 2, 'P'], [2, 5, 'P'], [9, 5, 'P'], [5, 4, 'R'], [6, 4, 'R']]) },
};

export const MAPS = {
  grove: {
    title: 'Letter Grove', regionId: 'r1', biome: 'grove', outdoor: true,
    rows: [
      '###########################X############',
      '###########################,############',
      '#######.......^^^^^^^......,.......#####',
      '#######.......^^^^^^^......,.......#####',
      '#######.......|||D|||......,.....""#####',
      '#######..........,,,,,,,,,,,.....""#####',
      '#######..oo......,...............""#####',
      '#######..oo......,.......oo........#####',
      '#######....f.....,.......oo........#####',
      'GGGGGGGGGGGGGGG1G2G3GGGGGGGGGGGGGGGGGGGG',
      '#######......,,,,,,,,,......oo.....#####',
      '#######..........,..........oo.....#####',
      '#######..f.......,...........f.....#####',
      '#######..........,.................#####',
      '~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~~~~~~~~',
      '######...........,.................#####',
      '######...^^^^^...,..........""""...#####',
      '#####....^^^^^...,...........""""".#####',
      '#####....||D||...,...........""""".#####',
      '#...#......,,,,,,,,,,,,,,,,,,""""".#####',
      '#...?......,.................""""..#####',
      '#...#......,.......oo.........""...#####',
      '#####......,.......oo.............######',
      '#####......,...........f.........#######',
      '######.....,,,,,,.................######',
      '######...........r....oo.........#######',
      '#######..f.......r....oo.......#########',
      '##########..................############',
      '########################################',
    ],
    warps: { '11,19': { map: 'scriptorium', x: 5, y: 7, dir: 'up' }, '17,4': { map: 'hall', x: 5, y: 7, dir: 'up' } },
    exitFront: { x: 27, y: 1 },
  },
  scriptorium: {
    title: "Tamar's scriptorium", regionId: 'r1', biome: 'grove',
    rows: [
      '############',
      '#ssss##ssss#',
      '#::::::::::#',
      '#:t::::::t:#',
      '#::::RR::::#',
      '#::::RR::::#',
      '#::::::::::#',
      '#::::::::::#',
      '#####EE#####',
      '############',
    ],
    warps: { '5,8': { map: 'grove', x: 11, y: 20, dir: 'down' }, '6,8': { map: 'grove', x: 11, y: 20, dir: 'down' } },
  },
  hall: {
    title: 'Hall of Letters', regionId: 'r1', biome: 'grove',
    rows: [
      '############',
      '#WWWW##WWWW#',
      '#::::::::::#',
      '#:r::RR::r:#',
      '#::::RR::::#',
      '#::::RR::::#',
      '#:r::RR::r:#',
      '#::::::::::#',
      '#####EE#####',
      '############',
    ],
    warps: { '5,8': { map: 'grove', x: 17, y: 5, dir: 'down' }, '6,8': { map: 'grove', x: 17, y: 5, dir: 'down' } },
  },
  archive: {
    title: 'The Restored Archive', regionId: 'r8', biome: 'archive',
    rows: [
      '################',
      '#ssssss##ssssss#',
      '#::::::::::::::#',
      '#:P::::RR::::P:#',
      '#::::::RR::::::#',
      '#:P::::RR::::P:#',
      '#::::::RR::::::#',
      '#ssss::RR::ssss#',
      '#::::::::::::::#',
      '###EE##EE#######',
      '################',
    ],
    warps: {
      '7,9': { map: 'ruins', x: 18, y: 1, dir: 'down' }, '8,9': { map: 'ruins', x: 18, y: 1, dir: 'down' },
      '3,9': { map: 'garden', x: 11, y: 13, dir: 'up' }, '4,9': { map: 'garden', x: 11, y: 13, dir: 'up' },
    },
  },
  garden: {
    title: 'The Review Garden', regionId: null, biome: 'garden', outdoor: true,
    rows: [
      '########################',
      '#......................#',
      '#.""""...oo....oo....""#',
      '#.""""...oo....oo....""#',
      '#......,,,,,,,,,,......#',
      '#..ff..,........,...f..#',
      '#..ff..,."""""".,......#',
      '#......,."""""".,......#',
      '#..""".,........,..."""#',
      '#..""".,,,,,,,,,,..."""#',
      '#..........,...........#',
      '#..f.......,.......f...#',
      '#..........,...........#',
      '#..........,...........#',
      '###########C############',
      '########################',
    ],
    warps: { '11,14': { map: 'archive', x: 3, y: 8, dir: 'up' } },
  },
};

const CAST = {
  r2: {
    map: 'springs', mentor: ['Dalia', 'dalia'], keeper: ['Oren', 'oren'], lock: ['Sluice stone', 'read the sluice stone'], ward: ['Moss-bound seal', 'name', 'try the moss-bound seal'],
    sign: 'The sluice bridge lifts for readers who have learned the springs. Dalia keeps the house east of the path.',
    folk: ['Spring warden', 'Each pool here sounds a little different. Dalia says the small marks under the letters are why. Walk the wet reeds when you are ready.'],
    secret: 'A dry niche holds a bundle of archive labels, still legible. One more shelf of the archive will have its names back.',
  },
  r3: {
    map: 'market', mentor: ['Eitan', 'eitan'], keeper: ['Rut', 'rut'], lock: ['Toll stone', 'read the toll stone'], ward: ['Merchant\'s seal', 'name', 'try the merchant\'s seal'],
    sign: 'Market ward, then the Square, then the Guild ward. Each town gate has its own keeper.',
    folk: ['Stallkeeper', 'A word for sale is no use until you know what it names and how it agrees with its neighbors. Eitan teaches that up by the west wall.'],
    secret: 'Behind the old cistern lies a merchant\'s ledger from the archive. It lists who borrowed which scroll, and it goes back on the shelf.',
  },
  r4: {
    map: 'gorge', mentor: ['Hadas', 'hadas'], keeper: ['Gil', 'gil'], lock: ['Bridge lever', 'work the bridge lever'], ward: ['Rope-tied seal', 'name', 'try the rope-tied seal'],
    sign: 'Two bridges cross this gorge, and each one joins what stands on either side. Hadas keeps the rope house.',
    folk: ['Rope mender', 'Nothing crosses here alone. Every span holds on to the next one. Hadas will show you how the words do it.'],
    secret: 'Tied under a ledge is a sealed case of bridge records, dry after all these years. The archive has wanted them for a long time.',
  },
  r5: {
    map: 'foundry', mentor: ['Yonah', 'yonah'], keeper: ['Talia', 'talia'], lock: ['Furnace lock', 'open the furnace lock'], ward: ['Forge seal', 'name', 'try the forge seal'],
    sign: 'Keep to the walkway. The channel runs hot. Yonah\'s workshop is along the rail to the west.',
    folk: ['Bellows hand', 'Same casting, different fitting at the end, and you get a different piece. Ask Yonah. She loves to explain it.'],
    secret: 'A tool chest holds a set of copper type from the archive press, every piece clean. It goes home with you.',
  },
  r6: {
    map: 'observatory', mentor: ['Shira', 'shira'], keeper: ['Micha', 'micha'], lock: ['Dome dial', 'turn the dome dial'], ward: ['Star-marked seal', 'deed', 'try the star-marked seal'],
    sign: 'Inner ring by the north dial only. The Observatory walls keep the night out. Shira keeps the lower house.',
    folk: ['Night watcher', 'We chart what happens up there: what is done, what goes on happening, what comes next. Words can do that too.'],
    secret: 'A star chart annotated by the archive\'s first scribes is rolled up here. Its margins are full of careful notes.',
  },
  r7: {
    map: 'highlands', mentor: ['Amos', 'amos'], keeper: ['Lea', 'lea'], lock: ['Pass cairn', 'read the pass cairn'], ward: ['Frost-split seal', 'deed', 'try the frost-split seal'],
    sign: 'High pass: stay on the marked way. Amos\'s hut is on the lower switchback, and the cairn holds the upper one.',
    folk: ['Shepherd', 'Same mountain, many paths up. Some are steep and some have lost a stone or two. You still get there if you know the way.'],
    secret: 'Frozen in the back of the cave is a tin of scribes\' notes on the hard forms. They kept every mistake, so you won\'t need to make them.',
  },
  r8: {
    map: 'ruins', mentor: ['Noa', 'noa'], keeper: ['Avi', 'avi'], lock: ['Colonnade door', 'read the colonnade door'], ward: ['Sand-worn seal', 'deed', 'try the sand-worn seal'],
    sign: 'The old road runs north to the archive doors. Noa camps in the first standing house.',
    folk: ['Digger', 'Nobody reads these walls one word at a time. You read the whole line, then the next, and the story carries you.'],
    secret: 'At the back of the cave a storm-tossed scroll case has come to rest, its seal still whole. It is the last one the archive was missing.',
  },
};

export const OBJECTS = [
  { id: 'tamar', kind: 'npc', name: 'Tamar', map: 'scriptorium', x: 5, y: 3, sprite: 'tamar', verb: 'talk to Tamar', role: 'tamar' },
  { id: 'ilana', kind: 'npc', name: 'Ilana', map: 'hall', x: 5, y: 2, sprite: 'ilana', verb: 'talk to Ilana', role: 'ilana' },
  { id: 'neri', kind: 'npc', name: 'Neri', map: 'grove', x: 17, y: 14, sprite: 'neri', verb: 'talk to Neri', role: 'neri', movedTo: { flag: 'neriCleared', x: 19, y: 12 } },
  { id: 'sign-start', kind: 'sign', name: 'Signpost', map: 'grove', x: 13, y: 23, verb: 'read the signpost',
    lines: ['Tamar\'s scriptorium: north, gold door. Reed meadow: east along the path. The bridge: north of the path.'] },
  { id: 'sign-reeds', kind: 'sign', name: 'Reed marker', map: 'grove', x: 27, y: 19, verb: 'read the marker',
    lines: ['Scattered words hide in these reeds. Walk through them slowly.'] },
  { id: 'sign-well', kind: 'sign', name: 'Old marker', map: 'grove', x: 6, y: 21, verb: 'read the marker',
    lines: ['Half worn away: "...the pines here grow straight, all but one..."'] },
  { id: 'riddle-stone', kind: 'riddle', name: 'Riddle stone', map: 'grove', x: 14, y: 11, verb: 'read the riddle stone' },
  { id: 'fragment', kind: 'fragment', name: 'Scroll fragment', map: 'grove', x: 2, y: 21, verb: 'pick up the scroll fragment', hiddenBy: 'fragmentFound' },
];

export const REGION_MAPS = { r1: { outdoor: 'grove', house: 'scriptorium', hall: 'hall' } };

const find = (rows, marks) => {
  const places = {};
  const clean = rows.map((row, y) => [...row].map((tile, x) => {
    if (!marks[tile]) return tile;
    (places[tile] ??= []).push({ x, y });
    return marks[tile];
  }).join(''));
  return { clean, places };
};

// Second pass: each region's maps, doors, gates and cast, with coordinates read off the drawn marks.
const ORDER = Object.keys(OUTDOORS);
for (const [index, id] of ORDER.entries()) {
  const def = OUTDOORS[id];
  const cast = CAST[def.regionId];
  const previous = index ? ORDER[index - 1] : 'grove';
  const out = find(def.rows, { ...OUTDOOR_MARKS, ...def.marks });
  const at = mark => out.places[mark][0];
  const cave = find(CAVES[id], CAVE_MARKS);
  const inCave = mark => cave.places[mark][0];
  const house = `${id}-house`, hall = `${id}-hall`, caveId = `${id}-cave`;
  REGION_MAPS[def.regionId] = { outdoor: id, house, hall, cave: caveId };

  const warpTo = (map, spot, dir) => ({ map, x: spot.x, y: spot.y, dir });
  const key = spot => `${spot.x},${spot.y}`;
  MAPS[id] = {
    title: def.title, regionId: def.regionId, biome: def.biome, outdoor: true, rows: out.clean,
    arrive: at('a'), exitFront: at('y'),
    warps: {
      [key(at('b'))]: warpTo(previous, MAPS[previous].exitFront, 'down'),
      [key(at('d'))]: warpTo(house, { x: 5, y: 7 }, 'up'),
      [key(at('h'))]: warpTo(hall, { x: 5, y: 7 }, 'up'),
      [key(at('n'))]: warpTo(caveId, inCave('i'), 'up'),
      [key(at('u'))]: warpTo(caveId, inCave('y'), 'down'),
    },
  };
  MAPS[previous].exitTo = warpTo(id, at('a'), 'up');
  const leave = spot => ({ '5,8': warpTo(id, spot, 'down'), '6,8': warpTo(id, spot, 'down') });
  MAPS[house] = { title: `${cast.mentor[0]}'s house`, regionId: def.regionId, biome: def.biome, rows: ROOMS[id].house, warps: leave(at('e')), npcFront: { x: 5, y: 3 } };
  MAPS[hall] = { title: `${def.title} hall`, regionId: def.regionId, biome: def.biome, rows: ROOMS[id].hall, warps: leave(at('j')), npcFront: { x: 5, y: 3 } };
  MAPS[caveId] = {
    title: `${def.title} cave`, regionId: def.regionId, biome: def.biome, rows: cave.clean, cave: true,
    warps: Object.fromEntries([...cave.places.x.map(s => [key(s), warpTo(id, at('p'), 'left')]), ...cave.places.z.map(s => [key(s), warpTo(id, at('w'), 'down')])]),
    shortcutFront: inCave('v'),
  };

  const r = def.regionId;
  const place = (map, spot) => ({ map, x: spot.x, y: spot.y, regionId: r });
  OBJECTS.push(
    { id: `${r}-mentor`, kind: 'npc', role: 'mentor', name: cast.mentor[0], sprite: cast.mentor[1], verb: `talk to ${cast.mentor[0]}`, ...place(house, { x: 5, y: 2 }) },
    { id: `${r}-keeper`, kind: 'npc', role: 'keeper', name: cast.keeper[0], sprite: cast.keeper[1], verb: `talk to ${cast.keeper[0]}`, ...place(hall, { x: 5, y: 2 }) },
    { id: `${r}-rival`, kind: 'npc', role: 'rival', name: 'Neri', sprite: 'neri', verb: 'talk to Neri', ...place(id, at('g')), movedTo: { flag: `${r}:rival`, ...at('k') } },
    { id: `${r}-lock`, kind: 'lock', name: cast.lock[0], verb: cast.lock[1], key: `${r}:gate`, hiddenBy: `${r}:gate`, ...place(id, at('l')) },
    { id: `${r}-lectern`, kind: 'lectern', name: 'Reading stand', verb: 'read at the stand', ...place(id, at('m')) },
    { id: `${r}-shrine`, kind: 'shrine', name: 'Old shrine', verb: 'look at the shrine', ...place(id, at('i')) },
    { id: `${r}-sign`, kind: 'sign', name: 'Signpost', verb: 'read the signpost', lines: [cast.sign], ...place(id, at('z')) },
    { id: `${r}-folk`, kind: 'folk', role: 'folk', name: cast.folk[0], sprite: 'folk', verb: `talk to the ${cast.folk[0].toLowerCase()}`, lines: [cast.folk[1]], ...place(id, at('q')) },
    { id: `${r}-ward`, kind: 'ward', name: cast.ward[0], ability: cast.ward[1], verb: cast.ward[2], key: `${r}:ward`, hiddenBy: `${r}:ward`, ...place(caveId, inCave('w')) },
    { id: `${r}-secret`, kind: 'secret', name: 'Hidden cache', verb: 'open the cache', key: `${r}:secret`, hiddenBy: `${r}:secret`, lines: [cast.secret], ...place(caveId, inCave('h')) },
  );
}
MAPS.ruins.exitTo = { map: 'archive', x: 8, y: 8, dir: 'up' };

OBJECTS.push(
  { id: 'restoration', kind: 'restore', name: 'Great reading desk', verb: 'lay the last scroll on the desk', map: 'archive', x: 8, y: 3, regionId: 'r8' },
  { id: 'garden-hedge', kind: 'sign', name: 'Overgrown door', verb: 'look at the door', hiddenBy: 'ending', map: 'archive', x: 3, y: 8, lines: ['Vines hold this door shut. The archive isn\'t finished yet, and neither is whatever lies behind it.'] },
  { id: 'garden-hedge-2', kind: 'sign', name: 'Overgrown door', verb: 'look at the door', hiddenBy: 'ending', map: 'archive', x: 4, y: 8, lines: ['Vines hold this door shut. The archive isn\'t finished yet, and neither is whatever lies behind it.'] },
  { id: 'gardener', kind: 'npc', role: 'gardener', name: 'Tamar', sprite: 'tamar', verb: 'talk to Tamar', map: 'garden', x: 11, y: 10 },
  { id: 'garden-sign', kind: 'sign', name: 'Garden marker', verb: 'read the marker', map: 'garden', x: 13, y: 12, lines: ['Words grow back here. The beds offer what is due, then whatever you want to keep practicing.'] },
);

export const START = { map: 'grove', x: 11, y: 23, dir: 'up' };

export const DOORS = { 1: 'door-w', 2: 'door-m', 3: 'door-e' };
export const DOOR_NAMES = { 'door-w': 'west door', 'door-m': 'middle door', 'door-e': 'east door' };
