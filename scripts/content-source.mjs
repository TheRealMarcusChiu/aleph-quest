// Read-only access to the pinned research XML. Strings are kept byte for byte; only comparison
// keys go through NFC (OSHB warns NFC can disturb Hebrew mark order).
import { readFileSync, existsSync } from 'node:fs';
import { comparisonKey } from '../src/answers.js';

export const CORPUS_PATH = '/tmp/aleph-quest-research/data/Bereshit.xml';
export const STRONG_PATH = '/tmp/aleph-quest-research/data/HebrewStrong.xml';
export const researchAvailable = () => existsSync(CORPUS_PATH) && existsSync(STRONG_PATH);

// Display form: no segmentation slash, cantillation, meteg, paseq or sof pasuq. Marks stay in source order.
export const stripForDisplay = text => text.replace(/\//g, '').replace(/[֑-ֽ֯׀׃ׅׄ]/g, '');
export const pointedKey = text => comparisonKey(text.replace(/\//g, ''), 'pointed');

export function loadCorpus(path = CORPUS_PATH) {
  const xml = readFileSync(path, 'utf8');
  const tokens = [];
  const verses = new Map();
  for (const [, reference, body] of xml.matchAll(/<verse osisID="([^"]+)">([\s\S]*?)<\/verse>/g)) {
    const items = [];
    for (const m of body.matchAll(/<w ([^>]*)>([^<]*)<\/w>|<seg type="([^"]+)"[^>]*>([^<]*)<\/seg>/g)) {
      if (m[1] !== undefined) {
        const attr = name => m[1].match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
        const token = { tokenId: attr('id'), reference, surface: m[2], lemma: attr('lemma'), morph: attr('morph'), index: items.length };
        tokens.push(token);
        items.push({ kind: 'w', ...token });
      } else items.push({ kind: 'seg', type: m[3], text: m[4] });
    }
    verses.set(reference, items);
  }
  return { tokens, verses, byId: new Map(tokens.map(t => [t.tokenId, t])) };
}

export function loadStrong(path = STRONG_PATH) {
  const xml = readFileSync(path, 'utf8');
  const entries = new Map();
  const text = s => s?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  for (const [, id, body] of xml.matchAll(/<entry id="(H\d+)">([\s\S]*?)<\/entry>/g)) {
    const w = body.match(/<w pos="([^"]*)"[^>]*>([^<]*)<\/w>/) ?? body.match(/<w [^>]*>([^<]*)<\/w>/);
    entries.set(id, {
      id,
      pos: w?.length === 3 ? w[1] : null,
      headword: w?.length === 3 ? w[2] : w?.[1],
      source: text(body.match(/<source>([\s\S]*?)<\/source>/)?.[1]),
      meaning: text(body.match(/<meaning>([\s\S]*?)<\/meaning>/)?.[1]),
    });
  }
  return entries;
}
