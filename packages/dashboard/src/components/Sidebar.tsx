import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  MessageSquare,
  ListTodo,
  ShieldAlert,
  Brain,
  Zap,
  Cable,
  ShieldCheck,
  Settings,
  PanelLeftOpen,
  PanelLeftClose,
  FileText,
  FlaskConical,
  Store,
} from 'lucide-react';
import { useSidebar } from '../hooks/useSidebar';

const NAV_ITEMS: { to: string; label: string; icon: React.ReactNode; end?: boolean }[] = [
  { to: '/', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" />, end: true },
  { to: '/chat', label: 'Chat', icon: <MessageSquare className="w-5 h-5" /> },
  { to: '/tasks', label: 'Tasks', icon: <ListTodo className="w-5 h-5" /> },
  { to: '/security', label: 'Security', icon: <ShieldAlert className="w-5 h-5" /> },
  { to: '/personality', label: 'Personality', icon: <Brain className="w-5 h-5" /> },
  { to: '/skills', label: 'Skills', icon: <Zap className="w-5 h-5" /> },
  { to: '/connections', label: 'Connections', icon: <Cable className="w-5 h-5" /> },
  { to: '/reports', label: 'Reports', icon: <FileText className="w-5 h-5" /> },
  { to: '/experiments', label: 'Experiments', icon: <FlaskConical className="w-5 h-5" /> },
  { to: '/marketplace', label: 'Marketplace', icon: <Store className="w-5 h-5" /> },
  { to: '/security-settings', label: 'Security Config', icon: <ShieldCheck className="w-5 h-5" /> },
  { to: '/settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
];

const navLinkClass = (isActive: boolean, collapsed: boolean) =>
  `group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
  } ${collapsed ? 'justify-center' : ''}`;

export function Sidebar() {
  const { collapsed, toggleCollapse, mobileOpen, setMobileOpen } = useSidebar();
  const location = useLocation();

  // Close mobile overlay on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, setMobileOpen]);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo area */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-border">
        <Shield className="w-7 h-7 text-primary flex-shrink-0" />
        <span
          className={`font-bold text-lg whitespace-nowrap transition-opacity duration-200 ${
            collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
          }`}
        >
          SecureYeoman
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => navLinkClass(isActive, collapsed)}
          >
            <span className="flex-shrink-0">{icon}</span>
            <span
              className={`transition-opacity duration-200 ${
                collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
              }`}
            >
              {label}
            </span>
            {/* Collapsed tooltip */}
            {collapsed && (
              <span className="sidebar-tooltip">
                {label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Toggle button */}
      <div className="px-3 py-2 border-t border-border">
        <button
          onClick={toggleCollapse}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-5 h-5 flex-shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="w-5 h-5 flex-shrink-0" />
              <span className="transition-opacity duration-200">Collapse</span>
            </>
          )}
        </button>
      </div>

      {/* Version */}
      <div
        className={`px-4 py-3 border-t border-border text-xs text-muted-foreground transition-opacity duration-200 ${
          collapsed ? 'opacity-0 h-0 overflow-hidden py-0 border-t-0' : 'opacity-100'
        }`}
      >
        SecureYeoman v1.2.0
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col fixed left-0 top-0 h-screen bg-card border-r border-border z-30 transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-expanded)' }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="md:hidden fixed left-0 top-0 h-screen bg-card border-r border-border z-50 transition-transform duration-200"
            style={{ width: 'var(--sidebar-expanded)' }}
          >
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
