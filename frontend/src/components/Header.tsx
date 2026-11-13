import React from 'react';
import {
  LayoutDashboard, Radio, Sliders, BarChart3, TrendingUp, Droplets,
  FlaskConical, Cpu, BookOpen, RefreshCw, Wifi, WifiOff, Bell
} from 'lucide-react';
import { ConnectionStatus, ActiveView } from '../types';

interface HeaderProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  status: ConnectionStatus;
  packetCount: number;
  onOpenESP32Modal: () => void;
  onReconnect: () => void;
  unreadAlarmCount?: number;
  onOpenAlarmCenter: () => void;
}

const navItems: { id: ActiveView; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
  { id: 'monitoring', label: 'Monitoring', icon: <Radio className="w-[18px] h-[18px]" /> },
  { id: 'control', label: 'Action Center', icon: <Sliders className="w-[18px] h-[18px]" /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-[18px] h-[18px]" /> },
  { id: 'forecast', label: 'Forecast', icon: <TrendingUp className="w-[18px] h-[18px]" /> },
  { id: 'water-quality', label: 'Water Quality', icon: <Droplets className="w-[18px] h-[18px]" /> },
  { id: 'scenarios', label: 'Scenarios', icon: <FlaskConical className="w-[18px] h-[18px]" /> },
  { id: 'technology', label: 'Technology', icon: <Cpu className="w-[18px] h-[18px]" /> },
  { id: 'research', label: 'Research', icon: <BookOpen className="w-[18px] h-[18px]" /> },
];

export const Header: React.FC<HeaderProps> = ({
  activeView,
  onNavigate,
  status,
  packetCount,
  onOpenESP32Modal,
  onReconnect,
  unreadAlarmCount = 0,
  onOpenAlarmCenter,
}) => {
  const isConnected = status === 'connected';

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-sidebar z-40 flex-col items-center py-4 bg-depth-mid border-r border-edge">
        {/* Brand */}
        <button
          onClick={() => onNavigate('overview')}
          className="w-9 h-9 rounded-lg bg-aqua/15 flex items-center justify-center mb-6 group"
          title="AquaSense"
        >
          <Droplets className="w-5 h-5 text-aqua group-hover:scale-110 transition-transform" />
        </button>

        {/* Nav */}
        <nav className="flex-1 flex flex-col items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`sidebar-item ${activeView === item.id ? 'active' : ''}`}
              title={item.label}
            >
              {item.icon}
            </button>
          ))}
        </nav>

        {/* Bottom: Alarms + connection + ESP32 */}
        <div className="flex flex-col items-center gap-2.5 mt-auto">
          {/* Alarm Bell Button */}
          <button
            onClick={onOpenAlarmCenter}
            className="sidebar-item relative"
            title={unreadAlarmCount > 0 ? `${unreadAlarmCount} active alarms` : 'Alarm Center'}
          >
            <Bell className={`w-[18px] h-[18px] ${unreadAlarmCount > 0 ? 'text-critical animate-pulse' : 'text-txt-3'}`} />
            {unreadAlarmCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-critical text-depth-deep text-[9px] font-mono font-bold flex items-center justify-center shadow-md">
                {unreadAlarmCount}
              </span>
            )}
          </button>

          <button
            onClick={onOpenESP32Modal}
            className="sidebar-item"
            title="ESP32 Test"
          >
            <Cpu className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={onReconnect}
            className="sidebar-item"
            title={isConnected ? `Connected · ${packetCount} packets` : 'Reconnect'}
          >
            {isConnected ? (
              <div className="relative">
                <Wifi className="w-[18px] h-[18px] text-aqua" />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-aqua" style={{ boxShadow: '0 0 6px rgba(45,212,168,0.5)' }} />
              </div>
            ) : (
              <WifiOff className="w-[18px] h-[18px] text-critical" />
            )}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-depth-mid/95 backdrop-blur-md border-b border-edge">
        <div className="flex items-center justify-between px-4 h-12">
          <button onClick={() => onNavigate('overview')} className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-aqua" />
            <span className="font-heading font-bold text-sm text-txt-1">AquaSense</span>
          </button>
          <div className="flex items-center gap-2">
            {/* Mobile Alarm Bell */}
            <button
              onClick={onOpenAlarmCenter}
              className="p-1.5 text-txt-3 relative"
              title="Alarm Center"
            >
              <Bell className={`w-4 h-4 ${unreadAlarmCount > 0 ? 'text-critical' : 'text-txt-3'}`} />
              {unreadAlarmCount > 0 && (
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-critical" />
              )}
            </button>
            <div className={`status-dot ${isConnected ? 'live' : 'error'}`} />
            <button onClick={onReconnect} className="p-1.5 text-txt-3">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-0.5 px-2 pb-2 overflow-x-auto scrollbar-none">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeView === item.id
                  ? 'bg-aqua/10 text-aqua'
                  : 'text-txt-3 hover:text-txt-2'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
    </>
  );
};
