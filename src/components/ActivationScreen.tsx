import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/apiClient';
import type { ActivationDetails, ActivationResult } from '../services/apiClient';
import { CheckCircleIcon } from './icons';

interface ActivationScreenProps {
  token?: string;
  claimCode?: string;
  onActivated: () => void;
}

type ActivationStep = 'validating' | 'setup' | 'submitting' | 'success' | 'error';

export const ActivationScreen: React.FC<ActivationScreenProps> = ({ token, claimCode, onActivated }) => {
  const [step, setStep] = useState<ActivationStep>('validating');
  const [details, setDetails] = useState<ActivationDetails | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activationResult, setActivationResult] = useState<ActivationResult | null>(null);

  useEffect(() => {
    const validate = async () => {
      try {
        const result = await apiClient.getActivationDetails({ token, claimCode });
        setDetails(result);
        setEmail(result.invite_email);
        setStep('setup');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid activation credential');
        setStep('error');
      }
    };

    if (token || claimCode) {
      validate();
    } else {
      setError('No activation token or claim code provided');
      setStep('error');
    }
  }, [token, claimCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setStep('submitting');

    try {
      const result = await apiClient.completeActivation({
        token: token || undefined,
        claim_code: claimCode || undefined,
        email,
        password,
      });
      setActivationResult(result);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed');
      setStep('setup');
    }
  };

  // ── Validating ──
  if (step === 'validating') {
    return (
      <div className="bp-login-screen">
        <div className="bp-login-card">
          <div className="bp-login-logo-wrap">
            <div className="text-center">
              <h1 className="bp-page-title">Blueprint Client</h1>
              <p className="bp-overline mt-2">Activating Your Account</p>
            </div>
          </div>
          <div className="bp-login-body">
            <p className="bp-body-sm text-center text-muted-foreground">
              Verifying your invitation...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (step === 'error') {
    return (
      <div className="bp-login-screen">
        <div className="bp-login-card">
          <div className="bp-login-logo-wrap">
            <div className="text-center">
              <h1 className="bp-page-title">Blueprint Client</h1>
              <p className="bp-overline mt-2">Activation Error</p>
            </div>
          </div>
          <div className="bp-login-body">
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl">
              <p className="bp-caption text-destructive">{error}</p>
            </div>
            <p className="bp-caption text-center text-muted-foreground">
              Please contact your salon for a new invitation
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (step === 'success') {
    return (
      <div className="bp-login-screen">
        <div className="bp-login-card">
          <div className="bp-login-logo-wrap">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <CheckCircleIcon className="w-16 h-16 text-primary" />
              </div>
              <h1 className="bp-page-title">Account Activated</h1>
              <p className="bp-overline mt-2">Welcome to {details?.salon_name}</p>
            </div>
          </div>
          <div className="bp-login-body">
            <p className="bp-body-sm text-center text-muted-foreground">
              Your account has been set up successfully. You can now sign in with your email and password.
            </p>
            {activationResult && !activationResult.booking_eligible && (
              <div className="p-4 bg-secondary/10 border border-secondary/20 rounded-2xl">
                <p className="bp-overline mb-1">Booking Not Yet Available</p>
                <p className="bp-caption text-muted-foreground">
                  Your salon still needs to complete their provider setup before you can book appointments. You can still view your plans and profile.
                </p>
              </div>
            )}
            <button
              onClick={onActivated}
              className="bp-button bp-button-primary w-full"
            >
              Sign In Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Setup Form ──
  return (
    <div className="bp-login-screen">
      <div className="bp-login-card">
        <div className="bp-login-logo-wrap">
          <div className="text-center">
            <h1 className="bp-page-title">Blueprint Client</h1>
            <p className="bp-overline mt-2">Set Up Your Account</p>
          </div>
        </div>

        <div className="bp-login-body">
          {details && (
            <div className="bp-card bp-card-padding-sm mb-2">
              <p className="bp-overline mb-1">Invitation from</p>
              <p className="bp-card-title">{details.salon_name}</p>
              <p className="bp-caption text-muted-foreground mt-1">
                Welcome, {details.invite_name}
              </p>
            </div>
          )}

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
                disabled={step === 'submitting'}
              />
            </div>

            <div>
              <label className="bp-label block mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bp-field"
                placeholder="At least 8 characters"
                required
                minLength={8}
                disabled={step === 'submitting'}
              />
            </div>

            <div>
              <label className="bp-label block mb-2">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bp-field"
                placeholder="Repeat your password"
                required
                minLength={8}
                disabled={step === 'submitting'}
              />
            </div>

            <button
              type="submit"
              className="bp-button bp-button-primary w-full"
              disabled={step === 'submitting'}
            >
              {step === 'submitting' ? 'Activating...' : 'Activate My Account'}
            </button>
          </form>

          <p className="bp-caption text-center text-muted-foreground">
            This link is for you only. Do not share it with others.
          </p>
        </div>
      </div>
    </div>
  );
};
