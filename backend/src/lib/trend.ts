/**
 * Trend analysis and text summary generation for site scan history (Spec S-24, P2-11).
 */

export type TrendPoint = [string, number, number, boolean?];

export function computeTrendSummary(points: readonly TrendPoint[]): string {
  if (!points || points.length === 0) {
    return 'No scan history available yet.';
  }

  const firstPoint = points[0];
  if (points.length === 1 && firstPoint) {
    const [date, score, open, partial] = firstPoint;
    const openText = `${open} open ${open === 1 ? 'problem' : 'problems'}`;
    const partialText = partial ? ' (partial scan)' : '';
    return `Initial scan on ${date} scored ${score} with ${openText}${partialText}.`;
  }

  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return 'No scan history available yet.';
  }

  const count = points.length;

  let scoreSentence: string;
  if (last[1] > first[1]) {
    scoreSentence = `Score rose from ${first[1]} to ${last[1]} over ${count} scans since ${first[0]}.`;
  } else if (last[1] < first[1]) {
    scoreSentence = `Score dropped from ${first[1]} to ${last[1]} over ${count} scans since ${first[0]}.`;
  } else {
    scoreSentence = `Score steady at ${last[1]} over ${count} scans since ${first[0]}.`;
  }

  let openSentence: string;
  if (last[2] < first[2]) {
    openSentence = `Open problems fell from ${first[2]} to ${last[2]}.`;
  } else if (last[2] > first[2]) {
    openSentence = `Open problems rose from ${first[2]} to ${last[2]}.`;
  } else {
    openSentence = `Open problems remained at ${last[2]}.`;
  }

  const partialScans = points.filter((p) => Boolean(p[3]));
  let partialSentence = '';
  const firstPartial = partialScans[0];
  if (partialScans.length === 1 && firstPartial) {
    partialSentence = `The ${firstPartial[0]} scan was partial.`;
  } else if (partialScans.length > 1) {
    partialSentence = `${partialScans.length} scans were partial.`;
  }

  return [scoreSentence, openSentence, partialSentence].filter(Boolean).join(' ');
}

export function formatScanDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
}
