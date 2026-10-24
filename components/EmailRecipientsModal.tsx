import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, BellRing, FileText, Loader2, Mails, RotateCcw, X } from 'lucide-react';
import ModalShell from './ModalShell';
import { useToast } from '../contexts/ToastContext';
import { DEFAULT_EMAIL_RECIPIENTS } from '../constants/digestRecipients';
import { fetchEmailRecipients, saveEmailRecipients, type SavedEmailRecipients } from '../services/emailRecipientsService';
import {
  EMAIL_KINDS, MAX_ADDRESS_CHARS, MAX_RECIPIENTS, RECIPIENT_FIELDS, addressChars, recipientCount, sameRecipients, splitAddresses, uniqueAddresses,
  type EmailKind, type EmailRecipientSettings, type RecipientField
} from '../utils/emailRecipients';

interface EmailRecipientsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EMAILS: Record<EmailKind, { title: string; usedBy: string; icon: React.ReactNode }> = {
  digest: { title: 'Events Digest', usedBy: 'The Email button in Events Digest', icon: <FileText className="w-4 h-4" /> },
  reminder: { title: 'Reminder', usedBy: 'The Reminder button: asks staff to send in their events', icon: <BellRing className="w-4 h-4" /> }
};

const FIELD_LABEL: Record<RecipientField, string> = { to: 'To', cc: 'CC', bcc: 'BCC' };

const secondaryButton =
  'cta h-11 px-5 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60';
const primaryButton =
  'cta inline-flex items-center justify-center gap-2 h-11 px-5 rounded bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60';

const ErrorBox: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-200" role="alert">
    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
    <span className="flex-1">{message}</span>
    {onRetry && (
      <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline">Try again</button>
    )}
  </div>
);

/** "24 Oct 2026, 14:20" */
const formatChanged = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

interface AddressFieldProps {
  label: string;
  /** What the field is, for screen readers: "Events Digest CC" */
  name: string;
  addresses: string[];
  onChange: (addresses: string[]) => void;
  /** Typed text that isn't an address waits in the field with this note, and the email can't be saved */
  error: string | null;
  onErrorChange: (error: string | null) => void;
}

/**
 * Addresses as removable chips, like the To line of an email: type one and press Enter (or a
 * comma, semicolon or space), or paste a list as Outlook copies it ("Ada <ada@x.ie>; bob@x.ie").
 */
const AddressField: React.FC<AddressFieldProps> = ({ label, name, addresses, onChange, error, onErrorChange }) => {
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');

  /** Adds the addresses in `text`; what isn't one stays in the field, with a note */
  const commit = (text: string) => {
    const { addresses: found, invalid } = splitAddresses(text);
    const next = uniqueAddresses([...addresses, ...found]);
    if (next.length > MAX_RECIPIENTS) {
      setDraft(text.trim());
      onErrorChange(`At most ${MAX_RECIPIENTS} addresses here.`);
      return;
    }
    if (next.length !== addresses.length) onChange(next);
    setDraft(invalid.join(' '));
    onErrorChange(invalid.length ? `“${invalid[0]}” isn’t a full email address.` : null);
  };

  const remove = (address: string) => {
    onChange(addresses.filter((a) => a !== address));
    inputRef.current?.focus();
  };

  return (
    <div className="flex items-start gap-2 sm:gap-3">
      <label htmlFor={inputId} className="w-10 shrink-0 pt-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <div className="flex-1 min-w-0">
        <div
          className={`flex flex-wrap items-center gap-1.5 min-h-11 px-2 py-1.5 rounded-xl border bg-white dark:bg-slate-900 cursor-text focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent ${error ? 'border-red-400 dark:border-red-500' : 'border-slate-300 dark:border-slate-600'}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) inputRef.current?.focus();
          }}
        >
          {addresses.map((address) => (
            <span
              key={address}
              className="inline-flex items-center gap-0.5 max-w-full h-7 pl-2.5 pr-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100"
            >
              <span className="truncate">{address}</span>
              <button
                type="button"
                onClick={() => remove(address)}
                aria-label={`Remove ${address} from ${name}`}
                title="Remove"
                className="shrink-0 w-6 h-6 rounded-full inline-flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={draft}
            placeholder={addresses.length ? '' : 'Add an address'}
            aria-label={`${name}: add an address`}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              const value = e.target.value;
              onErrorChange(null);
              // A separator typed after an address adds it
              if (/[,;\s]$/.test(value) && value.trim()) commit(value);
              else setDraft(value);
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (!/[@,;\s]/.test(text)) return;
              e.preventDefault();
              commit(`${draft} ${text}`);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (draft.trim()) commit(draft);
              } else if (e.key === 'Backspace' && !draft && addresses.length) {
                onChange(addresses.slice(0, -1));
              }
            }}
            onBlur={() => {
              if (draft.trim()) commit(draft);
            }}
            // Narrow beside the chips until typed in, so a short list stays on one line
            className={`flex-1 h-7 px-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:min-w-[9rem] ${addresses.length ? 'min-w-0' : 'min-w-[9rem]'}`}
          />
        </div>
        {error && (
          <p id={errorId} className="mt-1 text-xs text-red-700 dark:text-red-300">{error}</p>
        )}
      </div>
    </div>
  );
};

/**
 * Admins: who the Events Digest email and the Reminder go to, each with its own To, CC and BCC.
 * The buttons open a new email with these filled in; they can still be changed in the email.
 */
const EmailRecipientsModal: React.FC<EmailRecipientsModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const [saved, setSaved] = useState<SavedEmailRecipients | null>(null);
  const [edited, setEdited] = useState<EmailRecipientSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Fields with text in them that isn't an address ("digest.cc"), and what is wrong with it
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Bumped to clear the fields' typed text when an email's addresses are put back
  const [resets, setResets] = useState<Record<EmailKind, number>>({ digest: 0, reminder: 0 });

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const current = await fetchEmailRecipients();
      setSaved(current);
      setEdited(current.recipients);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'The email recipients could not be loaded.');
    }
  }, []);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  const setFieldError = (key: string, error: string | null) =>
    setFieldErrors((prev) => {
      if ((prev[key] ?? null) === error) return prev;
      const next = { ...prev };
      if (error) next[key] = error;
      else delete next[key];
      return next;
    });

  const handleClose = () => {
    if (isSaving) return;
    setSaveError(null);
    setFieldErrors({});
    onClose();
  };

  const setField = (kind: EmailKind, field: RecipientField, addresses: string[]) => {
    setSaveError(null);
    setEdited((prev) => (prev ? { ...prev, [kind]: { ...prev[kind], [field]: addresses } } : prev));
  };

  const putBack = (kind: EmailKind) => {
    setEdited((prev) => (prev ? { ...prev, [kind]: DEFAULT_EMAIL_RECIPIENTS[kind] } : prev));
    setFieldErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(`${kind}.`))));
    setResets((prev) => ({ ...prev, [kind]: prev[kind] + 1 }));
  };

  const changed = !!saved && !!edited && EMAIL_KINDS.some((kind) => !sameRecipients(saved.recipients[kind], edited[kind]));
  const empty = edited ? EMAIL_KINDS.filter((kind) => recipientCount(edited[kind]) === 0) : [];
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  const canSave = changed && empty.length === 0 && !hasFieldErrors && !isSaving;

  const handleSave = async () => {
    if (!edited || !canSave) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await saveEmailRecipients(edited);
      setSaved(result);
      setEdited(result.recipients);
      setFieldErrors({});
      showToast('Email recipients saved', 'success');
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'The email recipients could not be saved. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  let body: React.ReactNode;
  if (loadError) {
    body = <ErrorBox message={loadError} onRetry={() => void load()} />;
  } else if (!edited || !saved) {
    body = (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500 dark:text-slate-400" role="status">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          The buttons open a new email with these addresses filled in; you can still change them there before sending.
          People in <span className="font-semibold">BCC</span> get the email without anyone seeing their address.
        </p>
        {EMAIL_KINDS.map((kind) => {
          const { title, usedBy, icon } = EMAILS[kind];
          const isDefault = sameRecipients(edited[kind], DEFAULT_EMAIL_RECIPIENTS[kind]);
          return (
            <section key={kind} aria-labelledby={`recipients-${kind}`} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4">
              <div className="flex items-start gap-2 mb-3">
                <span className="mt-0.5 shrink-0 p-1.5 rounded-lg bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-300" aria-hidden="true">
                  {icon}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 id={`recipients-${kind}`} className="text-base font-semibold text-slate-900 dark:text-white leading-tight">{title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{usedBy}</p>
                </div>
                {!isDefault && (
                  <button
                    type="button"
                    onClick={() => putBack(kind)}
                    className="shrink-0 inline-flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                    title={`Put back the original addresses for the ${title} email`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Original addresses
                  </button>
                )}
              </div>
              <div className="space-y-2" key={resets[kind]}>
                {RECIPIENT_FIELDS.map((field) => (
                  <AddressField
                    key={field}
                    label={FIELD_LABEL[field]}
                    name={`${title} ${FIELD_LABEL[field]}`}
                    addresses={edited[kind][field]}
                    onChange={(addresses) => setField(kind, field, addresses)}
                    error={fieldErrors[`${kind}.${field}`] ?? null}
                    onErrorChange={(error) => setFieldError(`${kind}.${field}`, error)}
                  />
                ))}
              </div>
              {empty.includes(kind) && (
                <p className="mt-2 text-xs text-red-700 dark:text-red-300" role="alert">Add at least one address for this email.</p>
              )}
              {addressChars(edited[kind]) > MAX_ADDRESS_CHARS && (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                  With this many addresses the browser may not be able to open the email. A group address (like allstaff@partnershipcork.ie) works better.
                </p>
              )}
            </section>
          );
        })}
        {saveError && <ErrorBox message={saveError} />}
      </div>
    );
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title="Email recipients"
      subtitle={
        saved?.updatedAt
          ? `Last changed${saved.updatedBy ? ` by ${saved.updatedBy}` : ''}, ${formatChanged(saved.updatedAt)}`
          : 'Who the digest and reminder emails go to'
      }
      icon={<Mails className="w-5 h-5" />}
      size="lg"
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {hasFieldErrors && (
            <p className="text-xs text-red-700 dark:text-red-300">Fix or remove the address that isn’t right to save.</p>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <button type="button" onClick={handleClose} disabled={isSaving} className={`${secondaryButton} flex-1 sm:flex-none`}>Cancel</button>
            <button type="button" onClick={() => void handleSave()} disabled={!canSave} className={`${primaryButton} flex-1 sm:flex-none`}>
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      }
    >
      {body}
    </ModalShell>
  );
};

export default EmailRecipientsModal;
