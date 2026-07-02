import { useFetch } from '../hooks/useFetch';
import { computeWcAccuracy, recentCorrectPredictions } from '../utils/wcAccuracy';

// Landing-page hero. Leads with the live, self-updating model accuracy — the
// single strongest credibility signal MatchIQ has — then a strip of recent
// correct calls, headline stats, and a plain-English "how it works" line.
// Everything is derived from the real /api/wc payload via the shared accuracy
// helper, so the number here always matches the Stats tab.

export default function MatchIQHero() {
  const { data, loading } = useFetch('/api/wc/tournament');

  const { pctRight, total, exact, correct } = data ? computeWcAccuracy(data) : {};
  const recents = data ? recentCorrectPredictions(data, 4) : [];
  const hasStats = !loading && total > 0;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 16,
          border: '1px solid var(--border)',
          background:
            'radial-gradient(120% 140% at 50% -20%, rgba(219,161,17,0.16) 0%, rgba(3,70,148,0.10) 40%, var(--surface) 75%)',
          padding: '34px 20px 28px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 11, letterSpacing: 3, fontWeight: 700,
            color: 'var(--gold)', marginBottom: 14,
          }}
        >
          ⚡ AI FOOTBALL PREDICTIONS
        </div>

        {hasStats ? (
          <>
            <div
              style={{
                fontFamily: 'Bebas Neue, sans-serif',
                fontSize: 88, lineHeight: 0.9, letterSpacing: 1,
                color: 'var(--text)',
                textShadow: '0 0 40px rgba(219,161,17,0.25)',
              }}
            >
              {pctRight}<span style={{ fontSize: 44, color: 'var(--gold)' }}>%</span>
            </div>
            <div
              style={{
                fontSize: 12, letterSpacing: 2.5, fontWeight: 700,
                color: 'var(--text-muted)', marginTop: 6,
              }}
            >
              PREDICTION ACCURACY
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              World Cup 2026 · <strong style={{ color: 'var(--text)' }}>{exact + correct}/{total}</strong> results called correctly
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                fontFamily: 'Bebas Neue, sans-serif',
                fontSize: 52, lineHeight: 1, letterSpacing: 1,
                color: 'var(--text)', maxWidth: 440, margin: '0 auto',
              }}
            >
              PREDICT THE BEAUTIFUL GAME
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
              A Dixon-Coles + ELO model that forecasts every match — free.
            </div>
          </>
        )}

        {/* Recent correct calls */}
        {recents.length > 0 && (
          <div
            style={{
              display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
              gap: 6, marginTop: 20,
            }}
          >
            {recents.map((r, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11, fontWeight: 600,
                  color: 'var(--text-muted)',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 999, padding: '4px 10px',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.home} <strong style={{ color: 'var(--text)' }}>{r.homeGoals}-{r.awayGoals}</strong> {r.away}{' '}
                <span style={{ color: r.exact ? 'var(--gold)' : 'var(--green)' }}>
                  {r.exact ? '✓ exact' : '✓'}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      {hasStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
          <StatCard value={`${pctRight}%`} label="ACCURACY" accent="var(--gold)" />
          <StatCard value={total}          label="GAMES CALLED" />
          <StatCard value={exact}          label="EXACT SCORES" accent="var(--green)" />
        </div>
      )}

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginTop: 12, padding: '12px 14px',
          borderRadius: 12, border: '1px solid var(--border)',
          background: 'var(--surface)',
          fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5,
        }}
      >
        <span style={{ fontSize: 18 }}>🧠</span>
        <span>
          Every forecast is built from a <strong style={{ color: 'var(--text)' }}>Dixon-Coles Poisson</strong> model on top of a
          live <strong style={{ color: 'var(--text)' }}>ELO rating</strong> engine trained on 49,000+ international results. No vibes — just maths.
        </span>
      </div>
    </div>
  );
}

function StatCard({ value, label, accent }) {
  return (
    <div
      style={{
        borderRadius: 12, border: '1px solid var(--border)',
        background: 'var(--surface)', padding: '14px 8px', textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, lineHeight: 1,
          color: accent ?? 'var(--text)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 9.5, letterSpacing: 1, fontWeight: 700, color: 'var(--text-muted)', marginTop: 5 }}>
        {label}
      </div>
    </div>
  );
}
