import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ClientDataProvider } from './contexts/ClientDataContext';
import { LoginScreen } from './components/LoginScreen';
import { ActivationScreen } from './components/ActivationScreen';
import { ClaimCodeEntry } from './components/ClaimCodeEntry';
import { ClientDashboard } from './components/ClientDashboard';
import { ProfileSettings } from './components/ProfileSettings';
import { BottomNav } from './components/BottomNav';

const ActivationRoute: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const handleActivated = () => {
    navigate('/', { replace: true });
  };

  if (!token) {
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
            <p className="bp-body-sm text-center text-muted-foreground">
              No activation token found. Please use the link sent by your salon.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <ActivationScreen token={token} onActivated={handleActivated} />;
};

const ClaimRoute: React.FC = () => {
  const navigate = useNavigate();
  return <ClaimCodeEntry onActivated={() => navigate('/', { replace: true })} />;
};

const AuthenticatedShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home');

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <ClientDashboard />;
      case 'appointments':
        return (
          <div className="bp-page">
            <h1 className="bp-page-title">Appointments</h1>
            <p className="bp-subtitle mb-6">Your upcoming and past appointments</p>
            <div className="bp-card bp-card-padding-md">
              <p className="bp-body-sm text-muted-foreground text-center py-8">
                Appointments coming soon
              </p>
            </div>
          </div>
        );
      case 'services':
        return (
          <div className="bp-page">
            <h1 className="bp-page-title">Services</h1>
            <p className="bp-subtitle mb-6">Browse available services</p>
            <div className="bp-card bp-card-padding-md">
              <p className="bp-body-sm text-muted-foreground text-center py-8">
                Services catalog coming soon
              </p>
            </div>
          </div>
        );
      case 'profile':
        return <ProfileSettings />;
      default:
        return <ClientDashboard />;
    }
  };

  return (
    <div className="bp-app-shell">
      {renderContent()}
      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
};

const AppContent: React.FC = () => {
  const { isAuthenticated, authInitialized } = useAuth();

  if (!authInitialized) {
    return (
      <div className="bp-page">
        <div className="flex items-center justify-center h-full">
          <p className="bp-body-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/activate" element={<ActivationRoute />} />
      <Route path="/claim" element={<ClaimRoute />} />
      <Route path="*" element={isAuthenticated ? <AuthenticatedShell /> : <LoginScreen />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ClientDataProvider>
            <AppContent />
          </ClientDataProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
};

export default App;
