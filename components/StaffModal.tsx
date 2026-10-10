import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Copy, Eye, EyeOff, KeyRound, Loader2, Mail, RotateCcw, User, UserPlus, Users } from 'lucide-react';
import ModalShell from './ModalShell';
import { createStaffAccount, listStaff, resetStaffPassword, type StaffAccount } from '../services/staffService';

interface StaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
}

const MIN_PASSWORD = 8;
const inputClass =
  'w-full h-11 pl-10 pr-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';
const secondaryButton =
  'cta h-11 px-5 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60';
const primaryButton =
  'cta inline-flex items-center justify-center gap-2 h-11 px-5 rounded bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60';

const ErrorBox: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-200" role="alert">
    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {message}
  </div>
);

/** A temporary password to read out or paste: shown once, with a copy button */
const TempPassword: React.FC<{ password: string }> = ({ password }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy the temporary password:', password);
    }
  };
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 p-2 pl-4">
      <code className="flex-1 text-lg font-semibold tracking-wider text-slate-900 dark:text-white select-all">{password}</code>
      <button type="button" onClick={copy} className="cta inline-flex items-center gap-1.5 h-9 px-3 rounded bg-brand-600 hover:bg-brand-700 text-white text-sm">
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

/**
 * Admins: every account, adding staff, and resetting a forgotten password. A reset gives a
 * temporary password to pass on; the person must choose their own when they next sign in.
 */
const StaffModal: React.FC<StaffModalProps> = ({ isOpen, onClose, currentUserId }) => {
  const [view, setView] = useState<'list' | 'add'>('list');
  const [staff, setStaff] = useState<StaffAccount[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [reset, setReset] = useState<{ account: StaffAccount; tempPassword: string } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  // Add form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; fullName: string; mustChangePassword: boolean } | null>(null);

  const load = useCallback(async () => {
    setListError(null);
    try {
      setStaff(await listStaff());
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load the staff list.');
    }
  }, []);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  const resetAddForm = () => {
    setFullName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setAddError(null);
    setCreated(null);
  };

  const handleClose = () => {
    if (isSaving || resettingId) return;
    resetAddForm();
    setView('list');
    setReset(null);
    setConfirmResetId(null);
    setResetError(null);
    onClose();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!fullName.trim()) return setAddError('Please enter a display name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setAddError('Please enter a valid email address.');
    if (password.length < MIN_PASSWORD) return setAddError(`The password must be at least ${MIN_PASSWORD} characters.`);
    setIsSaving(true);
    try {
      setCreated(await createStaffAccount({ fullName: fullName.trim(), email: email.trim(), password }));
      setPassword('');
      void load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async (account: StaffAccount) => {
    setResettingId(account.id);
    setResetError(null);
    try {
      const { tempPassword } = await resetStaffPassword(account.id);
      setReset({ account, tempPassword });
      setConfirmResetId(null);
      setStaff((prev) => prev?.map((s) => (s.id === account.id ? { ...s, mustChangePassword: true } : s)) ?? prev);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Could not reset the password.');
    } finally {
      setResettingId(null);
    }
  };

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (reset) {
    body = (
      <div className="py-2">
        <p className="text-sm text-slate-700 dark:text-slate-200">
          <span className="font-semibold">{reset.account.fullName}</span> can now sign in with <span className="font-medium break-all">{reset.account.email}</span> and this temporary password:
        </p>
        <TempPassword password={reset.tempPassword} />
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Give it to them by phone or in person. When they sign in, the app asks them to choose their own password, so you won’t know it.
          The temporary password isn’t shown again.
        </p>
      </div>
    );
    footer = (
      <div className="flex justify-end">
        <button type="button" onClick={() => setReset(null)} className={primaryButton}>Done</button>
      </div>
    );
  } else if (view === 'add') {
    body = created ? (
      <div className="text-center py-4">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-ccp-green-100 dark:bg-ccp-green-900/30 text-ccp-green-600 dark:text-ccp-green-400 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <p className="text-lg font-semibold text-slate-900 dark:text-white">Account created</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          <span className="font-medium">{created.fullName}</span> can now sign in with <span className="font-medium break-all">{created.email}</span> and the password you set.
        </p>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Share the password with them privately.
          {created.mustChangePassword && ' When they first sign in, they’ll be asked to choose their own.'}
        </p>
      </div>
    ) : (
      <form id="add-staff-form" onSubmit={handleCreate} noValidate className="space-y-4">
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
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">First password</span>
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
          The account gets the <span className="font-semibold">Staff</span> role (roles can only be changed in Supabase).
          They’ll choose their own password when they first sign in.
        </p>
        {addError && <ErrorBox message={addError} />}
      </form>
    );
    footer = created ? (
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" onClick={() => { resetAddForm(); setView('list'); }} className={secondaryButton}>Back to the list</button>
        <button type="button" onClick={resetAddForm} className={primaryButton}>Add another</button>
      </div>
    ) : (
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" onClick={() => { resetAddForm(); setView('list'); }} disabled={isSaving} className={`${secondaryButton} inline-flex items-center justify-center gap-1.5`}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button type="submit" form="add-staff-form" disabled={isSaving} className={primaryButton}>
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          {isSaving ? 'Creating…' : 'Create account'}
        </button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        {listError && <ErrorBox message={listError} />}
        {resetError && <ErrorBox message={resetError} />}
        {!staff && !listError && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500 dark:text-slate-400" role="status">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading accounts…
          </div>
        )}
        {staff && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/80 -mx-1">
            {staff.map((account) => {
              const isMe = account.id === currentUserId;
              const confirming = confirmResetId === account.id;
              return (
                <li key={account.id} className="px-1 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {account.fullName}
                        {isMe && <span className="font-normal text-slate-500 dark:text-slate-400"> (you)</span>}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{account.email}</p>
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.12em] ${account.role === 'admin' ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                          {account.role}
                        </span>
                        {account.mustChangePassword && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            Has a temporary password
                          </span>
                        )}
                      </p>
                    </div>
                    {!isMe && !confirming && (
                      <button
                        type="button"
                        onClick={() => { setConfirmResetId(account.id); setResetError(null); }}
                        className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <RotateCcw className="w-4 h-4 shrink-0" /> <span>Reset<span className="sr-only sm:not-sr-only"> password</span></span>
                      </button>
                    )}
                  </div>
                  {confirming && (
                    <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-3">
                      <p className="text-sm text-amber-900 dark:text-amber-100">
                        Replace {account.fullName.trim() ? `${account.fullName.trim().split(/\s+/)[0]}’s` : 'their'} password with a temporary one? Their current password stops working.
                      </p>
                      <div className="mt-2.5 flex gap-2 justify-end">
                        <button type="button" onClick={() => setConfirmResetId(null)} disabled={!!resettingId} className="h-9 px-3 rounded text-sm text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800">
                          Cancel
                        </button>
                        <button type="button" onClick={() => void handleReset(account)} disabled={!!resettingId} className="inline-flex items-center gap-1.5 h-9 px-3 rounded bg-brand-600 hover:bg-brand-700 text-white text-sm disabled:opacity-60">
                          {resettingId === account.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                          Reset password
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
    footer = (
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" onClick={handleClose} className={secondaryButton}>Close</button>
        <button type="button" onClick={() => setView('add')} className={primaryButton}>
          <UserPlus className="w-4 h-4" /> Add staff account
        </button>
      </div>
    );
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title={reset ? 'Temporary password' : view === 'add' ? 'Add staff account' : 'Staff accounts'}
      subtitle={reset ? reset.account.fullName : view === 'add' ? 'New accounts get the Staff role' : 'Add people and reset forgotten passwords'}
      icon={view === 'add' ? <UserPlus className="w-5 h-5" /> : reset ? <KeyRound className="w-5 h-5" /> : <Users className="w-5 h-5" />}
      footer={footer}
    >
      {body}
    </ModalShell>
  );
};

export default StaffModal;
