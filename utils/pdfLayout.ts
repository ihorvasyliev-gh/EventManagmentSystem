/**
 * Page layout for the digest PDF: splits a list of measured blocks into pages
 * without drawing anything, so the generator can try a few densities first and
 * keep the one that doesn't leave a large gap at the bottom of a page.
 */

export interface LayoutBlock {
  h: number;
  /** Must stay on the same page as the next block (headers) */
  keepWithNext?: boolean;
  /** Day the block belongs to (cards), used to repeat the day header after a page break */
  dayKey?: string;
  isDayHeader?: boolean;
}

export interface PageMetrics<B extends LayoutBlock> {
  /** Where the list starts on page 1 (below the hero / calendar) */
  firstTop: number;
  /** Where the list starts on continuation pages */
  pageTop: number;
  pageBottom: number;
  /** Extra space after `block` when `next` follows it */
  gapAfter?: (block: B, next: B | undefined) => number;
  /** Header repeated at the top of a page when a day carries over onto it */
  continued?: (dayKey: string) => B;
}

export interface Placement<B> {
  block: B;
  y: number;
}

export interface PageLayout<B> {
  pages: Placement<B>[][];
  /** Unused space at the bottom of each page that is followed by another page */
  gaps: number[];
}

export const paginate = <B extends LayoutBlock>(blocks: B[], m: PageMetrics<B>): PageLayout<B> => {
  const pages: Placement<B>[][] = [[]];
  const gaps: number[] = [];
  let y = m.firstTop;
  let currentDay = '';

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    // Height that must fit together (headers stay with the first card that follows)
    let needed = block.h;
    for (let j = i; blocks[j]?.keepWithNext && j + 1 < blocks.length; j++) needed += blocks[j + 1].h;

    const page = pages[pages.length - 1];
    // A block taller than a whole page is placed anyway rather than pushed on forever
    const freshPage = pages.length > 1 && page.length === 0;
    if (y + needed > m.pageBottom && !freshPage) {
      gaps.push(Math.max(0, m.pageBottom - y));
      pages.push([]);
      y = m.pageTop;
      // A day that continues onto this page gets its header repeated
      if (m.continued && !block.isDayHeader && block.dayKey && block.dayKey === currentDay) {
        const cont = m.continued(block.dayKey);
        pages[pages.length - 1].push({ block: cont, y });
        y += cont.h;
      }
    }
    if (block.isDayHeader && block.dayKey) currentDay = block.dayKey;
    pages[pages.length - 1].push({ block, y });
    y += block.h + (m.gapAfter?.(block, blocks[i + 1]) ?? 0);
  }

  return { pages, gaps };
};

/** Gaps smaller than this are normal page ends and not worth tightening the layout for */
export const TOLERATED_GAP = 25;

/**
 * Picks which of several layouts (ordered from most to least spacious) to use:
 * the roomiest one, unless a tighter one needs fewer pages or closes up a gap
 * of more than TOLERATED_GAP at the bottom of a page.
 */
export const pickLayout = <B>(layouts: PageLayout<B>[]): number => {
  const worstGap = (l: PageLayout<B>) => Math.max(0, ...l.gaps);
  let best = 0;
  for (let i = 1; i < layouts.length; i++) {
    const a = layouts[best];
    const b = layouts[i];
    if (b.pages.length < a.pages.length) {
      best = i;
    } else if (
      b.pages.length === a.pages.length &&
      worstGap(a) > TOLERATED_GAP &&
      worstGap(b) < worstGap(a) - TOLERATED_GAP / 2
    ) {
      best = i;
    }
  }
  return best;
};
