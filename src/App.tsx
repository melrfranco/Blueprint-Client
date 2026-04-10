import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ClientDataProvider } from './contexts/ClientDataContext';
import { LoginScreen } from './components/LoginScreen';
import { ClientDashboard } from './components/ClientDashboard';
import { ProfileSettings } from './components/ProfileSettings';
import { BottomNav } from './components/BottomNav';

const AppContent: React.FC = () => {
  const { isAuthenticated, authInitialized } = useAuth();
  const [activeTab, setActiveTab] = useState('home');

  if (!authInitialized) {
    return (
      <div className="bp-page">
        <div className="flex items-center justify-center h-full">
          <p className="bp-body-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

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

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ClientDataProvider>
          <AppContent />
        </ClientDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
