'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, ArrowLeft, Check } from 'lucide-react';
import { useAppDispatch, useAppSelector, useToast } from '@/hooks';
import { loginUser, registerUser, verifyEmail } from '@/store/slices/authSlice';
import { getErrorMessage, authApi } from '@/lib/api';

// ── Login Page ────────────────────────────────────────────────
export function LoginPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { loading, error } = useAppSelector(s => s.auth);
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  const redirect = searchParams.get('redirect') || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(loginUser(form));
    if (loginUser.fulfilled.match(result)) {
      toast.success('Welcome back!');
      router.push(redirect);
    } else {
      toast.error(result.payload as string || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-kavox-cream flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-kavox-charcoal px-16 py-12">
        <Link href="/" className="font-display text-3xl font-bold text-white">KAVOX</Link>
        <div>
          <blockquote className="font-display text-3xl text-white leading-tight italic mb-4">
            "Style is a way to say who you are without having to speak."
          </blockquote>
          <p className="text-kavox-silver text-sm font-light">— Rachel Zoe</p>
        </div>
        <div className="flex gap-8">
          {[['10K+', 'Happy Customers'], ['4.9★', 'Avg Rating'], ['100%', 'Cotton Quality']].map(([n, l]) => (
            <div key={l}>
              <div className="font-display text-2xl font-bold text-white">{n}</div>
              <div className="text-xs text-kavox-silver font-light">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-kavox-gray hover:text-kavox-black mb-8 font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-kavox-black mb-2">Welcome back</h1>
            <p className="text-kavox-gray font-light text-sm">Sign in to your KAVOX account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="form-group">
              <label className="label">Email Address</label>
              <input type="email" className="input" placeholder="you@example.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
            </div>
            <div className="form-group">
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Password</label>
                <Link href="/auth/forgot-password" className="text-xs text-kavox-accent hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} className="input pr-10" placeholder="••••••••" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-kavox-silver hover:text-kavox-charcoal transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-sm">{error}</div>}

            <button type="submit" disabled={loading} className="btn-primary w-full py-4 text-sm">
              {loading ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in…</span> : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-kavox-gray mt-6 font-light">
            Don't have an account?{' '}
            <Link href="/auth/register" className="text-kavox-black font-semibold hover:text-kavox-accent transition-colors">Create account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Register Page ─────────────────────────────────────────────
export function RegisterPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { loading } = useAppSelector(s => s.auth);

  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const defaultRole = searchParams.get('role') || 'user';
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '', role: defaultRole });

  const PASSWORD_RULES = [
    { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
    { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
    { label: 'One number', test: (p: string) => /\d/.test(p) },
    { label: 'One special character', test: (p: string) => /[!@#$%^&*]/.test(p) },
  ];

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return; }
    const result = await dispatch(registerUser(form));
    if (registerUser.fulfilled.match(result)) {
      setEmail(form.email);
      setStep('otp');
      toast.success('OTP sent to your email!');
    } else {
      toast.error(result.payload as string || 'Registration failed');
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    try {
      const result = await dispatch(verifyEmail({ email, otp }));
      if (verifyEmail.fulfilled.match(result)) {
        toast.success('Email verified! Welcome to KAVOX 🎉');
        router.push('/');
      } else {
        toast.error((result.payload as string) || 'Invalid OTP');
      }
    } finally { setVerifying(false); }
  };

  const handleResend = async () => {
    try { await authApi.resendOTP({ email, purpose: 'verification' }); toast.success('New OTP sent!'); }
    catch (e) { toast.error(getErrorMessage(e)); }
  };

  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-kavox-cream flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-kavox-accent-light rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✉️</span>
            </div>
            <h1 className="text-2xl font-bold text-kavox-black mb-2">Check your email</h1>
            <p className="text-kavox-gray text-sm font-light">We sent a 6-digit OTP to <strong>{email}</strong></p>
          </div>

          <form onSubmit={handleVerify} className="space-y-5">
            <div className="form-group">
              <label className="label">Enter OTP</label>
              <input
                type="text"
                maxLength={6}
                className="input text-center text-2xl tracking-[0.5em] font-bold"
                placeholder="000000"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </div>

            <button type="submit" disabled={verifying || otp.length < 6} className="btn-primary w-full py-4">
              {verifying ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying…</span> : 'Verify Email'}
            </button>

            <div className="text-center">
              <button type="button" onClick={handleResend} className="text-sm text-kavox-accent font-medium hover:underline">
                Resend OTP
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-kavox-cream flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Link href="/" className="font-display text-3xl font-bold text-kavox-black">KAVOX</Link>
          <h1 className="text-2xl font-bold text-kavox-black mt-4 mb-1">Create your account</h1>
          <p className="text-kavox-gray text-sm font-light">Join KAVOX and wear your story</p>
        </div>

        {/* Role toggle */}
        <div className="flex gap-2 p-1 bg-kavox-sand rounded-sm mb-6 border border-kavox-border">
          {['user', 'seller'].map(role => (
            <button
              key={role}
              type="button"
              onClick={() => setForm(p => ({ ...p, role }))}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-sm transition-all capitalize ${form.role === role ? 'bg-white text-kavox-black shadow-kavox-sm' : 'text-kavox-gray hover:text-kavox-black'}`}
            >
              {role === 'seller' ? '🏪 Seller Account' : '👤 Customer Account'}
            </button>
          ))}
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="label">First Name</label>
              <input className="input" placeholder="Rahul" value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="label">Last Name</label>
              <input className="input" placeholder="Sharma" value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} required />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Email Address</label>
            <input type="email" className="input" placeholder="you@example.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
          </div>

          <div className="form-group">
            <label className="label">Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} className="input pr-10" placeholder="Create a strong password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-kavox-silver hover:text-kavox-charcoal">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {/* Password strength */}
            {form.password && (
              <div className="mt-2 space-y-1">
                {PASSWORD_RULES.map(rule => (
                  <div key={rule.label} className={`flex items-center gap-2 text-xs ${rule.test(form.password) ? 'text-green-600' : 'text-kavox-silver'}`}>
                    <Check className={`w-3 h-3 ${rule.test(form.password) ? 'opacity-100' : 'opacity-20'}`} />
                    {rule.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="label">Confirm Password</label>
            <input type="password" className="input" placeholder="Repeat your password" value={form.confirmPassword} onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))} required />
            {form.confirmPassword && form.password !== form.confirmPassword && (
              <p className="error-text">Passwords do not match</p>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full py-4 text-sm mt-2">
            {loading ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating account…</span> : 'Create Account →'}
          </button>
        </form>

        <p className="text-center text-sm text-kavox-gray mt-5 font-light">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-kavox-black font-semibold hover:text-kavox-accent transition-colors">Sign in</Link>
        </p>
        <p className="text-center text-xs text-kavox-silver mt-3">By creating an account, you agree to our Terms & Privacy Policy.</p>
      </div>
    </div>
  );
}
