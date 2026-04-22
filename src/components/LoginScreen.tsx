import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setError('Enter your email to receive a magic link');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { error: magicError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (magicError) {
        setError(magicError.message);
      } else {
        setMagicLinkSent(true);
      }
    } catch {
      setError('Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  if (magicLinkSent) {
    return (
      <div className="bp-login-screen">
        <div className="bp-login-card">
          <header className="bp-login-logo-wrap">
            <img
              src="/logo.png"
              alt="Blueprint Salon Software"
              className="bp-login-logo"
            />
          </header>
          <div className="bp-login-body">
            <p className="bp-body-sm text-center text-muted-foreground">
              We sent a sign-in link to <strong>{email}</strong>. Click the link to sign in automatically.
            </p>
            <button
              onClick={() => setMagicLinkSent(false)}
              className="bp-button bp-button-ghost w-full"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bp-login-screen">
      <div className="bp-login-card">
        <header className="bp-login-logo-wrap">
          <img
            src="/logo.png"
            alt="Blueprint Salon Software"
            className="bp-login-logo"
          />
        </header>

        <div className="bp-login-body">
          <p className="bp-body-sm text-center text-muted-foreground">
            Sign in to access your appointments, plans, and membership details
          </p>

          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl">
              <p className="bp-caption text-destructive">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="bp-login-form">
            <div>
              <label className="bp-label block mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bp-field"
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="bp-label block mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bp-field"
                placeholder="Enter your password"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="bp-button bp-button-primary w-full"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="bp-login-divider">
            <div className="bp-login-divider-line" />
            <p className="bp-caption text-muted-foreground">OR</p>
            <div className="bp-login-divider-line" />
          </div>

          <button
            type="button"
            onClick={handleMagicLink}
            className="bp-button bp-button-secondary w-full"
            disabled={loading}
          >
            Send Magic Link
          </button>

          <p className="bp-caption text-center text-muted-foreground">
            New here? Click the activation link your salon sent you, or{' '}
            <a href="/claim" className="underline text-primary font-semibold">
              enter a claim code
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
};
