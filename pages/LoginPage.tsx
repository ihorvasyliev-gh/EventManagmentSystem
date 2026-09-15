import React, { useState } from 'react';
import { login, signUp } from '../services/authService';
import { User, UserRole } from '../types';
import { Calendar, Lock, User as UserIcon, Loader2, Mail } from 'lucide-react';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
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
        <div className="bg-blue-600 px-8 py-6 text-center">
          <div className="bg-white/20 p-3 rounded-full inline-block mb-3">
             <Calendar className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">CCP Events</h1>
          <p className="text-blue-100 text-sm mt-1">Staff Access Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-8 space-y-6">
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
                  className="pl-10 block w-full border border-slate-300 dark:border-slate-600 rounded-lg py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
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
                className="pl-10 block w-full border border-slate-300 dark:border-slate-600 rounded-lg py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                placeholder="you@ccp.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                className="pl-10 block w-full border border-slate-300 dark:border-slate-600 rounded-lg py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={isSignUp ? 6 : undefined}
              />
            </div>
            {isSignUp && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Password must be at least 6 characters</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center items-center bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-70"
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
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
