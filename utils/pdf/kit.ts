/**
 * Drawing helpers for the digest, bound to one jsPDF document: fonts, colours, wrapped and
 * linked text, the site's pill and "leaf" shapes, section labels and category markers.
 */
import type jsPDF from 'jspdf';
import { getCategoryRgb, type Rgb } from '../../constants/categoryColors';
import { FONT_FILES, type Weight } from './fonts';
import { LINKISH_GLOBAL, trimLinkPunctuation, linkUrl, cleanPdfText, cleanUnicodeText } from './text';
import { CATEGORY_SHAPE, BRAND, BRAND_LIGHT, INK, LINK, WHITE } from './theme';

/** Adds the Lato files to the document; false when they couldn't be (the digest then uses Helvetica) */
export const registerLato = (doc: jsPDF, fontData: Record<Weight, string> | null): boolean => {
  let hasLato = false;
  if (fontData) {
    try {
      (Object.keys(FONT_FILES) as Weight[]).forEach((weight) => {
        doc.addFileToVFS(FONT_FILES[weight], fontData[weight]);
        doc.addFont(FONT_FILES[weight], `Lato-${weight}`, 'normal');
      });
      hasLato = true;
    } catch (err) {
      console.warn('Could not register PDF fonts:', err);
    }
  }
  return hasLato;
};

export const createPdfKit = (doc: jsPDF, hasLato: boolean) => {
  const font = (weight: Weight, size: number) => {
    if (hasLato) doc.setFont(`Lato-${weight}`, 'normal');
    else doc.setFont('helvetica', weight === 'regular' ? 'normal' : 'bold');
    doc.setFontSize(size);
  };
  const txt = (s: string | null | undefined, keepNewlines = false) =>
    hasLato ? cleanUnicodeText(s, keepNewlines) : cleanPdfText(s, keepNewlines);

  const color = (rgb: Rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const fill = (rgb: Rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const stroke = (rgb: Rgb, width = 0.25) => {
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    doc.setLineWidth(width);
  };

  /** Letter-spaced small caps label; returns its width */
  const spaced = (text: string, x: number, y: number, spacing = 0.35, align: 'left' | 'right' | 'center' = 'left'): number => {
    const w = doc.getTextWidth(text) + spacing * Math.max(0, text.length - 1);
    const startX = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    doc.text(text, startX, y, { charSpace: spacing });
    return w;
  };

  /** Wraps text to at most `maxLines`, ending the last line with an ellipsis if it was cut */
  const fitLines = (text: string, width: number, maxLines: number): string[] => {
    if (!text) return [];
    const lines: string[] = doc.splitTextToSize(text, width);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && doc.getTextWidth(`${last}…`) > width) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  };

  const truncate = (text: string, width: number): string => fitLines(text, width, 1)[0] || '';

  /**
   * Draws wrapped text with web addresses and emails shown as underlined links.
   * `source` is the unwrapped text, used to rebuild an address split across lines.
   */
  const drawLinkedLines = (lines: string[], source: string, x: number, y: number, lineH: number, base: Rgb) => {
    const full = (source.match(LINKISH_GLOBAL) || []).map(trimLinkPunctuation);
    let carry: string | null = null;
    lines.forEach((line, i) => {
      const ly = y + i * lineH;
      const parts: Array<{ text: string; target: string | null }> = [];
      let rest = line;
      // The tail of an address that wrapped from the previous line
      if (carry) {
        const head = rest.match(/^\S+/)?.[0] ?? '';
        if (head && carry.includes(trimLinkPunctuation(head))) {
          parts.push({ text: head, target: carry });
          rest = rest.slice(head.length);
        }
        carry = null;
      }
      let last = 0;
      for (const m of rest.matchAll(LINKISH_GLOBAL)) {
        const raw = trimLinkPunctuation(m[0]);
        const at = m.index ?? 0;
        if (at > last) parts.push({ text: rest.slice(last, at), target: null });
        const whole = full.find((u) => u.startsWith(raw)) ?? raw;
        parts.push({ text: raw, target: whole });
        last = at + raw.length;
        if (last === rest.trimEnd().length && whole.length > raw.length) carry = whole;
      }
      if (last < rest.length) parts.push({ text: rest.slice(last), target: null });

      let cx = x;
      parts.forEach((part) => {
        const w = doc.getTextWidth(part.text);
        color(part.target ? LINK : base);
        doc.text(part.text, cx, ly);
        if (part.target) {
          stroke(LINK, 0.15);
          doc.line(cx, ly + 0.6, cx + w, ly + 0.6);
          doc.link(cx, ly - 2.6, w, 3.4, { url: linkUrl(part.target) });
        }
        cx += w;
      });
    });
  };

  /** Label or button with the site's nearly square (3px) corners */
  const pill = (x: number, y: number, w: number, h: number, bg: Rgb, border?: Rgb) => {
    fill(bg);
    if (border) {
      stroke(border, 0.2);
      doc.roundedRect(x, y, w, h, 0.8, 0.8, 'FD');
    } else {
      doc.roundedRect(x, y, w, h, 0.8, 0.8, 'F');
    }
  };

  /**
   * The site's "leaf" box: top-left and bottom-right corners rounded, the other two square.
   * `style` null only builds the path (for clipping).
   */
  const leaf = (x: number, y: number, w: number, h: number, r: number, style: 'F' | 'S' | 'FD' | null) => {
    const k = 0.5523 * r; // quarter circle as a Bézier curve
    doc.lines([
      [w - r, 0],
      [0, h - r],
      [0, k, -(r - k), r, -r, r],
      [-(w - r), 0],
      [0, -(h - r)],
      [0, -k, r - k, -r, r, -r]
    ], x + r, y, [1, 1], style, true);
  };

  /** The site's section label: raspberry capitals with a hairline running on to `right` */
  const eyebrow = (text: string, x: number, y: number, right: number) => {
    font('bold', 7);
    color(BRAND);
    const w = spaced(text, x, y, 0.55);
    if (right - (x + w + 3) > 4) {
      stroke(BRAND_LIGHT, 0.3);
      doc.line(x + w + 3, y - 1.15, right, y - 1.15);
    }
  };

  const drawPin = (x: number, y: number, rgb: Rgb) => {
    fill(rgb);
    const cx = x + 1;
    const cy = y - 1.25;
    const r = 0.95;
    doc.circle(cx, cy, r, 'F');
    doc.triangle(cx - r * 0.86, cy + 0.35, cx + r * 0.86, cy + 0.35, cx, y + 0.45, 'F');
    fill(WHITE);
    doc.circle(cx, cy, 0.38, 'F');
  };

  /**
   * Category marker: each category has its own shape as well as its colour,
   * so they can be told apart in black-and-white print and with colour blindness.
   */
  const categoryMark = (category: string | undefined, cx: number, cy: number, r: number, rim = true) => {
    const shape = CATEGORY_SHAPE[category || ''] ?? 'ring';
    const accent = getCategoryRgb(category).accent;
    fill(shape === 'ring' ? WHITE : accent);
    stroke(shape === 'ring' ? accent : INK, shape === 'ring' ? r * 0.45 : 0.15);
    const style = shape === 'ring' || rim ? 'FD' : 'F';
    const poly = (pts: Array<[number, number]>) => {
      const rel = pts.slice(1).map(([px, py], i) => [px - pts[i][0], py - pts[i][1]]);
      doc.lines(rel, pts[0][0], pts[0][1], [1, 1], style, true);
    };
    switch (shape) {
      case 'square':
        doc.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7, style);
        break;
      case 'triangle':
        poly([[cx, cy - r * 1.05], [cx + r * 1.05, cy + r * 0.8], [cx - r * 1.05, cy + r * 0.8]]);
        break;
      case 'diamond':
        poly([[cx, cy - r * 1.15], [cx + r * 1.15, cy], [cx, cy + r * 1.15], [cx - r * 1.15, cy]]);
        break;
      case 'triangleDown':
        poly([[cx - r * 1.05, cy - r * 0.8], [cx + r * 1.05, cy - r * 0.8], [cx, cy + r * 1.05]]);
        break;
      case 'hexagon':
        poly(Array.from({ length: 6 }, (_, k) => {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          return [cx + r * 1.05 * Math.cos(a), cy + r * 1.05 * Math.sin(a)] as [number, number];
        }));
        break;
      case 'ring':
        doc.circle(cx, cy, r * 0.8, style);
        break;
      default:
        doc.circle(cx, cy, r, style);
    }
  };

  return { font, txt, color, fill, stroke, spaced, fitLines, truncate, drawLinkedLines, pill, leaf, eyebrow, drawPin, categoryMark };
};
