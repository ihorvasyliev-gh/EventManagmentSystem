import React from 'react';

interface HighlightProps {
  text: string;
  /** The words searched for; nothing is marked without them */
  query?: string;
  /**
   * For text shown on one line: when the match is further in than the line shows, the text starts
   * a few words before it instead, so the reason an event was found is on screen
   */
  snippet?: boolean;
}

/** How far in a match can be and still show on a one-line description */
const SNIPPET_AFTER = 40;
const SNIPPET_LEAD = 24;

/** Text with the searched words marked in it (the same match as the search: any case, as typed) */
const Highlight: React.FC<HighlightProps> = ({ text, query, snippet = false }) => {
  const needle = query?.trim().toLowerCase();
  if (!needle) return <>{text}</>;
  let shown = text;
  const first = text.toLowerCase().indexOf(needle);
  if (first === -1) return <>{text}</>;
  if (snippet && first > SNIPPET_AFTER) {
    // From the start of a word, a little before the match
    const from = text.lastIndexOf(' ', first - SNIPPET_LEAD);
    if (from > 0) shown = `…${text.slice(from + 1)}`;
  }

  const parts: React.ReactNode[] = [];
  const lower = shown.toLowerCase();
  let at = 0;
  for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, at)) {
    if (i > at) parts.push(shown.slice(at, i));
    at = i + needle.length;
    parts.push(
      <mark key={i} className="rounded-sm bg-amber-200 text-slate-900 dark:bg-amber-300 dark:text-slate-900 [box-decoration-break:clone] px-0.5 -mx-0.5">
        {shown.slice(i, at)}
      </mark>
    );
  }
  if (at < shown.length) parts.push(shown.slice(at));
  return <>{parts}</>;
};

export default Highlight;
