'use strict';
// core/db/predictions.js
// ─── Supabase source-of-truth layer for the predictions system ────────────────
//
// RULES:
//   - All reads and writes for predictions / seasons / league_rounds go here.
//   - No in-memory history arrays. No blob saves. No file fallbacks.
//   - Every write is idempotent (UNIQUE constraints + ignoreDuplicates / WHERE gates).
//   - Callers pass `supabase` and `seasonId`; functions no-op if either is null.

// ── Canonical match identity ──────────────────────────────────────────────────
//
// match_uid = "<seasonCode>:<leagueId>:<normHome>:<normAway>"
//
// Design principles:
//   • Uses season CODE (e.g. "2025-26"), not the DB UUID — human-readable + stable
//   • Uses normalized team NAME, not any API's numeric ID — survives FPL/FD renumbering
//   • Does NOT include kickoff — survivesa postponements (each team pair meets once per
//     league season, so the pair alone is provably unique within a season + league)
//   • The same normalization runs in JS (here) and SQL (normalize_team_name function)
//     so backfill and application code always produce identical strings

// Strip trailing FC / AFC / SC suffixes, collapse spaces, lowercase.
// Must match the SQL function `normalize_team_name` in the DB migration.
function normalizeTeamName(name) {
  if (!name) return '';
  return name
    .replace(/\s*(f\.?c\.?|a\.?f\.?c\.?|s\.?c\.?|c\.?f\.?)$/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

// Build the deterministic match_uid for a real-world fixture.
// Callers: upsertPredictions payload, stored-prediction lookup, dedup key.
function buildMatchUid(seasonCode, leagueId, homeTeamName, awayTeamName) {
  return [
    seasonCode,
    leagueId,
    normalizeTeamName(homeTeamName),
    normalizeTeamName(awayTeamName),
  ].join(':');
}

// ── Season ────────────────────────────────────────────────────────────────────

function computeSeasonCode() {
  const now  = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(2)}`;
}

// Get or create the season row for the current code.
// Returns { id, code } or null when Supabase is unavailable.
async function getOrCreateSeason(supabase) {
  if (!supabase) return null;
  const code = computeSeasonCode();

  // Find existing row
  const { data: existing } = await supabase
    .from('seasons')
    .select('id, code, is_current')
    .eq('code', code)
    .maybeSingle();

  if (existing) {
    // Ensure is_current flag is set (may be false after a past rollover)
    if (!existing.is_current) {
      await supabase.from('seasons').update({ is_current: false }).neq('code', code);
      await supabase.from('seasons').update({ is_current: true }).eq('id', existing.id);
    }
    return { id: existing.id, code: existing.code };
  }

  // New season: clear old current flag, insert new row
  await supabase.from('seasons').update({ is_current: false }).eq('is_current', true);
  const { data: created, error } = await supabase
    .from('seasons')
    .insert({ code, is_current: true })
    .select('id, code')
    .single();

  if (error) throw new Error(`[db/seasons] Failed to create season '${code}': ${error.message}`);
  console.log(`[db/seasons] Created new season: ${code}`);
  return { id: created.id, code: created.code };
}

// ── Round ID helpers ──────────────────────────────────────────────────────────
// Single translation point. external_round_id is always an opaque string —
// never increment, never sort numerically.

function extractRoundId(leagueId, fixture) {
  if (leagueId === 'premier-league') return String(fixture.event);
  return String(fixture.matchday);
}

function buildRoundDisplayLabel(leagueId, roundId) {
  if (leagueId === 'premier-league') return `Gameweek ${roundId}`;
  return `Matchday ${roundId}`;
}

// ── Predictions: writes ───────────────────────────────────────────────────────

// Bulk upsert with ignoreDuplicates — UNIQUE(season_id, league_id, external_round_id, fixture_id)
// is the idempotency constraint. Safe to call multiple times for the same fixtures.
//
// rows: Array<{ leagueId, roundId, fixtureId, kickoff, homeTeam, awayTeam, prediction }>
// rows: Array<{ leagueId, roundId, fixtureId, kickoff, homeTeam, awayTeam, prediction, matchUid }>
// matchUid is required — build it with buildMatchUid() before calling.
async function upsertPredictions(supabase, seasonId, rows) {
  if (!supabase || !seasonId || !rows.length) return;
  const payload = rows.map(r => ({
    season_id:         seasonId,
    league_id:         r.leagueId,
    external_round_id: r.roundId,
    fixture_id:        String(r.fixtureId),
    kickoff:           r.kickoff,
    home_team:         r.homeTeam,
    away_team:         r.awayTeam,
    prediction:        r.prediction,
    match_uid:         r.matchUid,  // canonical identity — UNIQUE constraint target
  }));

  // match_uid is the SOLE identity key. ignoreDuplicates: true means an existing
  // prediction (including settled rows) is never overwritten.
  const { error } = await supabase.from('predictions').upsert(payload, {
    onConflict: 'match_uid',
    ignoreDuplicates: true,
  });

  if (error) console.warn('[db/upsertPredictions]', error.message);
}

// Update the fixture_id stored for a prediction — called when FPL renumbers an
// existing fixture (season rollover). Keeps the row identifiable by the current
// FPL ID so autoFillResults can settle it on the next cycle.
async function updateFixtureId(supabase, id, newFixtureId) {
  if (!supabase) return;
  const { error } = await supabase.from('predictions')
    .update({ fixture_id: String(newFixtureId) })
    .eq('id', id);
  if (error) console.warn('[db/updateFixtureId]', id, error.message);
}

// Settle a single prediction by its DB uuid.
// WHERE result IS NULL is the idempotency gate — safe to call multiple times.
async function settleResult(supabase, id, homeGoals, awayGoals) {
  if (!supabase) return;
  const settledAt = new Date().toISOString();
  const { error } = await supabase.from('predictions')
    .update({ result: { homeGoals, awayGoals, settledAt }, settled_at: settledAt })
    .eq('id', id)
    .is('result', null);
  if (error) console.warn('[db/settleResult]', id, error.message);
}

// Update kickoff timestamp (e.g. when FPL provides a corrected kickoff_time)
async function updateKickoff(supabase, id, kickoff) {
  if (!supabase || !kickoff) return;
  const { error } = await supabase.from('predictions').update({ kickoff }).eq('id', id);
  if (error) console.warn('[db/updateKickoff]', id, error.message);
}

// ── Predictions: reads ────────────────────────────────────────────────────────

// Unsettled predictions for this season + optional league filter
async function getUnsettledPredictions(supabase, seasonId, leagueId) {
  if (!supabase || !seasonId) return [];
  let q = supabase.from('predictions')
    .select('id, match_uid, league_id, external_round_id, fixture_id, kickoff, home_team, away_team, prediction')
    .eq('season_id', seasonId)
    .is('result', null);
  if (leagueId) q = q.eq('league_id', leagueId);
  const { data, error } = await q;
  if (error) { console.warn('[db/getUnsettledPredictions]', error.message); return []; }
  return data ?? [];
}

// Settled predictions for this season + league (accuracy routes)
async function getSettledPredictions(supabase, seasonId, leagueId) {
  if (!supabase || !seasonId) return [];
  let q = supabase.from('predictions')
    .select('id, league_id, external_round_id, fixture_id, kickoff, home_team, away_team, prediction, result, predicted_at')
    .eq('season_id', seasonId)
    .not('result', 'is', null);
  if (leagueId) q = q.eq('league_id', leagueId);
  const { data, error } = await q;
  if (error) { console.warn('[db/getSettledPredictions]', error.message); return []; }
  return data ?? [];
}

// All predictions (settled + unsettled) for this season + league
async function getAllPredictions(supabase, seasonId, leagueId) {
  if (!supabase || !seasonId) return [];
  let q = supabase.from('predictions')
    .select('id, league_id, external_round_id, fixture_id, kickoff, home_team, away_team, prediction, result, predicted_at')
    .eq('season_id', seasonId);
  if (leagueId) q = q.eq('league_id', leagueId);
  const { data, error } = await q.order('kickoff', { ascending: false });
  if (error) { console.warn('[db/getAllPredictions]', error.message); return []; }
  return data ?? [];
}

// Map a DB snake_case row to the camelCase shape the client expects.
// Keep backward compat: gameweek is still a Number, fixtureId is a Number.
function rowToCamel(row) {
  return {
    id:         row.id,
    fixtureId:  Number(row.fixture_id),
    league:     row.league_id,
    gameweek:   Number(row.external_round_id),
    kickoff:    row.kickoff,
    homeTeam:   row.home_team,
    awayTeam:   row.away_team,
    prediction: row.prediction,
    result:     row.result ?? null,
    trackedAt:  row.predicted_at,
  };
}

// ── Round completion ──────────────────────────────────────────────────────────

const FULL_TIME_BUFFER_MS   = 110 * 60 * 1000;         // 110 min — 90 min + stoppage
const POSTPONEMENT_GRACE_MS = 14 * 24 * 60 * 60 * 1000; // 14-day orphan grace

// Reads predictions from DB, detects complete rounds, marks them in league_rounds.
// All DB operations are idempotent — safe to call on every cron cycle.
//
// cache: the app-level cache Map (used to bust season_accuracy_* on completion).
async function detectAndCompleteRounds(supabase, leagueId, seasonId, cache) {
  if (!supabase || !seasonId) return;

  const isPL = leagueId === 'premier-league';
  const now  = Date.now();

  // Read from DB — never from in-memory history
  const allPreds = await getAllPredictions(supabase, seasonId, leagueId);
  if (!allPreds.length) return;

  // Group by external_round_id (opaque string — no numeric assumptions)
  const byRound = new Map();
  for (const p of allPreds) {
    const roundId = p.external_round_id;
    if (!byRound.has(roundId)) byRound.set(roundId, []);
    byRound.get(roundId).push(p);
  }

  const toComplete = [];
  for (const [roundId, preds] of byRound) {
    if (isPL && roundId === '1') continue; // skip PL warm-up round

    // Only consider fixtures whose kickoff has passed + 110-min buffer
    const pastPreds = preds.filter(p => {
      const ko = p.kickoff ? new Date(p.kickoff).getTime() : 0;
      return ko > 0 && ko + FULL_TIME_BUFFER_MS < now;
    });
    if (pastPreds.length === 0) continue; // round not yet evaluable

    // Round is complete when every past fixture is either settled or orphaned (14-day grace)
    const allResolved = pastPreds.every(p => {
      if (p.result != null) return true;
      const ko = p.kickoff ? new Date(p.kickoff).getTime() : 0;
      return ko > 0 && now - ko > POSTPONEMENT_GRACE_MS;
    });
    if (!allResolved) continue;

    const kickoffs = preds.map(p => p.kickoff).filter(Boolean).sort();
    toComplete.push({
      roundId,
      earliest: kickoffs[0]     ?? null,
      latest:   kickoffs.at(-1) ?? null,
    });
  }

  if (!toComplete.length) return;

  // Upsert round rows so they exist before we complete them.
  // ignoreDuplicates: true — never downgrade a completed row back to upcoming.
  await supabase.from('league_rounds').upsert(
    toComplete.map(({ roundId, earliest, latest }) => ({
      league_id:         leagueId,
      season_id:         seasonId,
      external_round_id: roundId,
      display_label:     buildRoundDisplayLabel(leagueId, roundId),
      earliest_kickoff:  earliest,
      latest_kickoff:    latest,
      status:            'upcoming',
    })),
    { onConflict: 'league_id,season_id,external_round_id', ignoreDuplicates: true }
  );

  // Atomically mark each round completed.
  // .neq('status', 'completed') is the idempotency gate — no-op if already done.
  for (const { roundId } of toComplete) {
    const { data: updated } = await supabase.from('league_rounds')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('league_id', leagueId)
      .eq('season_id', seasonId)
      .eq('external_round_id', roundId)
      .neq('status', 'completed')
      .select('external_round_id');

    if (updated?.length) {
      // Exactly one process per round reaches this branch — no double-fire
      if (cache) cache.delete(`season_accuracy_${leagueId}`);
      console.log(`[GW Engine] ${leagueId} / Round ${roundId} completed — accuracy cache cleared`);
    }
  }
}

// Completed rounds for this league+season, ordered by completion time (not round number).
// Brazil-safe: rounds that completed out of order sort by real completed_at, not matchday.
async function getCompletedRounds(supabase, seasonId, leagueId) {
  if (!supabase || !seasonId) return [];
  const { data, error } = await supabase.from('league_rounds')
    .select('external_round_id, display_label, completed_at, earliest_kickoff')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });
  if (error) { console.warn('[db/getCompletedRounds]', error.message); return []; }
  return data ?? [];
}

// Earliest upcoming/in_progress round for this league+season (live fallback)
async function getCurrentRound(supabase, seasonId, leagueId) {
  if (!supabase || !seasonId) return null;
  const { data, error } = await supabase.from('league_rounds')
    .select('external_round_id, display_label, earliest_kickoff, status')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .in('status', ['upcoming', 'in_progress'])
    .order('earliest_kickoff', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) { console.warn('[db/getCurrentRound]', error.message); return null; }
  return data ?? null;
}

module.exports = {
  normalizeTeamName,
  buildMatchUid,
  computeSeasonCode,
  getOrCreateSeason,
  extractRoundId,
  buildRoundDisplayLabel,
  upsertPredictions,
  settleResult,
  updateKickoff,
  updateFixtureId,
  getUnsettledPredictions,
  getSettledPredictions,
  getAllPredictions,
  rowToCamel,
  detectAndCompleteRounds,
  getCompletedRounds,
  getCurrentRound,
};
