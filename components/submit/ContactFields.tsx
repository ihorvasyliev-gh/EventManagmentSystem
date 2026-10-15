import React from 'react';
import { Mail, Plus, User, X } from 'lucide-react';
import { FieldError, inputClass } from './formParts';
import { MAX_CONTACTS, suggestEmailFix, type ContactRow } from '../../utils/contacts';

export type ContactField = 'name' | 'email';

interface ContactInputsProps {
  /** Ids are `field-${idPrefix}-name` / `-email` (the form scrolls to them) */
  idPrefix: string;
  /** Read by screen readers before "Full name" / "Work email" ("Contact 2: Full name") */
  srLabel?: string;
  name: string;
  email: string;
  onChange: (field: ContactField, value: string) => void;
  nameError?: string;
  emailError?: string;
  /** Only the sender's own row fills in from the browser */
  autoComplete?: boolean;
}

/** A name and work email side by side */
const ContactInputs: React.FC<ContactInputsProps> = ({ idPrefix, srLabel, name, email, onChange, nameError, emailError, autoComplete }) => {
  const nameId = idPrefix ? `field-${idPrefix}-name` : 'field-name';
  const emailId = idPrefix ? `field-${idPrefix}-email` : 'field-email';
  const nameErrId = idPrefix ? `err-${idPrefix}-name` : 'err-name';
  const emailErrId = idPrefix ? `err-${idPrefix}-email` : 'err-email';
  const emailHintId = idPrefix ? `hint-${idPrefix}-email` : 'hint-email';
  // "@pertnershipcork.ie": offer the organisation's own domain (a typo there means emails never arrive)
  const emailFix = emailError ? null : suggestEmailFix(email);
  const emailDescribedBy = [emailError ? emailErrId : '', emailFix ? emailHintId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label htmlFor={nameId} className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
          {srLabel && <span className="sr-only">{srLabel}: </span>}
          Full name <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <div className="relative">
          <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id={nameId}
            type="text"
            autoComplete={autoComplete ? 'name' : 'off'}
            value={name}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="e.g. Sarah Murphy"
            aria-invalid={!!nameError}
            aria-describedby={nameError ? nameErrId : undefined}
            className={`${inputClass(!!nameError)} pl-10 pr-3 py-3`}
          />
        </div>
        <FieldError id={nameErrId} message={nameError} />
      </div>
      <div>
        <label htmlFor={emailId} className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
          {srLabel && <span className="sr-only">{srLabel}: </span>}
          Work email <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <div className="relative">
          <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete={autoComplete ? 'email' : 'off'}
            value={email}
            onChange={(e) => onChange('email', e.target.value)}
            placeholder="name@partnershipcork.ie"
            aria-invalid={!!emailError}
            aria-describedby={emailDescribedBy}
            className={`${inputClass(!!emailError)} pl-10 pr-3 py-3`}
          />
        </div>
        <FieldError id={emailErrId} message={emailError} />
        {emailFix && (
          <p id={emailHintId} className="mt-1.5 text-xs text-amber-800 dark:text-amber-300">
            Did you mean{' '}
            <button
              type="button"
              onClick={() => onChange('email', emailFix)}
              className="font-semibold underline underline-offset-2 hover:no-underline break-all"
            >
              {emailFix}
            </button>
            ?
          </p>
        )}
      </div>
    </div>
  );
};

/** Ids of an extra contact's fields: `field-contact-${index}-name` */
export const extraContactId = (index: number) => `contact-${index}`;

interface ContactFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  nameError?: string;
  email: string;
  onEmailChange: (value: string) => void;
  emailError?: string;
  /** More contact people after the first one */
  extra: ContactRow[];
  onExtraChange: (index: number, field: ContactField, value: string) => void;
  onAddContact: () => void;
  onRemoveContact: (index: number) => void;
  extraError: (index: number, field: ContactField) => string | undefined;
}

/** Who to contact about the event: the person sending it in, and anyone else they add */
const ContactFields: React.FC<ContactFieldsProps> = ({
  name, onNameChange, nameError, email, onEmailChange, emailError,
  extra, onExtraChange, onAddContact, onRemoveContact, extraError
}) => (
  <div className="space-y-4">
    <ContactInputs
      idPrefix=""
      srLabel={extra.length > 0 ? 'Contact 1' : undefined}
      name={name}
      email={email}
      onChange={(field, value) => (field === 'name' ? onNameChange(value) : onEmailChange(value))}
      nameError={nameError}
      emailError={emailError}
      autoComplete
    />

    {extra.map((row, i) => (
      <div key={row.key} className="pt-4 border-t border-dashed border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Contact {i + 2}</p>
          <button
            type="button"
            onClick={() => onRemoveContact(i)}
            aria-label={`Remove contact ${i + 2}`}
            className="inline-flex items-center gap-1 h-8 px-2.5 -mr-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
        <ContactInputs
          idPrefix={extraContactId(i)}
          srLabel={`Contact ${i + 2}`}
          name={row.name}
          email={row.email}
          onChange={(field, value) => onExtraChange(i, field, value)}
          nameError={extraError(i, 'name')}
          emailError={extraError(i, 'email')}
        />
      </div>
    ))}

    {extra.length + 1 < MAX_CONTACTS ? (
      <button
        type="button"
        onClick={onAddContact}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-sm font-semibold text-brand-700 dark:text-brand-300 hover:border-brand-400 hover:bg-brand-50/60 dark:hover:bg-brand-950/30 transition-colors"
      >
        <Plus className="w-4 h-4" /> Add another contact person
      </button>
    ) : (
      <p className="text-xs text-slate-500 dark:text-slate-400">Up to {MAX_CONTACTS} contact people.</p>
    )}
  </div>
);

export default ContactFields;
