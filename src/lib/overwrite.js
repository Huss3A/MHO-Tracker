// Pure helpers for the "overwrite" confirmation (no DOM, no network): summarise a data set and decide
// whether replacing `dest` with `source` would lose information.

/** {count, newest} - newest = latest pull time string ('YYYY/MM/DD HH:MM:SS', sortable as text) or null */
export function summarisePulls(pulls = []) {
  let newest = null;
  for (const p of pulls) if (p?.time && (!newest || p.time > newest)) newest = p.time;
  return { count: pulls.length, newest };
}

/**
 * Replacing `dest` with `source`. risk=true when dest has MORE pulls or a NEWER latest pull than source,
 * i.e. something in dest would be lost. A missing dest (null, e.g. no Drive file yet) never has risk.
 */
export function overwriteRisk(source, dest) {
  const reasons = [];
  if (!dest || !source) return { risk: false, reasons };
  if (dest.count > source.count) reasons.push(`has ${dest.count - source.count} more pull(s) (${dest.count} vs ${source.count})`);
  if (dest.newest && (!source.newest || dest.newest > source.newest)) reasons.push(`has a newer latest pull (${dest.newest} vs ${source.newest || 'none'})`);
  return { risk: reasons.length > 0, reasons };
}
