import React from 'react';
import { Mail, User } from 'lucide-react';

interface SubmitterFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
}

/** Edit form: who sent the event in */
const SubmitterFields: React.FC<SubmitterFieldsProps> = ({ name, onNameChange, email, onEmailChange }) => (
  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
    <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-3 uppercase tracking-wide">
      Submitter Details
    </h4>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
          Submitter Name
        </label>
        <div className="relative">
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Sarah Murphy"
            className="block w-full pl-9 rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all font-medium placeholder-slate-400"
          />
          <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
          Submitter Email
        </label>
        <div className="relative">
          <input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="e.g. sarah@corkcitypartnership.ie"
            className="block w-full pl-9 rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all font-medium placeholder-slate-400"
          />
          <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        </div>
      </div>
    </div>
  </div>
);

export default SubmitterFields;
