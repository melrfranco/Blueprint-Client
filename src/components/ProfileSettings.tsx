import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';

export const ProfileSettings: React.FC = () => {
  const { user, membership, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [salonName, setSalonName] = useState<string | null>(null);

  useEffect(() => {
    if (!membership?.salon_id) {
      setSalonName(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('salons')
      .select('name')
      .eq('id', membership.salon_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSalonName(data?.name || null);
      });
    return () => {
      cancelled = true;
    };
  }, [membership?.salon_id]);

  if (!user) return null;

  const displayName = membership?.client_identity?.display_name;
  const phone = membership?.client_identity?.phone;

  return (
    <div className="bp-page">
      <h1 className="bp-page-title">Profile Settings</h1>
      <p className="bp-subtitle mb-6">Manage your account</p>

      <div className="space-y-6">
        {/* Account Info */}
        <div className="bp-card bp-card-padding-md">
          <h3 className="bp-section-title mb-4">Account</h3>
          <div className="space-y-4">
            {displayName && (
              <div>
                <label className="bp-label block mb-2">Name</label>
                <div className="bp-field bg-muted/50 border-0">{displayName}</div>
              </div>
            )}
            <div>
              <label className="bp-label block mb-2">Email</label>
              <div className="bp-field bg-muted/50 border-0">{user.email}</div>
            </div>
            {phone && (
              <div>
                <label className="bp-label block mb-2">Phone</label>
                <div className="bp-field bg-muted/50 border-0">{phone}</div>
              </div>
            )}
            <p className="bp-caption text-muted-foreground">
              Contact your salon to update your profile details.
            </p>
          </div>
        </div>

        {/* Salon */}
        {salonName && (
          <div className="bp-card bp-card-padding-md">
            <h3 className="bp-section-title mb-4">Salon</h3>
            <div>
              <label className="bp-label block mb-2">Your Salon</label>
              <div className="bp-field bg-muted/50 border-0">{salonName}</div>
            </div>
          </div>
        )}

        {/* Appearance */}
        <div className="bp-card bp-card-padding-md">
          <h3 className="bp-section-title mb-4">Appearance</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="bp-body-sm">Dark Mode</p>
              <p className="bp-caption text-muted-foreground">
                {theme === 'dark' ? 'Currently enabled' : 'Currently disabled'}
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="toggle"
              data-state={theme === 'dark' ? 'on' : 'off'}
              aria-label="Toggle dark mode"
            />
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bp-card bp-card-padding-md border-destructive/20">
          <h3 className="bp-section-title mb-4 text-destructive">Danger Zone</h3>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="bp-button bp-button-ghost w-full text-destructive"
          >
            Sign Out
          </button>
        </div>

        {/* Logout Confirmation Modal */}
        {showLogoutConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bp-card bp-card-padding-lg max-w-sm w-full">
              <h3 className="bp-section-title mb-2">Sign Out?</h3>
              <p className="bp-body-sm text-muted-foreground mb-6">
                Are you sure you want to sign out of your account?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="bp-button bp-button-ghost flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await logout();
                    setShowLogoutConfirm(false);
                  }}
                  className="bp-button bp-button-primary flex-1"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
