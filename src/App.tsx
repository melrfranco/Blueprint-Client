import React, { useState, Component, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ClientDataProvider } from './contexts/ClientDataContext';
import { LoginScreen } from './components/LoginScreen';
import { ActivationScreen } from './components/ActivationScreen';
import { ClaimCodeEntry } from './components/ClaimCodeEntry';
import { ClientDashboard } from './components/ClientDashboard';
import { AppointmentsTab } from './components/AppointmentsTab';
import { PlanView } from './components/PlanView';
import { ProfileSettings } from './components/ProfileSettings';
import { BottomNav } from './components/BottomNav';

// ── Error Boundary ──────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="bp-page" style={{ padding: '2rem' }}>
          <h1 className="bp-page-title" style={{ color: 'red' }}>Render Error</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', marginTop: '1rem' }}>{this.state.error.message}</pre>
          <button className="bp-button bp-button-primary" style={{ marginTop: '1rem' }} onClick={() => this.setState({ error: null })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
        return <ClientDashboard onNavigate={(t) => setActiveTab(t)} />;
      case 'plan':
        return <PlanView />;
      case 'appointments':
        return <AppointmentsTab />;
      case 'profile':
        return <ProfileSettings />;
      default:
        return <ClientDashboard onNavigate={(t) => setActiveTab(t)} />;
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
  const { isAuthenticated, authInitialized, user, membership } = useAuth();

  console.log('[AppContent]', { authInitialized, isAuthenticated, userId: user?.id, membershipSalonId: membership?.salon_id });

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
            <ErrorBoundary>
              <AppContent />
            </ErrorBoundary>
          </ClientDataProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
};

export default App;
