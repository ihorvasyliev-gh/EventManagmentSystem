/**
 * What a file really is, from its first bytes: the browser's type only comes from the file's
 * name. Shared by the upload form (to explain a bad file) and the server (to refuse one).
 */

/**
 * Work apps under an organisation's app protection (Microsoft Intune, "MAM") save files
 * encrypted: an attachment saved from work Outlook on a phone starts with this tag instead
 * of its own header. Only those apps hold the key, so no browser or website can read it.
 */
const MANAGED_ENCRYPTION_TAG = 'MSMAMAR';

export type FileKind = 'pdf' | 'png' | 'jpeg' | 'gif' | 'webp' | 'managed-encrypted' | 'unknown';

/** What a file really is, from its first bytes (at least 16; up to 1 KB for a PDF) */
export const sniffFileKind = (head: Uint8Array): FileKind => {
  const text = String.fromCharCode(...head.subarray(0, 1024));
  if (text.slice(0, 32).includes(MANAGED_ENCRYPTION_TAG)) return 'managed-encrypted';
  if (head[0] === 0x89 && text.slice(1, 4) === 'PNG') return 'png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (text.startsWith('GIF8')) return 'gif';
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return 'webp';
  if (text.includes('%PDF-')) return 'pdf';
  return 'unknown';
};

/** The kind each type shown in the browser (images, PDFs) must really be */
export const KIND_OF_TYPE: Record<string, FileKind> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};
