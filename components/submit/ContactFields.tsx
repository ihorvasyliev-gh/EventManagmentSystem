import React from 'react';
import { Mail, User } from 'lucide-react';
import { FieldError, inputClass } from './formParts';

interface ContactFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  nameError?: string;
  email: string;
  onEmailChange: (value: string) => void;
  emailError?: string;
}

/** Who sent the event in: their name and work email */
const ContactFields: React.FC<ContactFieldsProps> = ({ name, onNameChange, nameError, email, onEmailChange, emailError }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div>
      <label htmlFor="field-name" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
        Full name <span className="text-red-500" aria-hidden="true">*</span>
      </label>
      <div className="relative">
        <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id="field-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Sarah Murphy"
          aria-invalid={!!nameError}
          aria-describedby={nameError ? 'err-name' : undefined}
          className={`${inputClass(!!nameError)} pl-10 pr-3 py-3`}
        />
      </div>
      <FieldError id="err-name" message={nameError} />
    </div>
    <div>
      <label htmlFor="field-email" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
        Work email <span className="text-red-500" aria-hidden="true">*</span>
      </label>
      <div className="relative">
        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id="field-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="name@partnershipcork.ie"
          aria-invalid={!!emailError}
          aria-describedby={emailError ? 'err-email' : undefined}
          className={`${inputClass(!!emailError)} pl-10 pr-3 py-3`}
        />
      </div>
      <FieldError id="err-email" message={emailError} />
    </div>
  </div>
);

export default ContactFields;
