// ─── League registry ─────────────────────────────────────────────────────────
// Single source of truth for league metadata used across the app.
// flagCode: ISO 3166-1 alpha-2 code for flagcdn.com — null for non-flag icons.

export const LEAGUES = [
  { id: 'world-cup',      name: 'World Cup 2026',  short: 'WC',  emoji: '🏆', flagCode: null,    color: '#b45309', available: true, tournament: true },
  { id: 'premier-league', name: 'Premier League',  short: 'PL',  emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', flagCode: 'gb-eng', color: '#3d0f6e', available: true  },
  { id: 'la-liga',        name: 'La Liga',          short: 'LaL', emoji: '🇪🇸', flagCode: 'es',    color: '#ee2d29', available: true  },
  { id: 'bundesliga',     name: 'Bundesliga',       short: 'BL',  emoji: '🇩🇪', flagCode: 'de',    color: '#d20515', available: true  },
  { id: 'ligue-1',        name: 'Ligue 1',          short: 'L1',  emoji: '🇫🇷', flagCode: 'fr',    color: '#091c3e', available: true  },
  { id: 'serie-a',        name: 'Serie A',          short: 'SA',  emoji: '🇮🇹', flagCode: 'it',    color: '#008c45', available: true  },
  { id: 'brasileirao',    name: 'Brasileirão',      short: 'BSA', emoji: '🇧🇷', flagCode: 'br',    color: '#009c3b', available: true  },
  { id: 'eredivisie',     name: 'Eredivisie',       short: 'ERE', emoji: '🇳🇱', flagCode: 'nl',    color: '#ff6600', available: true  },
  { id: 'primeira-liga',  name: 'Primeira Liga',    short: 'PRL', emoji: '🇵🇹', flagCode: 'pt',    color: '#006600', available: true  },
];

export function getLeague(leagueId) {
  return LEAGUES.find(l => l.id === leagueId) ?? { id: leagueId, name: leagueId, short: '?', emoji: '⚽', flagCode: null, color: '#333', available: false };
}

// ─── LeagueIcon ───────────────────────────────────────────────────────────────
// Mac/iOS: use native emoji (Apple renders them beautifully).
// Everything else (Windows, Android, Linux): use flagcdn.com images.

const isMacOrIOS = typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export function LeagueIcon({ league, size = 24, style = {} }) {
  if (!isMacOrIOS && league.flagCode) {
    return (
      <img
        src={`https://flagcdn.com/w40/${league.flagCode}.png`}
        alt={league.name}
        style={{
          width: size, height: size * 0.67,
          objectFit: 'cover', borderRadius: 2,
          display: 'inline-block', verticalAlign: 'middle',
          ...style,
        }}
      />
    );
  }
  return <span style={{ fontSize: size * 0.75, ...style }}>{league.emoji}</span>;
}

// ─── ComingSoon ───────────────────────────────────────────────────────────────

export function ComingSoon({ leagueId }) {
  const league = getLeague(leagueId);
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px' }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>
        <LeagueIcon league={league} size={56} />
      </div>
      <div style={{
        fontSize: 22, fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif',
        letterSpacing: 2, color: 'var(--text)', marginBottom: 8,
      }}>
        {league.name}
      </div>
      <div className="card" style={{ marginTop: 16, textAlign: 'left' }}>
        <div className="card-title">Coming soon</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Predictions and data for {league.name} are in development.
          <br /><br />
          The Premier League is fully available right now — switch back via the badge in the nav.
        </p>
      </div>
    </div>
  );
}
