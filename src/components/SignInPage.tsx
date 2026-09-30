import React, { useState } from 'react';
import { Loader2, LogIn, ShieldAlert, PlugZap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

/**
 * Sign-in, and the two states that are not a sign-in problem: no backend
 * configured, and signed in without a profile. Both are stated plainly rather
 * than shown as a failed password.
 */
export const SignInPage: React.FC = () => {
  const { status, signIn, signOut, requestPasswordReset } = useAuth();
  const { language, setLanguage } = useApp();
  const tr = language === 'tr';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: signInError } = await signIn(email.trim(), password);
    if (signInError) setError(signInError);
    setBusy(false);
  };

  const handleReset = async () => {
    if (!email.trim()) {
      setError(tr ? 'Önce e-posta adresinizi girin.' : 'Enter your email address first.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: resetError } = await requestPasswordReset(email.trim());
    setBusy(false);
    if (resetError) setError(resetError);
    else
      setNotice(
        tr
          ? 'Parola sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.'
          : 'A password reset link has been sent. Check your inbox.',
      );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 p-0.5 shadow-sm shrink-0">
            <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center">
              <span className="font-extrabold text-xs tracking-wider text-amber-400">MIU</span>
            </div>
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight">
              {tr ? 'Mombasa Uluslararası Üniv.' : 'Mombasa Int. University'}
            </h1>
            <p className="text-[11px] text-slate-500 leading-none mt-0.5">
              {tr ? 'Kenya Afrika Üniversitesi Vakfı' : 'African University Trust (AUTK)'}
            </p>
          </div>
        </div>

        {status === 'unconfigured' && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs" role="status">
            <div className="flex items-start gap-2.5">
              <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <div className="space-y-1">
                <div className="font-semibold text-amber-900">
                  {tr ? 'Veri kaynağı bağlı değil' : 'No data source connected'}
                </div>
                <p className="leading-relaxed text-amber-900/80">
                  {tr
                    ? 'Bu kurulumda Supabase yapılandırılmamış, bu yüzden giriş yapılamıyor. .env.local dosyasında VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY değerlerini ayarlayın.'
                    : 'Supabase is not configured in this build, so signing in is not possible. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {status === 'no_profile' && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs" role="alert">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
              <div className="space-y-2">
                <div className="font-semibold text-rose-900">
                  {tr ? 'Bu hesabın erişimi yok' : 'This account has no access'}
                </div>
                <p className="leading-relaxed text-rose-900/80">
                  {tr
                    ? 'Girişiniz doğrulandı, ancak portalda tanımlı bir profiliniz yok ya da erişiminiz süresi dolmuş. Proje direktörüyle iletişime geçin.'
                    : 'You signed in, but no active profile exists for this account, or its access has expired. Contact the project director.'}
                </p>
                <button
                  onClick={() => void signOut()}
                  className="cursor-pointer rounded-lg border border-rose-300 bg-white px-2.5 py-1 font-semibold text-rose-800 hover:bg-rose-100"
                >
                  {tr ? 'Çıkış yap' : 'Sign out'}
                </button>
              </div>
            </div>
          </div>
        )}

        {status !== 'no_profile' && (
          <form
            onSubmit={handleSubmit}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
          >
            <div className="space-y-1">
              <label htmlFor="email" className="block text-xs font-semibold text-slate-700">
                {tr ? 'E-posta' : 'Email'}
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === 'unconfigured'}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none disabled:opacity-60"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
                {tr ? 'Parola' : 'Password'}
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={status === 'unconfigured'}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none disabled:opacity-60"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p
                className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
                role="status"
              >
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || status === 'unconfigured'}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{tr ? 'Giriş yap' : 'Sign in'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleReset()}
              disabled={busy || status === 'unconfigured'}
              className="w-full cursor-pointer text-center text-xs text-slate-500 hover:text-slate-800 disabled:opacity-60"
            >
              {tr ? 'Parolamı unuttum' : 'Forgot my password'}
            </button>
          </form>
        )}

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>{tr ? 'Erişim davetle verilir.' : 'Access is granted by invitation.'}</span>
          <button
            onClick={() => setLanguage(tr ? 'en' : 'tr')}
            className="cursor-pointer font-medium text-slate-500 hover:text-slate-800"
          >
            {tr ? 'English' : 'Türkçe'}
          </button>
        </div>
      </div>
    </div>
  );
};
