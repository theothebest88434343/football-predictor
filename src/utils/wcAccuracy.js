// Single source of truth for World Cup prediction accuracy.
//
// Both the Stats/Accuracy view and the landing-page hero compute their numbers
// from here so they can never drift apart. Given the /api/wc payload, it returns
// aggregate accuracy plus the per-fixture evaluation list.

const PLAYED = ['FT', 'AET', 'PEN'];

function fixtureDate(f) {
  return f.date ?? f.fixture?.date ?? f.fixture?.timestamp ?? null;
}

// Evaluate every played fixture that had a frozen pre-tournament prediction.
// outcome: 'score' (exact) | 'result' (right winner) | 'wrong'
export function computeWcAccuracy(data) {
  const groupFixtures    = data?.groupFixtures ?? [];
  const knockoutFixtures = data?.knockoutFixtures ?? [];
  const allFixtures = [...groupFixtures, ...knockoutFixtures];
  const evaluated = [];

  for (const f of allFixtures) {
    const status = f._statusShort ?? f.fixture?.status?.short ?? 'NS';
    if (!PLAYED.includes(status)) continue;
    const prePred = f._prePrediction;
    if (!prePred) continue;
    const hGoals = f.goals?.home;
    const aGoals = f.goals?.away;
    if (hGoals == null || aGoals == null) continue;

    const [ph, pa] = (prePred.predictedScore ?? '').split('-').map(Number);
    let outcome;
    if (ph === hGoals && pa === aGoals) {
      outcome = 'score';
    } else {
      const predWinner = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
      const realWinner = hGoals > aGoals ? 'H' : hGoals < aGoals ? 'A' : 'D';
      outcome = predWinner === realWinner ? 'result' : 'wrong';
    }
    evaluated.push({ fixture: f, outcome, prePred, hGoals, aGoals });
  }

  const exact   = evaluated.filter(e => e.outcome === 'score').length;
  const correct = evaluated.filter(e => e.outcome === 'result').length;
  const wrong   = evaluated.filter(e => e.outcome === 'wrong').length;
  const total   = evaluated.length;
  const pctRight = total > 0 ? Math.round(((exact + correct) / total) * 100) : null;

  return { evaluated, exact, correct, wrong, total, pctRight };
}

// Most recent correctly-predicted games (exact or right result), newest first.
// Used for the landing-page "recent hits" strip.
export function recentCorrectPredictions(data, limit = 4) {
  const { evaluated } = computeWcAccuracy(data);
  return evaluated
    .filter(e => e.outcome !== 'wrong')
    .sort((a, b) => new Date(fixtureDate(b.fixture) ?? 0) - new Date(fixtureDate(a.fixture) ?? 0))
    .slice(0, limit)
    .map(e => ({
      home:      e.fixture.teams?.home?.name ?? '',
      away:      e.fixture.teams?.away?.name ?? '',
      homeGoals: e.hGoals,
      awayGoals: e.aGoals,
      exact:     e.outcome === 'score',
    }));
}
