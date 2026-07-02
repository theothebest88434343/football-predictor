import { useFetch } from '../hooks/useFetch';
import { computeWcAccuracy, recentCorrectPredictions } from '../utils/wcAccuracy';

// Landing hero — editorial spacing and headline, with accuracy shown as a quiet
// proof chip plus a thin line of recent correct calls. MatchIQ is framed as a
// multi-competition platform; the World Cup accuracy is a credibility signal,
// not the centrepiece.

export default function MatchIQHero() {
  const { data } = useFetch('/api/wc/tournament');
  const acc = data ? computeWcAccuracy(data) : {};
  const hasStats = acc.total > 0;
  const called = hasStats ? acc.exact + acc.correct : 0;
  const recents = data ? recentCorrectPredictions(data, 3) : [];

  return (
    <div style={{ textAlign: 'center', padding: '48px 0 30px' }}>
      <h1
        style={{
          fontFamily: 'Bebas Neue, sans-serif',
          fontSize: 60, lineHeight: 0.95, letterSpacing: 1.5,
          color: 'var(--text)', margin: 0,
        }}
      >
        Football, predicted.
      </h1>
      <p
        style={{
          fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6,
          maxWidth: 400, margin: '14px auto 0',
        }}
      >
        Data-driven match forecasts for every major competition — updated after every game.
      </p>

      {hasStats && (
        <div
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            marginTop: 22, padding: '7px 14px',
            borderRadius: 999, border: '1px solid var(--border)',
            background: 'var(--surface)', fontSize: 12.5,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
          <span style={{ color: 'var(--text)', fontWeight: 700 }}>{acc.pctRight}% accuracy</span>
          <span style={{ color: 'var(--text-muted)' }}>· {called}/{acc.total} called at the World Cup</span>
        </div>
      )}

      {recents.length > 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.8 }}>
          Recent calls:{' '}
          {recents.map((r, i) => (
            <span key={i} style={{ whiteSpace: 'nowrap' }}>
              {r.home} <span style={{ color: 'var(--text)' }}>{r.homeGoals}-{r.awayGoals}</span> {r.away}
              <span style={{ color: 'var(--green)' }}> ✓</span>
              {i < recents.length - 1 && <span style={{ opacity: 0.4 }}>{'  ·  '}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
