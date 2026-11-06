// Single load point for structured content. Runtime logic only reads through this object.
import words from '../data/words.json' with { type: 'json' };
import questions from '../data/questions.json' with { type: 'json' };
import lessons from '../data/lessons.json' with { type: 'json' };
import regions from '../data/regions.json' with { type: 'json' };
import quests from '../data/quests.json' with { type: 'json' };
import passages from '../data/passages.json' with { type: 'json' };
import sources from '../data/sources.json' with { type: 'json' };
import attestations from '../data/attestations.json' with { type: 'json' };

const byId = list => new Map(list.map(item => [item.id, item]));

export const content = {
  words, questions, lessons, regions, quests, passages, sources, attestations,
  wordById: byId(words),
  questionById: byId(questions),
  lessonById: byId(lessons),
  regionById: byId(regions),
  questById: byId(quests),
  passageById: byId(passages),
};
