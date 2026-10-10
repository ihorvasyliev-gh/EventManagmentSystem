import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, LogOut } from 'lucide-react';
import ModalShell from './ModalShell';
import { changePassword, setNewPassword, MIN_PASSWORD_LENGTH } from '../services/authService';

interface PasswordModalProps {
  isOpen: boolean;
  /**
   * 'forced': after an admin reset (or created) the account — the person signed in with a
   * temporary password and must choose their own before using the app.
   * 'change': from the account menu; asks for the current password first.
   */
  mode: 'forced' | 'change';
  email: string;
  onClose: () => void;
  onChanged: () => void;
  /** Forced mode: a way out other than choosing a password */
  onSignOut?: () => void;
}

const inputClass =
  'w-full h-11 pl-10 pr-11 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

const PasswordField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  visible: boolean;
  onToggle: () => void;
}> = ({ id, label, value, onChange, autoComplete, placeholder, visible, onToggle }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">{label}</label>
    <span className="relative block">
      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={inputClass}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? 'Hide passwords' : 'Show passwords'}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </span>
  </div>
);

const PasswordModal: React.FC<PasswordModalProps> = ({ isOpen, mode, email, onClose, onChanged, onSignOut }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const forced = mode === 'forced';

  const handleClose = () => {
    if (saving || forced) return;
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!forced && !current) return setError('Please enter your current password.');
    if (next.length < MIN_PASSWORD_LENGTH) return setError(`The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (next !== confirm) return setError('The two new passwords don’t match.');
    if (!forced && next === current) return setError('The new password is the same as the current one.');
    setSaving(true);
    try {
      if (forced) await setNewPassword(next);
      else await changePassword(email, current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The password could not be changed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
      {forced && onSignOut ? (
        <button type="button" onClick={onSignOut} disabled={saving} className="cta inline-flex items-center justify-center gap-2 h-11 px-4 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 sm:mr-auto disabled:opacity-60">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      ) : (
        <button type="button" onClick={handleClose} disabled={saving} className="cta h-11 px-5 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 sm:ml-auto disabled:opacity-60">
          Cancel
        </button>
      )}
      <button type="submit" form="password-form" disabled={saving} className="cta inline-flex items-center justify-center gap-2 h-11 px-5 rounded bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        {saving ? 'Saving…' : 'Save new password'}
      </button>
    </div>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      dismissible={!forced}
      title={forced ? 'Choose your own password' : 'Change password'}
      subtitle={forced ? 'You signed in with a temporary password' : email}
      icon={<KeyRound className="w-5 h-5" />}
      footer={footer}
    >
      <form id="password-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {forced && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Before you continue, choose a new password that only you know. You’ll use it from now on.
          </p>
        )}
        {/* Lets password managers save the new password under the right account */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        {!forced && (
          <PasswordField id="pw-current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" visible={visible} onToggle={() => setVisible((v) => !v)} />
        )}
        <PasswordField id="pw-new" label="New password" value={next} onChange={setNext} autoComplete="new-password" placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} visible={visible} onToggle={() => setVisible((v) => !v)} />
        <PasswordField id="pw-confirm" label="New password again" value={confirm} onChange={setConfirm} autoComplete="new-password" visible={visible} onToggle={() => setVisible((v) => !v)} />
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-200" role="alert">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}
      </form>
    </ModalShell>
  );
};

export default PasswordModal;
