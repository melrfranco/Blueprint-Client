import React from 'react';
import { HomeIcon, CalendarIcon, ServicesIcon, ProfileIcon } from './icons';

interface BottomNavProps {
  activeTab: string;
  onChange: (tab: string) => void;
}

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'appointments', label: 'Appointments', icon: CalendarIcon },
  { id: 'services', label: 'Services', icon: ServicesIcon },
  { id: 'profile', label: 'Profile', icon: ProfileIcon },
];

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChange }) => {
  return (
    <nav className="bp-bottomnav fixed bottom-0 left-0 right-0 z-50">
      <div className="max-w-4xl mx-auto px-4 py-2">
        <div className="flex items-center justify-around">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className="flex flex-col items-center gap-1 px-4 py-2 rounded-full transition-all"
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
