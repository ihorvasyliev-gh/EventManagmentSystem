/** Text for the PDF: web addresses and emails, and characters the fonts can draw */

export const LINKISH_GLOBAL = /(?:https?:\/\/|www\.)[^\s<>"]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
export const trimLinkPunctuation = (s: string) => s.replace(/[.,;:!?)\]'"…]+$/, '');
export const linkUrl = (target: string) =>
  target.includes('@') && !/^https?:/i.test(target) ? `mailto:${target}` : /^www\./i.test(target) ? `https://${target}` : target;

// Supported Windows-1252 characters above 255 that jsPDF maps properly
const WINANSI_SUPPORTED_EXTRA = new Set([
  338, 339, 352, 353, 376, 381, 382, 402, 710, 732,
  8211, 8212, 8216, 8217, 8218, 8220, 8221, 8222, 8224, 8225, 8226, 8230, 8240, 8249, 8250, 8364, 8482
]);

const normaliseWhitespace = (text: string, preserveNewlines: boolean): string => {
  if (preserveNewlines) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return text.replace(/\s+/g, ' ').trim();
};

const stripEmoji = (text: string): string =>
  String(text)
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/[\uFE00-\uFE0F\u200B-\u200D]/g, '');

/**
 * Sanitizes strings for jsPDF standard fonts (Helvetica) to prevent switching to 16-bit encoding
 * which injects null bytes and corrupts letter spacing and glyphs.
 */
export const cleanPdfText = (text: string | null | undefined, preserveNewlines = false): string => {
  if (!text) return '';
  let result = '';
  const stripped = stripEmoji(text);
  for (let i = 0; i < stripped.length; i++) {
    const code = stripped.charCodeAt(i);
    result += code <= 255 || WINANSI_SUPPORTED_EXTRA.has(code) ? stripped[i] : ' ';
  }
  return normaliseWhitespace(result, preserveNewlines);
};

// Characters in the ranges below that Lato has no glyph for
const MISSING_FROM_FONT = new Set([0xad, 0x149, 0x2011, 0x2023, 0x2024, 0x2025, 0x2027, 0x2031, 0x2035, 0x2036, 0x2037, 0x2038]);

/** Characters covered by the bundled Lato subset (Latin, Latin Extended-A, Cyrillic, punctuation) */
const isInFontSubset = (code: number): boolean =>
  !MISSING_FROM_FONT.has(code) && (code === 10 ||
  (code >= 0x20 && code <= 0x7e) ||
  (code >= 0xa0 && code <= 0x17f) ||
  (code >= 0x218 && code <= 0x21b) ||
  (code >= 0x400 && code <= 0x45f) ||
  code === 0x490 || code === 0x491 ||
  (code >= 0x2010 && code <= 0x2027) ||
  (code >= 0x2030 && code <= 0x203a) ||
  code === 0x20ac || code === 0x2122 || code === 0x2212 ||
  (code >= 0x2190 && code <= 0x2193));

export const cleanUnicodeText = (text: string | null | undefined, preserveNewlines = false): string => {
  if (!text) return '';
  let result = '';
  // Non-breaking hyphens become plain ones, soft hyphens are dropped (Lato has neither)
  const stripped = stripEmoji(text).replace(/\u2011/g, '-').replace(/\u00ad/g, '');
  for (let i = 0; i < stripped.length; i++) {
    result += isInFontSubset(stripped.charCodeAt(i)) || stripped[i] === '\t' ? stripped[i] : ' ';
  }
  return normaliseWhitespace(result, preserveNewlines);
};
