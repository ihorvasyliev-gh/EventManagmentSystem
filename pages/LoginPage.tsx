import React, { useState } from 'react';
import { login, signUp } from '../services/authService';
import { User, UserRole } from '../types';
import { Calendar, Lock, User as UserIcon, Loader2, Mail } from 'lucide-react';

interface LoginPageProps {
  onLogin: (user: User) => void;
  onOpenSubmitEvent?: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onOpenSubmitEvent }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
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
      let user: User;
      if (isSignUp) {
        if (!fullName.trim()) {
          setError('Please enter your full name');
          setIsLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setIsLoading(false);
          return;
        }
        user = await signUp(email, password, fullName, UserRole.STAFF);
      } else {
        user = await login(email, password);
      }
      
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
      
      // Показываем более детальное сообщение об ошибке
      const errorMessage = err.message || (isSignUp ? 'Registration failed' : 'Login failed');
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
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-8 py-6 text-center">
          <img
            src="/assets/ccp-logo.png"
            alt="Cork City Partnership"
            className="h-12 mx-auto mb-3 bg-white/95 p-1.5 rounded-lg shadow-sm"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <h1 className="text-xl font-bold text-white">Cork City Partnership</h1>
          <p className="text-brand-100 text-xs mt-1">Staff Portal & Event Calendar</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm p-3 rounded-md border border-red-100 dark:border-red-800">
              {error}
            </div>
          )}

          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                </div>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  placeholder="John Doe"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                placeholder="staff@partnershipcork.ie"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center items-center bg-brand-600 text-white py-2.5 rounded-lg font-semibold hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-all disabled:opacity-70"
          >
            {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setPassword('');
                setFullName('');
              }}
              className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>

          {onOpenSubmitEvent && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 text-center">
              <button
                type="button"
                onClick={onOpenSubmitEvent}
                className="w-full py-2 px-3 border border-dashed border-brand-300 dark:border-brand-700 bg-brand-50/60 dark:bg-brand-950/30 hover:bg-brand-100 dark:hover:bg-brand-900/40 text-brand-700 dark:text-brand-300 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <span>📝 Submit an Event for Elizabeth's Review</span>
                <span className="text-[10px] bg-brand-200 dark:bg-brand-800 text-brand-800 dark:text-brand-200 px-1.5 py-0.5 rounded">No login needed</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
