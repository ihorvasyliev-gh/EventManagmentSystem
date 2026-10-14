/**
 * Whose event it is. Staff may change their own events: the ones they sent in while signed in,
 * and the ones that name their email as the first contact (most are sent from /submit without
 * signing in). The same rule is checked by /api/edit-event, which does the saving.
 */
export interface OwnedEvent {
  creatorId?: string | null;
  submitterEmail?: string | null;
}

export interface EventEditor {
  id: string;
  email?: string | null;
}

const sameEmail = (a?: string | null, b?: string | null): boolean => {
  const x = a?.trim().toLowerCase();
  return !!x && x === b?.trim().toLowerCase();
};

export const ownsEvent = (event: OwnedEvent, user: EventEditor): boolean =>
  (!!event.creatorId && event.creatorId === user.id) || sameEmail(event.submitterEmail, user.email);
