/**
 * Cloudflare Pages Function — the public page /submit, with its own title and link preview
 *
 * The page itself is the app (index.html); this gives it a title, description and preview
 * card of its own, so a link to it pasted into an email, Teams or WhatsApp says what it is.
 */
export const SUBMIT_TITLE = 'Submit an event · Cork City Partnership';
export const SUBMIT_DESCRIPTION = "Send an event for Cork City Partnership's community calendar. No account needed; the calendar team will review and publish it.";

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** index.html with the submit page's title, description and preview tags */
export function withSubmitMeta(html: string, origin: string): string {
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Cork City Partnership" />`,
    `<meta property="og:title" content="${escapeHtml(SUBMIT_TITLE)}" />`,
    `<meta property="og:description" content="${escapeHtml(SUBMIT_DESCRIPTION)}" />`,
    `<meta property="og:url" content="${escapeHtml(`${origin}/submit`)}" />`,
    `<meta property="og:image" content="${escapeHtml(`${origin}/icon-512.png`)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(SUBMIT_TITLE)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(SUBMIT_DESCRIPTION)}" />`
  ].join('\n    ');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(SUBMIT_TITLE)}</title>\n    ${tags}`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${escapeHtml(SUBMIT_DESCRIPTION)}" />`);
}

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestGet = async ({ request, next }: { request: Request; next: () => Promise<Response> }): Promise<Response> => {
  const page = await next();
  if (!page.ok || !(page.headers.get('Content-Type') || '').includes('text/html')) return page;
  const original = await page.text();
  let html = original;
  try {
    html = withSubmitMeta(original, new URL(request.url).origin);
  } catch (err) {
    console.error('Submit page meta failed:', err);
  }
  const headers = new Headers(page.headers);
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(html, { status: 200, headers });
};
