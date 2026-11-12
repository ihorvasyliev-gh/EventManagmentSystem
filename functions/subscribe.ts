/**
 * Cloudflare Pages Function — the public page /subscribe, with its own title and link preview
 *
 * The page itself is the app (index.html); this only gives it a title, description and preview
 * card of its own, so a link to it pasted into an email, Teams or WhatsApp says what it is.
 */
export const SUBSCRIBE_TITLE = 'Add CCP events to your calendar · Cork City Partnership';
export const SUBSCRIBE_DESCRIPTION = "Subscribe to Cork City Partnership's events in Outlook, Google or Apple Calendar. No account needed; it updates by itself.";

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** index.html with the subscribe page's title, description and preview tags */
export function withSubscribeMeta(html: string, origin: string): string {
    const tags = [
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="Cork City Partnership" />`,
        `<meta property="og:title" content="${escapeHtml(SUBSCRIBE_TITLE)}" />`,
        `<meta property="og:description" content="${escapeHtml(SUBSCRIBE_DESCRIPTION)}" />`,
        `<meta property="og:url" content="${escapeHtml(`${origin}/subscribe`)}" />`,
        `<meta property="og:image" content="${escapeHtml(`${origin}/icon-512.png`)}" />`,
        `<meta name="twitter:card" content="summary" />`,
    ].join('\n    ');
    return html
        .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(SUBSCRIBE_TITLE)}</title>\n    ${tags}`)
        .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${escapeHtml(SUBSCRIBE_DESCRIPTION)}" />`);
}

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestGet = async ({ request, next }: { request: Request; next: () => Promise<Response> }): Promise<Response> => {
    const page = await next();
    if (!page.ok || !(page.headers.get('Content-Type') || '').includes('text/html')) return page;
    const original = await page.text();
    let html = original;
    try {
        html = withSubscribeMeta(original, new URL(request.url).origin);
    } catch (err) {
        console.error('Subscribe page meta failed:', err); // the page still opens, with the app's title
    }
    const headers = new Headers(page.headers);
    headers.delete('Content-Length');
    headers.delete('ETag');
    return new Response(html, { status: 200, headers });
};
