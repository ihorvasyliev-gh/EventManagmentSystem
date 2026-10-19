/**
 * Copies a formatted email (HTML, with plain text for apps that only take that) to be pasted into
 * the new email a mailto: link opens, which can only carry plain text. Call it inside the click:
 * Safari allows nothing later, so text still being made goes in as a promise. Resolves false when
 * the clipboard can't take it, and the plain text then goes in the mailto: link instead.
 */
export const copyFormattedEmail = async (html: string | Promise<string>, text: string | Promise<string>): Promise<boolean> => {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': Promise.resolve(html).then((h) => new Blob([h], { type: 'text/html' })),
      'text/plain': Promise.resolve(text).then((t) => new Blob([t], { type: 'text/plain' }))
    })]);
    return true;
  } catch (err) {
    console.warn('Copying the formatted email failed:', err);
    return false;
  }
};

export const PASTE_KEYS = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘V' : 'Ctrl+V';
