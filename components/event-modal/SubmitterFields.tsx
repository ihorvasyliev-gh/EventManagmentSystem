import React from 'react';
import { Mail, Plus, User, X } from 'lucide-react';
import { MAX_CONTACTS, type ContactRow } from '../../utils/contacts';

type ContactField = 'name' | 'email';

interface SubmitterFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  /** More contact people after the submitter */
  extra: ContactRow[];
  onExtraChange: (index: number, field: ContactField, value: string) => void;
  onAddContact: () => void;
  onRemoveContact: (index: number) => void;
  error?: string;
}

const inputClass =
  'block w-full pl-9 rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all font-medium placeholder-slate-400';
const labelClass = 'block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5';

/** A name and email side by side */
const ContactPair: React.FC<{
  nameLabel: string;
  emailLabel: string;
  name: string;
  email: string;
  onChange: (field: ContactField, value: string) => void;
  namePlaceholder: string;
  emailPlaceholder: string;
}> = ({ nameLabel, emailLabel, name, email, onChange, namePlaceholder, emailPlaceholder }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <label className="block">
      <span className={labelClass}>{nameLabel}</span>
      <span className="relative block">
        <input
          type="text"
          value={name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder={namePlaceholder}
          className={inputClass}
        />
        <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      </span>
    </label>
    <label className="block">
      <span className={labelClass}>{emailLabel}</span>
      <span className="relative block">
        <input
          type="email"
          value={email}
          onChange={(e) => onChange('email', e.target.value)}
          placeholder={emailPlaceholder}
          className={inputClass}
        />
        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      </span>
    </label>
  </div>
);

/** Edit form: who sent the event in, and anyone else to contact about it */
const SubmitterFields: React.FC<SubmitterFieldsProps> = ({
  name, onNameChange, email, onEmailChange, extra, onExtraChange, onAddContact, onRemoveContact, error
}) => (
  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
    <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1 uppercase tracking-wide">
      Contact Details
    </h4>
    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
      Everyone here is shown as a contact in the digest.
    </p>
    <div className="space-y-4">
      <ContactPair
        nameLabel="Submitter Name"
        emailLabel="Submitter Email"
        name={name}
        email={email}
        onChange={(field, value) => (field === 'name' ? onNameChange(value) : onEmailChange(value))}
        namePlaceholder="e.g. Sarah Murphy"
        emailPlaceholder="e.g. sarah@corkcitypartnership.ie"
      />
      {extra.map((row, i) => (
        <div key={row.key} className="relative pt-3 border-t border-dashed border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => onRemoveContact(i)}
            aria-label={`Remove contact ${i + 2}`}
            title="Remove this contact"
            className="absolute right-0 top-2 p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <ContactPair
            nameLabel={`Contact ${i + 2} Name`}
            emailLabel={`Contact ${i + 2} Email`}
            name={row.name}
            email={row.email}
            onChange={(field, value) => onExtraChange(i, field, value)}
            namePlaceholder="Full name"
            emailPlaceholder="name@corkcitypartnership.ie"
          />
        </div>
      ))}
      {error && <p className="text-red-500 dark:text-red-400 text-xs" role="alert">{error}</p>}
      {extra.length + 1 < MAX_CONTACTS && (
        <button
          type="button"
          onClick={onAddContact}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-xs font-semibold text-brand-700 dark:text-brand-300 hover:border-brand-400 hover:bg-brand-50/60 dark:hover:bg-brand-950/30 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add contact person
        </button>
      )}
    </div>
  </div>
);

export default SubmitterFields;
