/**
 * Cloudflare Pages Function — shared digest pages /digest/<slug>, with period-specific title and link preview
 *
 * The page itself is the app (index.html); this extracts the digest period from the slug
 * (mirroring utils/digestLinks.ts) and injects OpenGraph / Twitter preview metadata so links
 * shared in email, Teams or WhatsApp show which digest period they cover.
 */
import { formatPeriodShort } from '../../utils/digestText.ts';

const PAGE_RE = /^\/digest\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]+)\/?$/i;

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Extracts a human-readable period ("12 – 26 October 2026") from a /digest/<id>-<name> path, or null */
export function digestPeriodFromPath(pathname: string): string | null {
  const match = PAGE_RE.exec(pathname);
  if (!match) return null;
  const name = match[1].replace(/\.pdf$/i, '');
  const dates = /(\d{4})-(\d{2})-(\d{2})-to-(\d{4})-(\d{2})-(\d{2})/.exec(name);
  if (!dates) return null;
  const start = new Date(+dates[1], +dates[2] - 1, +dates[3]);
  const end = new Date(+dates[4], +dates[5] - 1, +dates[6]);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return formatPeriodShort(start, end);
}

/** index.html with the digest page's title, description and preview tags */
export function withDigestMeta(html: string, url: URL): string {
  const period = digestPeriodFromPath(url.pathname);
  const title = period
    ? `Upcoming Events Digest (${period}) · Cork City Partnership`
    : 'Upcoming Events Digest · Cork City Partnership';
  const description = period
    ? `Cork City Partnership upcoming community events for ${period}. View the digest online or download the PDF.`
    : 'Cork City Partnership upcoming community events digest. View online or download the PDF.';
  const tags = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="Cork City Partnership" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(`${url.origin}${url.pathname}`)}" />`,
    `<meta property="og:image" content="${escapeHtml(`${url.origin}/icon-512.png`)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`
  ].join('\n    ');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>\n    ${tags}`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${escapeHtml(description)}" />`);
}

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestGet = async ({ request, next }: { request: Request; next: () => Promise<Response> }): Promise<Response> => {
  const page = await next();
  if (!page.ok || !(page.headers.get('Content-Type') || '').includes('text/html')) return page;
  const original = await page.text();
  let html = original;
  try {
    html = withDigestMeta(original, new URL(request.url));
  } catch (err) {
    console.error('Digest page meta failed:', err);
  }
  const headers = new Headers(page.headers);
  headers.delete('Content-Length');
  headers.delete('ETag');
  headers.set('X-Robots-Tag', 'noindex');
  return new Response(html, { status: 200, headers });
};
