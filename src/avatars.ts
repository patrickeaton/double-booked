// Simple cartoon avatars, drawn as tiny SVGs: a round face, a hairstyle, dot eyes, a smile, and the odd accessory.

type Hair = 'short' | 'long' | 'bun' | 'bob' | 'curly' | 'ponytail' | 'bald' | 'messy' | 'none';
interface Look { bg: string; skin: string; hair: string; style: Hair; glasses?: boolean; mustache?: boolean; bot?: boolean; shirt?: string }

const LOOKS: Record<string, Look> = {
  margo: { bg: '#ffb199', skin: '#f6cfae', hair: '#c2410c', style: 'bun', shirt: '#ff7a59' },
  theo: { bg: '#a9c0ff', skin: '#8a5a3c', hair: '#1c1917', style: 'short', glasses: true, shirt: '#4f7cff' },
  dana: { bg: '#9fe3d2', skin: '#e2b48c', hair: '#27272a', style: 'bob', glasses: true, shirt: '#14a38b' },
  me: { bg: '#d4d7e3', skin: '#f3cfae', hair: '#6b4226', style: 'messy', shirt: '#8a8fa8' },
  bev: { bg: '#f9c6dc', skin: '#f3d6c1', hair: '#d4d4d8', style: 'curly', glasses: true, shirt: '#e58fb1' },
  wren: { bg: '#d3c6ff', skin: '#c68863', hair: '#7c3aed', style: 'long', shirt: '#7b5cff' },
  sam: { bg: '#ffd8a8', skin: '#f0c08e', hair: '#ca8a04', style: 'short', shirt: '#ff9f1c' },
  kendall: { bg: '#ffc2e0', skin: '#f6d5b8', hair: '#facc15', style: 'ponytail', shirt: '#ff6fb5' },
  gerald: { bg: '#cbd5e1', skin: '#f1cfb4', hair: '#9ca3af', style: 'bald', mustache: true, shirt: '#475569' },
  tobias: { bg: '#bcc6dc', skin: '#d9a066', hair: '#3b2a1a', style: 'short', shirt: '#1f2a44' },
  priya: { bg: '#b6ecc8', skin: '#a86b47', hair: '#111827', style: 'long', shirt: '#2fc463' },
  ana: { bg: '#bcd6ff', skin: '#e8b48f', hair: '#5a3825', style: 'curly', shirt: '#3d8bff' },
  dev: { bg: '#e7c8a8', skin: '#9b6b4a', hair: '#0f0f0f', style: 'short', glasses: true, shirt: '#a86b3c' },
  jules: { bg: '#ffc4c6', skin: '#efc39d', hair: '#3f2a1d', style: 'messy', shirt: '#e5484d' },
  mum: { bg: '#fde68a', skin: '#f2cfb3', hair: '#a1a1aa', style: 'bob', glasses: true, shirt: '#f5c518' },
  ollie: { bg: '#b6ecc8', skin: '#d5a07a', hair: '#f97316', style: 'messy', shirt: '#16a34a' },
  hal: { bg: '#d1d5db', skin: '#e9c2a0', hair: '#6b7280', style: 'bald', mustache: true, shirt: '#6b7280' },
  kai: { bg: '#fef3c7', skin: '#f5d0b0', hair: '#1f2937', style: 'messy', shirt: '#f59e0b' },
  finance: { bg: '#e5e7eb', skin: '#cbd5e1', hair: '#94a3b8', style: 'none', bot: true, shirt: '#64748b' },
};

/** "Bev (People Ops)", "Voicemail · Mum", "Gerald Pemberton" → bev, mum, gerald. */
export function personKey(name: string): string {
  const n = name.replace(/^Voicemail · /, '').trim().toLowerCase();
  if (n === 'you' || n === 'me') return 'me';
  if (n.startsWith('intern')) return 'kai';
  return n.split(/[\s(]/)[0];
}

export const hasAvatar = (name: string) => personKey(name) in LOOKS;

function hairBack(l: Look) {
  const c = l.hair;
  switch (l.style) {
    case 'long': return `<rect x="15" y="20" width="34" height="34" rx="14" fill="${c}"/>`;
    case 'bob': return `<rect x="15" y="18" width="34" height="26" rx="13" fill="${c}"/>`;
    case 'ponytail': return `<ellipse cx="50" cy="32" rx="5" ry="11" fill="${c}"/>`;
    case 'bun': return `<circle cx="32" cy="11" r="6.5" fill="${c}"/>`;
    case 'curly': return [14, 20, 27, 37, 44, 50].map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 19 : 23}" r="6" fill="${c}"/>`).join('');
    default: return '';
  }
}

function hairFront(l: Look) {
  const c = l.hair;
  switch (l.style) {
    case 'short': case 'ponytail': case 'bun': case 'bob': case 'long':
      return `<path d="M17 29 Q17 13 32 13 Q47 13 47 29 Q42 20 32 21 Q22 20 17 29 Z" fill="${c}"/>`;
    case 'messy':
      return `<path d="M17 29 L18 18 L23 21 L26 13 L31 19 L35 12 L38 19 L44 15 L47 29 Q41 21 32 22 Q23 21 17 29 Z" fill="${c}"/>`;
    case 'curly':
      return [20, 26, 32, 38, 44].map((x) => `<circle cx="${x}" cy="18" r="4.5" fill="${c}"/>`).join('');
    case 'bald':
      return `<path d="M17 31 Q16 25 19 23" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M47 31 Q48 25 45 23" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    default: return '';
  }
}

export function avatarSvg(name: string): string | null {
  const l = LOOKS[personKey(name)];
  if (!l) return null;
  const ink = '#1d2033';
  const face = l.bot
    ? `<rect x="18" y="17" width="28" height="26" rx="7" fill="${l.skin}"/><line x1="32" y1="17" x2="32" y2="10" stroke="${ink}" stroke-width="2"/><circle cx="32" cy="9" r="2.5" fill="#ef4444"/>
       <rect x="23" y="26" width="6" height="5" rx="1.5" fill="${ink}"/><rect x="35" y="26" width="6" height="5" rx="1.5" fill="${ink}"/><rect x="25" y="36" width="14" height="2.5" rx="1" fill="${ink}"/>`
    : `${hairBack(l)}<circle cx="32" cy="31" r="15" fill="${l.skin}"/>${hairFront(l)}
       <circle cx="26.5" cy="31" r="1.9" fill="${ink}"/><circle cx="37.5" cy="31" r="1.9" fill="${ink}"/>
       <circle cx="23" cy="36" r="2.2" fill="#ff8a8a" opacity="0.35"/><circle cx="41" cy="36" r="2.2" fill="#ff8a8a" opacity="0.35"/>
       ${l.mustache ? `<path d="M26 38 Q32 35 38 38 Q32 40 26 38 Z" fill="${l.hair}"/>` : `<path d="M27.5 37.5 Q32 41 36.5 37.5" stroke="${ink}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`}
       ${l.glasses ? `<g stroke="${ink}" stroke-width="1.5" fill="none"><circle cx="26.5" cy="31" r="4.3"/><circle cx="37.5" cy="31" r="4.3"/><line x1="30.8" y1="31" x2="33.2" y2="31"/></g>` : ''}`;
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="32" cy="32" r="32" fill="${l.bg}"/>
    <path d="M12 64 Q13 47 32 47 Q51 47 52 64 Z" fill="${l.shirt ?? l.bg}"/>
    ${face}
  </svg>`;
}

/** An avatar element, or null if we don't have a face for this name. */
export function avatarEl(name: string, size = 28, cls = ''): HTMLElement | null {
  const svg = avatarSvg(name);
  if (!svg) return null;
  const el = document.createElement('span');
  el.className = `face ${cls}`;
  el.style.width = el.style.height = `${size}px`;
  el.innerHTML = svg;
  return el;
}
