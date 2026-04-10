import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="bp-login-screen">
      <div className="bp-login-card">
        <div className="bp-login-logo-wrap">
          <div className="text-center">
            <h1 className="bp-page-title">Blueprint Client</h1>
            <p className="bp-overline mt-2">Your Salon Experience</p>
          </div>
        </div>

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
            className="bp-button bp-button-secondary w-full"
            disabled={loading}
          >
            Request Magic Link
          </button>

          <p className="bp-caption text-center text-muted-foreground">
            Contact your salon if you need help accessing your account
          </p>
        </div>
      </div>
    </div>
  );
};
