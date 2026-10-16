// One consistent icon set for the whole game (no emoji): simple rounded line icons on a 24×24 grid,
// drawn in currentColor so CSS decides the colour. icon() returns inline SVG markup.

const P: Record<string, string> = {
  // ---- seasons & world
  petal: '<g fill="currentColor" stroke="none">' + [0, 72, 144, 216, 288].map((a) => `<ellipse cx="12" cy="6.6" rx="3.3" ry="4.4" transform="rotate(${a} 12 12)"/>`).join('') + '</g><circle cx="12" cy="12" r="2.2" fill="#fff3b0" stroke="none"/>',
  sun: '<circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  leaf: '<path d="M5 19C4 11 9 4.5 19.5 4.5 19.5 15 13 20 5 19z" fill="currentColor" stroke="none"/><path d="M5 19C9 15 12.5 11.5 16 8" stroke="rgba(0,0,0,.35)" stroke-width="1.4"/>',
  snow: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="M9.5 4.2 12 6.5l2.5-2.3M9.5 19.8 12 17.5l2.5 2.3M3.4 10.1l3.2.9-.8 3.2M20.6 13.9l-3.2-.9.8-3.2M5.8 10.8 6.6 14l-3.2.9M18.2 13.2 17.4 10l3.2-.9"/>',
  cloud: '<path d="M7 18.5h10.2a4.2 4.2 0 0 0 .5-8.4A6 6 0 0 0 6.3 9.4 4.6 4.6 0 0 0 7 18.5z" fill="currentColor" stroke="none"/>',
  flame: '<path d="M12 21.5c-4 0-6.5-2.8-6.5-6.2 0-3.6 2.6-5.6 3.6-8.8.8 1.6 1.6 2.4 2.6 2.9.3-2.8 1.4-5.2 3.5-7 0 3.7 3.3 6.2 3.3 10.6 0 4.6-2.5 8.5-6.5 8.5z" fill="currentColor" stroke="none"/><path d="M12 21.5c-1.9 0-3-1.3-3-3 0-2 1.6-2.9 2.3-4.8 1.6 1.4 3.7 2.6 3.7 4.8 0 1.7-1.1 3-3 3z" fill="#ffe08a" stroke="none"/>',
  thermo: '<path d="M10 14.2V4.5a2 2 0 0 1 4 0v9.7a4 4 0 1 1-4 0z"/><circle cx="12" cy="17.5" r="1.8" fill="currentColor" stroke="none"/><path d="M12 15.6V8"/>',
  drop: '<path d="M12 3c3.6 4.4 6 7.6 6 10.8A6 6 0 0 1 6 13.8C6 10.6 8.4 7.4 12 3z" fill="currentColor" stroke="none"/>',
  ice: '<path d="M12 2.8 20.5 7.6v8.8L12 21.2 3.5 16.4V7.6z"/><path d="M12 2.8v18.4M3.5 7.6l8.5 5 8.5-5"/>',
  mud: '<ellipse cx="12" cy="15" rx="8.5" ry="4.5" fill="currentColor" stroke="none"/><circle cx="8" cy="9" r="1.6" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8" r="1.1" fill="currentColor" stroke="none"/>',
  wind: '<path d="M3 8.5h11.5a2.8 2.8 0 1 0-2.8-2.8M3 12.5h16.5a2.8 2.8 0 1 1-2.8 2.8M3 16.5h8"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.2A9.6 9.6 0 0 1 12 5c5.5 0 9 7 9 7a16.3 16.3 0 0 1-2.6 3.4M6.6 6.6A16 16 0 0 0 3 12s3.5 7 9 7a8.8 8.8 0 0 0 4.4-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z" fill="currentColor" stroke="none"/>',
  stop: '<path d="M8.2 2.8h7.6l5.4 5.4v7.6l-5.4 5.4H8.2l-5.4-5.4V8.2z" fill="currentColor" stroke="none"/><path d="M8 12h8" stroke="#fff" stroke-width="2.6"/>',
  slow: '<path d="M12 4a8 8 0 1 0 8 8"/><path d="M12 12 7.5 8.5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  weight: '<path d="M6.5 9h11l2.5 11.5H4z" fill="currentColor" stroke="none"/><circle cx="12" cy="6.5" r="2.5"/>',
  sparkle: '<path d="M12 3c.9 4.4 2.6 6.1 7 7-4.4.9-6.1 2.6-7 7-.9-4.4-2.6-6.1-7-7 4.4-.9 6.1-2.6 7-7z" fill="currentColor" stroke="none"/><path d="M19 16.5c.3 1.5.9 2.1 2.4 2.4-1.5.3-2.1.9-2.4 2.4-.3-1.5-.9-2.1-2.4-2.4 1.5-.3 2.1-.9 2.4-2.4z" fill="currentColor" stroke="none"/>',
  // ---- racing
  flag: '<path d="M5 21.5V3.5"/><path d="M5 4h14.5l-2.6 4.8L19.5 13.6H5" fill="none"/><path d="M8.6 4v4.8M12.2 4v4.8M15.8 4v4.8M5 8.8h12.2M10.4 8.8v4.8M14 8.8v4.8M6.8 8.8v4.8" stroke-width="1.2" opacity=".8"/>',
  trophy: '<path d="M7.5 3.5h9v6.2a4.5 4.5 0 0 1-9 0z" fill="currentColor" stroke="none"/><path d="M7.5 5.5H4.5a3 3 0 0 0 3.4 4.3M16.5 5.5h3a3 3 0 0 1-3.4 4.3M12 14.2v3.3M8 21h8M9.5 17.5h5l.8 3.5H8.7z"/>',
  car: '<path d="M2.5 16v-2.4c0-.9.6-1.6 1.4-1.8l3.1-.8 2.7-3a2 2 0 0 1 1.5-.7h4.3a2 2 0 0 1 1.6.8l2.3 2.9 2 .6c.8.2 1.3.9 1.3 1.7V16z" fill="currentColor" stroke="none"/><path d="M8.3 11.1 10.6 8.6h2.6v2.5zM14.6 8.6h.6a1 1 0 0 1 .8.4l1.6 2.1h-3z" fill="rgba(255,255,255,.8)" stroke="none"/><circle cx="7" cy="16.5" r="2.3" fill="#20242e" stroke="currentColor" stroke-width="1.2"/><circle cx="17.5" cy="16.5" r="2.3" fill="#20242e" stroke="currentColor" stroke-width="1.2"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M18.5 7l1.3-1.3"/>',
  // ---- ui
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 20c.6-3.6 3.2-5.6 6.2-5.6s5.6 2 6.2 5.6"/><path d="M15.5 5.3a3.3 3.3 0 0 1 0 6.4M17.6 14.8c2 .7 3.3 2.4 3.6 5.2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/><path d="M8.5 7.5h6"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.6"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" fill="currentColor" stroke="none"/>',
  home: '<path d="M3.5 11 12 3.8l8.5 7.2"/><path d="M5.8 9.4v10.6h12.4V9.4"/><path d="M10 20v-5.5h4V20"/>',
  again: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
  back: '<path d="M19.5 12h-15M10 5.5 3.8 12l6.2 6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m4.5 12.5 4.8 4.8L19.5 7"/>',
  crown: '<path d="M3.5 8 8 11.5 12 5l4 6.5L20.5 8 19 18H5z" fill="currentColor" stroke="none"/>',
  pad: '<path d="M6.5 8h11a4 4 0 0 1 3.8 2.8l1.2 4.2a2.8 2.8 0 0 1-4.9 2.4L15.8 16H8.2l-1.8 1.4A2.8 2.8 0 0 1 1.5 15l1.2-4.2A4 4 0 0 1 6.5 8z"/><path d="M7 10.8v3M5.5 12.3h3"/><circle cx="16" cy="11.2" r=".9" fill="currentColor"/><circle cx="17.8" cy="13" r=".9" fill="currentColor"/>',
  access: '<circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path d="M5 8.5c2.4.7 4.7 1 7 1s4.6-.3 7-1M12 9.5v4.5M12 14l-3.5 6.5M12 14l3.5 6.5"/>',
  music: '<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.5" cy="17.5" r="2.5" fill="currentColor" stroke="none"/><circle cx="16.5" cy="15.5" r="2.5" fill="currentColor" stroke="none"/>',
  burst: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  sign: '<rect x="3.5" y="4" width="17" height="10" rx="2"/><path d="M8 14v7M16 14v7"/>',
  alert: '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17.4v.1"/>',
  plug: '<path d="M7 7l10 10M14.5 4.5l5 5M4.5 14.5l5 5M9 9 5.5 12.5a3.5 3.5 0 0 0 5 5L14 14"/>',
  exit: '<path d="M14.5 4.5h4v15h-4M10 8l-4 4 4 4M6 12h9"/>',
  left: '<path d="M15 5 8 12l7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M5 15l7-7 7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
};

export type IconName = keyof typeof P;

/** inline SVG for an icon; sized 1em so font-size controls it */
export function icon(name: string, cls = ''): string {
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;
}

/** the season icons, in season order (spring, summer, autumn, winter) */
export const SEASON_ICONS = ['petal', 'sun', 'leaf', 'snow'];

/** draw an icon into a 2D canvas (async: SVG goes through an Image) */
export function drawIcon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, color: string): Promise<void> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" color="${color}">${(P[name] ?? '').replace(/currentColor/g, color)}</svg>`;
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, x, y, size, size); res(); };
    img.onerror = () => res();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
