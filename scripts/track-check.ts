// Dev utility: prints lap length and checks the road ribbon never overlaps itself.
import { buildTrackData } from '../shared/src/track';
import { TRACK } from '../shared/src/constants';
const d = buildTrackData();
const s = d.samples, n = s.length;
console.log('length', d.length.toFixed(0), 'units; ~', (d.length / 28).toFixed(0), 's/lap at 28 u/s');
let minGap = Infinity, where = '';
for (let i = 0; i < n; i += 2) for (let j = 0; j < n; j += 2) {
  const di = Math.min(Math.abs(i - j), n - Math.abs(i - j));
  if (di * d.length / n < 80) continue;
  const g = Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z);
  if (g < minGap) { minGap = g; where = `t=${(i/n).toFixed(3)} vs t=${(j/n).toFixed(3)}`; }
}
console.log('min centre-line gap between distant parts', minGap.toFixed(1), where, '(need >', 2 * TRACK.wallOffset + 4, ')');
// tightest corner radius
let minR = Infinity, rAt = 0;
for (let i = 0; i < n; i++) {
  const a = s[(i - 5 + n) % n], b = s[(i + 5) % n];
  const dAng = Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz));
  const r = (10 * d.length / n) / (dAng || 1e-9);
  if (r < minR) { minR = r; rAt = i / n; }
}
console.log('tightest radius', minR.toFixed(1), 'at t=', rAt.toFixed(3), '(need >', TRACK.wallOffset, ')');
