import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export const ProfileSettings: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  if (!user) return null;

  return (
    <div className="bp-page">
      <h1 className="bp-page-title">Profile Settings</h1>
      <p className="bp-subtitle mb-6">Manage your account</p>

      <div className="space-y-6">
        {/* Account Info */}
        <div className="bp-card bp-card-padding-md">
          <h3 className="bp-section-title mb-4">Account</h3>
          <div className="space-y-4">
            <div>
              <label className="bp-label block mb-2">Email</label>
              <div className="bp-field bg-muted/50 border-0">
                {user.email}
              </div>
            </div>
          </div>
        </div>

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

        {/* Notifications */}
        <div className="bp-card bp-card-padding-md">
          <h3 className="bp-section-title mb-4">Notifications</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="bp-body-sm">Appointment Reminders</p>
                <p className="bp-caption text-muted-foreground">
                  Get notified before your appointments
                </p>
              </div>
              <button
                className="toggle"
                data-state="on"
                aria-label="Toggle appointment reminders"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="bp-body-sm">Membership Updates</p>
                <p className="bp-caption text-muted-foreground">
                  Stay informed about your membership
                </p>
              </div>
              <button
                className="toggle"
                data-state="on"
                aria-label="Toggle membership updates"
              />
            </div>
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
