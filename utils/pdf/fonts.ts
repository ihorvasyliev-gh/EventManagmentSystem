/** The Lato font files, embedded in the digest */

// ---------------------------------------------------------------------------
// Fonts & text
// ---------------------------------------------------------------------------

export type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

// Lato, the typeface of corkcitypartnership.ie
export const FONT_FILES: Record<Weight, string> = {
  regular: 'Lato-Regular.ttf',
  medium: 'Lato-Medium.ttf',
  semibold: 'Lato-SemiBold.ttf',
  bold: 'Lato-Bold.ttf'
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(binary);
};

let fontDataPromise: Promise<Record<Weight, string> | null> | null = null;

/** Fetches the Lato TTFs once per session (null when unavailable, e.g. offline) */
export const loadFontData = (): Promise<Record<Weight, string> | null> => {
  if (!fontDataPromise) {
    fontDataPromise = Promise.all(
      (Object.keys(FONT_FILES) as Weight[]).map(async (weight) => {
        const res = await fetch(`/fonts/${FONT_FILES[weight]}`);
        if (!res.ok) throw new Error(`Font ${FONT_FILES[weight]} unavailable`);
        return [weight, arrayBufferToBase64(await res.arrayBuffer())] as const;
      })
    )
      .then((entries) => Object.fromEntries(entries) as Record<Weight, string>)
      .catch((err) => {
        console.warn('PDF fonts could not be loaded, using Helvetica:', err);
        fontDataPromise = null;
        return null;
      });
  }
  return fontDataPromise;
};
