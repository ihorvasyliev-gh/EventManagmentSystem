/** Who staff contact when something in the app goes wrong */
export const CONTACT_EMAIL = 'ivasyliev@partnershipcork.ie';

export const CONTACT_HINT = `If this keeps happening, please contact ${CONTACT_EMAIL}.`;

/** Appends the "contact us" line to an error message shown to the user */
export const withContactHint = (message: string): string => {
  const trimmed = message.trim();
  const sentence = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  return `${sentence} ${CONTACT_HINT}`;
};

/** mailto: link with the error details filled in, so the report arrives with context */
export const buildSupportMailto = (errorMessage?: string): string => {
  const subject = 'CCP Event Calendar: something went wrong';
  const body = [
    'Hi,',
    '',
    'I ran into a problem in the CCP Event Calendar.',
    '',
    'What I was doing:',
    '',
    '',
    errorMessage ? `Error shown: ${errorMessage}` : '',
    typeof window !== 'undefined' ? `Page: ${window.location.href}` : '',
    typeof navigator !== 'undefined' ? `Browser: ${navigator.userAgent}` : '',
    `Time: ${new Date().toLocaleString('en-IE')}`,
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};
