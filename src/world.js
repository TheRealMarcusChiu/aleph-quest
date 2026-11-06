// Original tile maps and object placement. Hebrew never appears here: it lives in data/ and renders in the DOM.

// Legend. Solid tiles block walking. '?' looks like a pine but lets you through.
export const SOLID = new Set(['#', 'o', 'r', '~', '^', '|', 'G', '1', '2', '3', 'X', 's', 't', 'W']);
export const REEDS = '"';

export const MAPS = {
  grove: {
    title: 'Letter Grove',
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
  },
  scriptorium: {
    title: "Tamar's scriptorium",
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
    title: 'Hall of Letters',
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
};

export const START = { map: 'grove', x: 11, y: 23, dir: 'up' };

export const DOORS = { 1: 'door-w', 2: 'door-m', 3: 'door-e' };
export const DOOR_NAMES = { 'door-w': 'west door', 'door-m': 'middle door', 'door-e': 'east door' };

export const OBJECTS = [
  { id: 'tamar', kind: 'npc', name: 'Tamar', map: 'scriptorium', x: 5, y: 3, sprite: 'tamar', verb: 'talk to Tamar' },
  { id: 'ilana', kind: 'npc', name: 'Ilana', map: 'hall', x: 5, y: 2, sprite: 'ilana', verb: 'talk to Ilana' },
  { id: 'neri', kind: 'npc', name: 'Neri', map: 'grove', x: 17, y: 14, sprite: 'neri', verb: 'talk to Neri', movedTo: { flag: 'neriCleared', x: 19, y: 12 } },
  { id: 'sign-start', kind: 'sign', name: 'Signpost', map: 'grove', x: 13, y: 23, verb: 'read the signpost',
    lines: ['Tamar\'s scriptorium: north, gold door. Reed meadow: east along the path. The bridge: north of the path.'] },
  { id: 'sign-reeds', kind: 'sign', name: 'Reed marker', map: 'grove', x: 27, y: 19, verb: 'read the marker',
    lines: ['Scattered words hide in these reeds. Walk through them slowly.'] },
  { id: 'sign-well', kind: 'sign', name: 'Old marker', map: 'grove', x: 6, y: 21, verb: 'read the marker',
    lines: ['Half worn away: "...the pines here grow straight, all but one..."'] },
  { id: 'riddle-stone', kind: 'riddle', name: 'Riddle stone', map: 'grove', x: 14, y: 11, verb: 'read the riddle stone' },
  { id: 'fragment', kind: 'fragment', name: 'Scroll fragment', map: 'grove', x: 2, y: 21, verb: 'pick up the scroll fragment' },
];
