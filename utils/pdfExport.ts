/**
 * The Events Digest: the branded PDF (utils/pdf/digest/) and the WhatsApp text.
 * The pieces live in utils/pdf/; this module is what the app imports.
 */
export { generateEventsDigestPDF, digestFileName, type BulletinOptions } from './pdf/digest/generate';
export { generateWhatsAppSummary } from './pdf/whatsapp';
export { createGoogleCalendarUrl, createOutlookWebUrl, createGoogleMapsUrl } from './pdf/links';
export { loadImageForPdf, type LoadedPdfFlyer } from './pdf/images';
export { toAbsoluteHttpUrl, generateDigestEmail, type DigestEmail } from './digestText.ts';
