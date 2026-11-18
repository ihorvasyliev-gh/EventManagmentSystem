/**
 * An event's description laid out for the digest: its paragraphs with a small gap between
 * them instead of a blank line, "·" / "•" / "-" lists as bullets with a hanging indent, and
 * a long description shortened at the end of a sentence (or at least of a word), never in
 * the middle of one.
 *
 * Pure: the caller passes how text wraps (jsPDF's splitTextToSize in the current font).
 */

export interface DescriptionLine {
  text: string;
  /** First line of a list item: a bullet is drawn before it */
  bullet: boolean;
  /** A list item's line (indented past the bullet) */
  indent: boolean;
  /** Starts a new paragraph or list item after a blank line: a small gap above it */
  gap: boolean;
  /** Index of the paragraph or item it belongs to (lines of one are drawn together, for links split across lines) */
  block: number;
}

export interface DescriptionLayout {
  lines: DescriptionLine[];
  /** Height in lines, the paragraph gaps counted at `gapLines` each */
  height: number;
  /** Something was left out */
  shortened: boolean;
}

interface Block {
  text: string;
  bullet: boolean;
  gap: boolean;
}

// "· 15% of adults", "•Cork", "- item", "* item", "– item": a list item. A dash or star needs
// a space after it, so "-5 degrees" stays as typed
const BULLET = /^(?:[·•●▪◦‣∙]\s*|[-*–—]\s+)(?=\S)/;

/** The description's lines as paragraphs and list items (text already cleaned, newlines kept) */
export const descriptionBlocks = (text: string): Block[] => {
  const blocks: Block[] = [];
  let blank = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      blank = blocks.length > 0;
      continue;
    }
    const bullet = BULLET.test(line);
    blocks.push({ text: bullet ? line.replace(BULLET, '') : line, bullet, gap: blank });
    blank = false;
  }
  return blocks;
};

// The end of a sentence: . ! ? (or a closing quote or bracket after one) before a space
const SENTENCE_END = /[.!?…]['"’”)\]]*(?=\s)/g;

/**
 * The longest start of `text` that wraps to `maxLines` and ends a sentence, when that keeps
 * a fair part of it; otherwise the most whole words that fit with "…".
 */
const shorten = (text: string, wrap: (s: string) => string[], maxLines: number): string[] => {
  const all = wrap(text);
  const fits = (s: string) => wrap(s).length <= maxLines;
  const room = all.slice(0, maxLines).join(' ').length;
  let sentence = '';
  for (const m of text.matchAll(SENTENCE_END)) {
    const end = (m.index ?? 0) + m[0].length;
    if (end > room) break;
    const cut = text.slice(0, end);
    if (fits(`${cut} …`)) sentence = cut;
  }
  if (sentence.length >= room * 0.5) return wrap(`${sentence} …`);
  // Whole words only
  const words = text.split(/\s+/);
  let n = words.length;
  while (n > 1) {
    const cut = words.slice(0, --n).join(' ').replace(/[\s,;:–—-]+$/, '');
    if (fits(`${cut}…`)) return wrap(`${cut}…`);
  }
  return wrap(`${words[0]}…`).slice(0, maxLines);
};

/**
 * Lays out a description in at most `maxLines` lines (paragraph gaps included): in full when
 * it fits, otherwise its first paragraphs, the last one shortened at a sentence's end.
 */
export const layoutDescription = (
  text: string,
  wrap: (s: string, width: number) => string[],
  width: number,
  indent: number,
  maxLines: number,
  gapLines = 0.5
): DescriptionLayout => {
  const lines: DescriptionLine[] = [];
  let height = 0;
  let shortened = false;
  const blocks = descriptionBlocks(text);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const w = b.bullet ? width - indent : width;
    const gap = i > 0 && b.gap ? gapLines : 0;
    let wrapped = wrap(b.text, w);
    const left = Math.floor(maxLines - height - gap + 1e-9);
    if (wrapped.length > left) {
      shortened = true;
      // Not worth starting a paragraph for a line or two of it: end the one before instead
      if (i > 0 && left < 2) {
        markEnd(lines, (s) => wrap(s, lines[lines.length - 1]?.indent ? width - indent : width).length <= 1);
        break;
      }
      wrapped = shorten(b.text, (s) => wrap(s, w), left);
    }
    wrapped.forEach((t, j) => lines.push({ text: t, bullet: b.bullet && j === 0, indent: b.bullet, gap: j === 0 && gap > 0, block: i }));
    height += gap + wrapped.length;
    if (shortened) break;
  }
  return { lines, height, shortened };
};

/** The last paragraph drawn when the ones after it are left out: "…" says there is more */
const markEnd = (lines: DescriptionLine[], fitsOneLine: (s: string) => boolean) => {
  const last = lines[lines.length - 1];
  if (!last || /…$/.test(last.text)) return;
  const words = last.text.trimEnd().split(' ');
  while (words.length > 1 && !fitsOneLine(`${words.join(' ').replace(/[\s,;:–—-]+$/, '')} …`)) words.pop();
  last.text = `${words.join(' ').replace(/[\s,;:–—-]+$/, '')} …`;
};
