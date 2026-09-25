import React, { useState } from 'react';
import { login } from '../services/authService';
import { User } from '../types';
import { Lock, Loader2, Mail, Eye, EyeOff, AlertCircle, CalendarPlus, ArrowRight, CheckCircle2 } from 'lucide-react';

interface LoginPageProps {
  onLogin: (user: User) => void;
  onOpenSubmitEvent?: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onOpenSubmitEvent }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMeState] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const requestIdRef = React.useRef(0);
  const isMountedRef = React.useRef(true);

  // Очистка при размонтировании компонента
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Предотвращаем множественные отправки
    if (isLoading) {
      return;
    }

    // Увеличиваем ID запроса для отслеживания актуальности
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);
    setError('');

    try {
      const user = await login(email, password, rememberMe);
      
      // Проверяем, что это все еще актуальный запрос и компонент смонтирован
      if (currentRequestId !== requestIdRef.current || !isMountedRef.current) {
        return;
      }
      
      onLogin(user);
    } catch (err: any) {
      // Проверяем, что это все еще актуальный запрос и компонент смонтирован
      if (currentRequestId !== requestIdRef.current || !isMountedRef.current) {
        return;
      }
      
      // Игнорируем ошибки отмены запроса (AbortError)
      if (err?.name === 'AbortError' || err?.message?.includes('aborted') || err?.message?.includes('cancelled')) {
        return;
      }
      
      const errorMessage = err.message || 'Login failed';
      setError(errorMessage);
      
      // Логируем ошибку в консоль для отладки
      console.error('Authentication error:', err);
    } finally {
      // Обновляем состояние только если это актуальный запрос
      if (currentRequestId === requestIdRef.current && isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md lg:max-w-4xl grid lg:grid-cols-2 bg-white dark:bg-slate-800 rounded-3xl shadow-xl overflow-hidden border border-slate-200/70 dark:border-slate-700">
        {/* Brand panel */}
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-7 sm:px-8 lg:p-10 text-white flex flex-col">
          <div className="pointer-events-none absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/10" aria-hidden="true" />
          <div className="pointer-events-none absolute right-24 -bottom-20 w-48 h-48 rounded-full bg-white/5" aria-hidden="true" />
          <div className="relative bg-white p-2.5 rounded-2xl shadow-md self-center lg:self-start max-w-[260px]">
            <img
              src="/assets/ccp-logo.png"
              alt="Cork City Partnership"
              className="h-11 w-auto object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div className="relative mt-5 lg:mt-auto text-center lg:text-left">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Event Calendar</h1>
            <p className="text-brand-100 text-sm mt-1">Staff portal for Cork City Partnership events</p>
            <ul className="hidden lg:block mt-6 space-y-2.5 text-sm text-white/90">
              {['See every upcoming event in one calendar', 'Get the fortnightly digest as a branded PDF', 'Subscribe from Outlook, Google or Apple Calendar'].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-white/80" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Sign in */}
        <div className="px-6 py-7 sm:px-8 lg:p-10">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sign in</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Use your staff account to view and manage events.</p>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm p-3 rounded-xl border border-red-100 dark:border-red-800">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="username"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  placeholder="name@partnershipcork.ie"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 min-w-0 min-h-0 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMeState(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 bg-white dark:bg-slate-700 cursor-pointer"
              />
              <span>Keep me signed in on this device</span>
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 bg-brand-600 text-white h-12 rounded-xl font-semibold hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 dark:focus:ring-offset-slate-800 transition-all disabled:opacity-70 shadow-sm"
            >
              {isLoading ? <><Loader2 className="animate-spin h-5 w-5" /> Signing in…</> : 'Sign in'}
            </button>

            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Need an account? Contact{' '}
              <a href="mailto:ivasyliev@partnershipcork.ie" className="text-brand-600 dark:text-brand-400 hover:underline font-medium">
                ivasyliev@partnershipcork.ie
              </a>
            </p>
          </form>

          {onOpenSubmitEvent && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={onOpenSubmitEvent}
                className="group w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 hover:border-brand-300 hover:bg-brand-50/60 dark:hover:border-brand-700 dark:hover:bg-brand-950/30 text-left transition-colors"
              >
                <span className="shrink-0 w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center">
                  <CalendarPlus className="w-5 h-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">Submit an event</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">No login needed — for the fortnightly digest</span>
                </span>
                <ArrowRight className="w-5 h-5 shrink-0 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
