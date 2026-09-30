import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Mail, User, UserPlus } from 'lucide-react';
import ModalShell from './ModalShell';
import { createStaffAccount } from '../services/staffService';

interface AddStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MIN_PASSWORD = 8;
const inputClass =
  'w-full h-11 pl-10 pr-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

/** Admins create staff accounts here; roles are only changed in Supabase */
const AddStaffModal: React.FC<AddStaffModalProps> = ({ isOpen, onClose }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; fullName: string } | null>(null);

  const reset = () => {
    setFullName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setError(null);
    setCreated(null);
  };

  const handleClose = () => {
    if (isSaving) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) return setError('Please enter a display name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Please enter a valid email address.');
    if (password.length < MIN_PASSWORD) return setError(`The password must be at least ${MIN_PASSWORD} characters.`);
    setIsSaving(true);
    try {
      setCreated(await createStaffAccount({ fullName: fullName.trim(), email: email.trim(), password }));
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setIsSaving(false);
    }
  };

  const footer = created ? (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
      <button type="button" onClick={handleClose} className="h-11 px-5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
        Done
      </button>
      <button type="button" onClick={reset} className="h-11 px-5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold">
        Add another
      </button>
    </div>
  ) : (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
      <button type="button" onClick={handleClose} disabled={isSaving} className="h-11 px-5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60">
        Cancel
      </button>
      <button type="submit" form="add-staff-form" disabled={isSaving} className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-60">
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
        {isSaving ? 'Creating…' : 'Create account'}
      </button>
    </div>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title="Add staff account"
      subtitle="New accounts get the Staff role"
      icon={<UserPlus className="w-5 h-5" />}
      footer={footer}
    >
      {created ? (
        <div className="text-center py-4">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">Account created</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium">{created.fullName}</span> can now sign in with <span className="font-medium break-all">{created.email}</span> and the password you set.
          </p>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Share the password with them privately.</p>
        </div>
      ) : (
        <form id="add-staff-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          <label className="block">
            <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">Display name</span>
            <span className="relative block">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" placeholder="e.g. Brenda Barry" className={inputClass} />
            </span>
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">Login email</span>
            <span className="relative block">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" inputMode="email" placeholder="name@partnershipcork.ie" className={inputClass} />
            </span>
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">Password</span>
            <span className="relative block">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={`At least ${MIN_PASSWORD} characters`}
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </span>
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            The account gets the <span className="font-semibold">Staff</span> role. Roles can only be changed in Supabase.
          </p>
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-200" role="alert">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </form>
      )}
    </ModalShell>
  );
};

export default AddStaffModal;
