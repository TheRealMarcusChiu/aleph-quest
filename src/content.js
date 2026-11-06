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

// Indexes one set of records. The game always plays the real set below; tests may index labeled fixtures.
export const buildContent = data => ({
  ...data,
  wordById: byId(data.words),
  questionById: byId(data.questions),
  lessonById: byId(data.lessons),
  regionById: byId(data.regions),
  questById: byId(data.quests),
  passageById: byId(data.passages),
  sourceById: byId(data.sources),
  questionByStem: new Map(data.questions.map(q => [q.semanticStemId, q])),
});

export const content = buildContent({ words, questions, lessons, regions, quests, passages, sources, attestations });
