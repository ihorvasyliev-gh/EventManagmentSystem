/** Temporary passwords an admin hands to a member of staff who forgot theirs */

const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALL = LOWER + UPPER + DIGITS;

const pick = (alphabet: string, random: number): string => alphabet[random % alphabet.length];

/**
 * Three groups of four, e.g. "Kp7m-3xQa-9tVw": easy to read out over the phone (no 0/O, 1/l/I),
 * and it has lower case, upper case, a digit and a symbol, so it passes any Supabase password rule.
 */
export const generateTempPassword = (): string => {
  const random = crypto.getRandomValues(new Uint32Array(12));
  const chars = Array.from(random, (r) => pick(ALL, r));
  chars[0] = pick(UPPER, random[0]);
  chars[1] = pick(DIGITS, random[1]);
  chars[2] = pick(LOWER, random[2]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join('')).join('-');
};
