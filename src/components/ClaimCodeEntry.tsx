import React, { useState } from 'react';
import { ActivationScreen } from './ActivationScreen';

interface ClaimCodeEntryProps {
  onActivated: () => void;
}

const CODE_LENGTH = 6;
const CODE_PATTERN = /^[A-Z0-9]{6}$/;

export const ClaimCodeEntry: React.FC<ClaimCodeEntryProps> = ({ onActivated }) => {
  const [code, setCode] = useState('');
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();

    if (!CODE_PATTERN.test(normalized)) {
      setError('Enter the 6-character code provided by your salon.');
      return;
    }

    setError('');
    setSubmittedCode(normalized);
  };

  if (submittedCode) {
    return <ActivationScreen claimCode={submittedCode} onActivated={onActivated} />;
  }

  return (
    <div className="bp-login-screen">
      <div className="bp-login-card">
        <div className="bp-login-logo-wrap">
          <div className="text-center">
            <h1 className="bp-page-title">Claim Your Account</h1>
            <p className="bp-overline mt-2">Enter Your Invitation Code</p>
          </div>
        </div>

        <div className="bp-login-body">
          <p className="bp-body-sm text-center text-muted-foreground">
            Your salon gave you a 6-character code. Enter it below to set up your Blueprint account.
          </p>

          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl">
              <p className="bp-caption text-destructive">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="bp-login-form">
            <div>
              <label className="bp-label block mb-2">Claim Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="bp-field text-center text-2xl font-black tracking-[0.4em]"
                placeholder="A3KX72"
                maxLength={CODE_LENGTH}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </div>

            <button
              type="submit"
              className="bp-button bp-button-primary w-full"
              disabled={code.length !== CODE_LENGTH}
            >
              Continue
            </button>
          </form>

          <p className="bp-caption text-center text-muted-foreground">
            Didn't get a code? Ask your stylist for one.
          </p>
        </div>
      </div>
    </div>
  );
};
