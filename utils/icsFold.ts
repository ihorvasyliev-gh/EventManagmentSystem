const encoder = new TextEncoder();

/**
 * Folds one iCalendar content line to at most 75 octets per line (RFC 5545 §3.1):
 * continuation lines start with a single space. Splits between characters only, so
 * multi-byte UTF-8 characters and emoji are never cut in half.
 */
export const foldICSLine = (line: string): string => {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    // The first line holds 75 octets; continuation lines lose one to the leading space
    if (size + bytes > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
};
