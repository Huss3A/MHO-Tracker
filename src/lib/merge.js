// Position-aware merging. Several pulls can legitimately share (banner, time, name) - e.g. two
// "Horn" in one 10-pull - so identity is the ORDERED sequence of rows inside a (banner, time)
// group, never the row content alone. Overlapping screenshots are aligned by sequence overlap;
// when page numbers prove two chunks are adjacent pages, they are treated as disjoint.

const same = (a, b) => a.name === b.name && a.type === b.type;

/** merge an incoming slice of a timestamp-group into the stored sequence. */
export function mergeGroup(stored, incoming, hint = {}) {
  if (!stored.length) return { seq: incoming.map((p) => ({ ...p })), conflict: false };
  const n = stored.length, m = incoming.length;
  let d, conflict = false;
  if (hint.after) d = n;
  else if (hint.before) d = -m;
  else {
    let best = null;
    for (let off = -(m - 1); off <= n - 1; off++) {          // overlapping alignments only
      let ok = true, ov = 0;
      for (let i = 0; i < m; i++) {
        const j = off + i;
        if (j < 0 || j >= n) continue;
        ov++;
        if (!same(stored[j], incoming[i])) { ok = false; break; }
      }
      if (ok && ov > 0) {
        // prefer more overlap; then the alignment that adds the fewest rows
        const added = Math.max(n, off + m) - Math.min(0, off) - n;
        if (!best || ov > best.ov || (ov === best.ov && added < best.added)) best = { off, ov, added };
      }
    }
    if (best) d = best.off;
    else {                                                    // no consistent overlap: append by page order, flag it
      const sp = stored[stored.length - 1].page, ip = incoming[0].page;
      d = ip != null && sp != null && ip < sp ? -m : n;
      conflict = true;
    }
  }
  const lo = Math.min(0, d), hi = Math.max(n, d + m), seq = [];
  for (let pos = lo; pos < hi; pos++) {
    const s = pos >= 0 && pos < n ? stored[pos] : null;
    const inc = pos - d >= 0 && pos - d < m ? incoming[pos - d] : null;
    seq.push(s ? s : { ...inc });
  }
  return { seq, conflict };
}

const keyOf = (p) => p.banner + '|' + p.time;
const gather = (pulls) => {
  const g = new Map();
  for (const p of pulls) { const k = keyOf(p); if (!g.has(k)) g.set(k, []); g.get(k).push(p); }
  for (const arr of g.values()) arr.sort((a, b) => a.idx - b.idx);
  return g;
};
const flatten = (g) => {
  const out = [];
  for (const arr of g.values()) arr.forEach((p, i) => out.push({ ...p, idx: i }));
  return out;
};

/** add one screenshot (rows in table order) for a banner. returns {pulls, added, conflicts} */
export function mergeChunk(pulls, banner, page, rows, rowsPerPage = 5) {
  const g = gather(pulls);
  const before = pulls.length;
  let conflicts = 0;
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1].time === rows[i].time) j++;
    const time = rows[i].time;
    const inc = rows.slice(i, j + 1).map((r) => ({ banner, time, idx: 0, type: r.type, name: r.name, rarity: r.rarity, page, row: r.row }));
    const stored = g.get(banner + '|' + time) || [];
    const hint = {};
    const full = rows.length === rowsPerPage;
    if (page != null && stored.length) {
      const last = stored[stored.length - 1], first = stored[0];
      if (i === 0 && page > 1 && last.page === page - 1 && last.row === rowsPerPage - 1) hint.after = true;
      if (j === rows.length - 1 && full && first.page === page + 1 && first.row === 0) hint.before = true;
    }
    const res = mergeGroup(stored, inc, hint);
    if (res.conflict) conflicts++;
    g.set(banner + '|' + time, res.seq);
    i = j + 1;
  }
  const out = flatten(g);
  return { pulls: out, added: out.length - before, conflicts };
}

/** merge two complete pull lists (JSON import / Drive sync). */
export function mergePulls(a, b) {
  const ga = gather(a), gb = gather(b);
  for (const [k, arr] of gb) {
    const res = mergeGroup(ga.get(k) || [], arr);
    ga.set(k, res.seq);
  }
  return flatten(ga);
}

/** newest first; within a timestamp keep table order */
export const sortDisplay = (pulls) =>
  [...pulls].sort((x, y) => (x.time < y.time ? 1 : x.time > y.time ? -1 : x.idx - y.idx));
