import { useState, useEffect, useRef, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Shield,
  LayoutDashboard,
  ShieldAlert,
  Brain,
  Zap,
  Cable,
  Code,
  Users,
  Settings,
  Code2,
  Sparkles,
  PanelLeftOpen,
  PanelLeftClose,
  RefreshCw,
  Activity,
  User,
  ChevronDown,
  LogOut,
  Sun,
  Moon,
  Plus,
  Info,
  X,
  MessagesSquare,
  ClipboardList,
  GitMerge,
  Target,
  Layers,
  SlidersHorizontal,
  Building2,
  Key,
  UserCircle,
  Users2,
  ChevronRight,
} from 'lucide-react';
import { useSidebar } from '../hooks/useSidebar';
import { useTheme } from '../hooks/useTheme';
import { getAccessToken } from '../api/client';
import { Logo } from './Logo';
import { NewEntityDialog } from './NewEntityDialog';
import {
  fetchExtensionConfig,
  fetchSecurityPolicy,
  fetchProactiveConfig,
  fetchHealth,
} from '../api/client';

export interface SidebarProps {
  isConnected: boolean;
  wsConnected: boolean;
  reconnecting: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

type NavItem = { to: string; label: string; icon: React.ReactNode; end?: boolean };

const BASE_TOP_ITEMS: NavItem[] = [
  { to: '/metrics', label: 'Mission Control', icon: <LayoutDashboard className="w-5 h-5" /> },
  { to: '/security', label: 'Security', icon: <ShieldAlert className="w-5 h-5" /> },
  { to: '/automation', label: 'Automation', icon: <Layers className="w-5 h-5" /> },
  { to: '/chat', label: 'Chat', icon: <MessagesSquare className="w-5 h-5" /> },
  { to: '/editor', label: 'Editor', icon: <Code className="w-5 h-5" /> },
  { to: '/personality', label: 'Personality', icon: <Brain className="w-5 h-5" /> },
  { to: '/skills', label: 'Skills', icon: <Zap className="w-5 h-5" /> },
];

const MID_ITEMS: NavItem[] = [
  { to: '/connections', label: 'Connections', icon: <Cable className="w-5 h-5" /> },
];

const BASE_ADMIN_ITEMS: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  { to: '/security-settings', label: 'Security', icon: <Shield className="w-5 h-5" /> },
  { to: '/api-keys', label: 'Secrets', icon: <Key className="w-5 h-5" /> },
  { to: '/workspaces', label: 'Workspaces', icon: <Building2 className="w-5 h-5" /> },
  { to: '/users', label: 'Users', icon: <UserCircle className="w-5 h-5" /> },
  { to: '/roles', label: 'Roles', icon: <Users2 className="w-5 h-5" /> },
];

const navLinkClass = (isActive: boolean, collapsed: boolean) =>
  `group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
    isActive
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
  } ${collapsed ? 'justify-center' : ''}`;

function parseJwtRole(): string {
  try {
    const token = getAccessToken();
    if (!token) return 'unknown';
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role ?? 'user';
  } catch {
    return 'user';
  }
}

export function Sidebar({
  isConnected,
  wsConnected,
  reconnecting,
  onRefresh,
  onLogout,
}: SidebarProps) {
  const { collapsed, toggleCollapse, mobileOpen, setMobileOpen } = useSidebar();
  const { theme, toggle: toggleTheme } = useTheme();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(
    () => { try { return localStorage.getItem('sy_admin_open') !== 'false'; } catch { return true; } }
  );
  const profileRef = useRef<HTMLDivElement>(null);
  const role = parseJwtRole();

  const { data: agentsData } = useQuery({
    queryKey: ['subAgentProfiles'],
    queryFn: () => fetch('/api/v1/agents/profiles').then((r) => r.json()),
    staleTime: 30000,
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    staleTime: 30000,
  });

  const { data: extensionConfig } = useQuery({
    queryKey: ['extensionConfig'],
    queryFn: fetchExtensionConfig,
    staleTime: 30000,
  });

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    staleTime: 30000,
  });

  const { data: proactiveConfig } = useQuery({
    queryKey: ['proactiveConfig'],
    queryFn: fetchProactiveConfig,
    staleTime: 30000,
  });

  const subAgentsAllowed = securityPolicy?.allowSubAgents ?? false;
  const a2aAllowed = securityPolicy?.allowA2A ?? false;
  const multimodalAllowed = securityPolicy?.allowMultimodal ?? false;
  const hasAgents =
    subAgentsAllowed || a2aAllowed || multimodalAllowed || (agentsData?.profiles?.length ?? 0) > 0;
  const extensionsEnabled =
    (securityPolicy?.allowExtensions ?? false) || extensionConfig?.config?.enabled === true;
  const proactiveEnabled =
    (securityPolicy?.allowProactive ?? false) || (proactiveConfig?.config as any)?.enabled === true;
  const experimentsEnabled = securityPolicy?.allowExperiments ?? false;
  const storybookEnabled = securityPolicy?.allowStorybook ?? false;

  const { topItems, adminItems } = useMemo(() => {
    const top: NavItem[] = [...BASE_TOP_ITEMS];
    top.push({ to: '/intent', label: 'Intent', icon: <Target className="w-5 h-5" /> });
    if (proactiveEnabled) top.push({ to: '/proactive', label: 'Proactive', icon: <Sparkles className="w-5 h-5" /> });
    if (hasAgents) top.push({ to: '/agents', label: 'Agents', icon: <Users className="w-5 h-5" /> });

    return { topItems: top, adminItems: [...BASE_ADMIN_ITEMS] };
  }, [hasAgents, extensionsEnabled, proactiveEnabled, experimentsEnabled, storybookEnabled]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, setMobileOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem('sy_admin_open', String(adminOpen)); } catch {}
  }, [adminOpen]);

  const groupHeaderClass =
    'flex items-center gap-3 px-3 py-2 w-full rounded-lg text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200';

  const renderNavItem = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => navLinkClass(isActive, collapsed)}
    >
      <span className="w-5 h-5 flex-shrink-0">{item.icon}</span>
      <span className={`transition-opacity duration-200 ${collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
        {item.label}
      </span>
      {collapsed && <span className="sidebar-tooltip">{item.label}</span>}
    </NavLink>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-border">
        <Logo size={28} />
        <span
          className={`font-bold text-lg whitespace-nowrap transition-opacity duration-200 flex-1 ${
            collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
          }`}
        >
          SecureYeoman
        </span>
        {!collapsed && (
          <button
            onClick={onRefresh}
            className="btn-ghost p-1.5 rounded flex-shrink-0"
            aria-label="Refresh metrics"
            title="Refresh metrics"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      <nav
        className={`flex-1 px-3 py-4 overflow-y-auto ${collapsed ? 'overflow-hidden scrollbar-hide space-y-0.5' : 'space-y-1'}`}
      >
        {/* Top items: Metrics, Chat, Editor, Personality, Skills, [Proactive], [Agents], Intent */}
        {topItems.map(renderNavItem)}

        {/* Mid items: Connections, Security */}
        {MID_ITEMS.map(renderNavItem)}

        {/* Developers — conditional, flat item */}
        {(extensionsEnabled || experimentsEnabled || storybookEnabled) && renderNavItem(
          { to: '/developers', label: 'Developers', icon: <Code2 className="w-5 h-5" /> }
        )}

        {/* Administration collapsible group */}
        {collapsed && <div className="border-t border-border/30 mx-2 my-1" />}
        <div className={collapsed ? '' : 'space-y-0.5 mt-1'}>
          {!collapsed && (
            <button onClick={() => setAdminOpen((v) => !v)} className={groupHeaderClass}>
              <SlidersHorizontal className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-left">Administration</span>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${adminOpen ? 'rotate-90' : ''}`} />
            </button>
          )}
          {(collapsed || adminOpen) && (
            <div className={!collapsed ? 'ml-3 pl-3 border-l border-border/50 space-y-0.5' : ''}>
              {adminItems.map(renderNavItem)}
            </div>
          )}
        </div>
      </nav>

      <div className={`${collapsed ? 'px-2 py-2' : 'px-3 py-2'} border-t border-border`}>
        <button
          onClick={() => {
            setNewDialogOpen(true);
          }}
          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200`}
        >
          <Plus className="w-4 h-4" />
          <span
            className={`transition-opacity duration-200 ${
              collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            }`}
          >
            New
          </span>
        </button>
      </div>

      <div
        className={`py-2 border-t border-border flex items-center gap-3 ${collapsed ? 'px-3 justify-center' : 'px-5 justify-between'}`}
      >
        <div className={`flex items-center gap-1.5 ${collapsed ? '' : 'pl-2'}`}>
          <Activity
            className={`w-3.5 h-3.5 ${wsConnected ? 'text-success' : 'text-muted-foreground'}`}
          />
          <span className={`text-xs text-muted-foreground ${collapsed ? 'hidden' : ''}`}>
            {reconnecting ? 'Reconnecting...' : 'Live'}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 ${collapsed ? '' : 'pr-2'}`}>
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success' : 'bg-destructive'}`}
          />
          <span className={`text-xs text-muted-foreground ${collapsed ? 'hidden' : ''}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className={`border-t border-border ${collapsed ? 'px-3 py-2' : 'px-5 py-2'}`}>
        <button
          onClick={toggleCollapse}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 ${
            collapsed ? 'justify-center' : ''
          }`}
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

      <div
        ref={profileRef}
        className={`relative border-t border-border ${collapsed ? 'px-3 py-2' : 'px-5 py-2'}`}
      >
        <button
          onClick={() => {
            setProfileOpen((v) => !v);
          }}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 ${
            collapsed ? 'justify-center' : ''
          }`}
          aria-label="User menu"
          aria-expanded={profileOpen}
          aria-haspopup="menu"
        >
          <User className="w-5 h-5 flex-shrink-0" />
          <span
            className={`flex-1 text-left transition-opacity duration-200 ${
              collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            }`}
          >
            Admin
          </span>
          {!collapsed && (
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${profileOpen ? 'rotate-180' : ''}`}
            />
          )}
        </button>

        {profileOpen && (
          <div
            className={`absolute ${
              collapsed ? 'left-full bottom-0 ml-2' : 'left-3 right-3 bottom-full mb-1'
            } bg-card border rounded-md shadow-lg z-50`}
            role="menu"
          >
            <div className="px-3 py-2 border-b">
              <p className="text-sm font-medium">Admin</p>
              <p className="text-xs text-muted-foreground capitalize">{role}</p>
            </div>

            <button
              onClick={() => {
                toggleTheme();
                setProfileOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center gap-2 transition-all duration-200"
              role="menuitem"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>

            <button
              onClick={() => {
                setProfileOpen(false);
                setAboutOpen(true);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center gap-2 transition-all duration-200"
              role="menuitem"
            >
              <Info className="w-4 h-4" />
              About
            </button>

            <button
              onClick={() => {
                setProfileOpen(false);
                onLogout();
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center gap-2 transition-all duration-200 text-destructive"
              role="menuitem"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside
        className="hidden md:flex flex-col fixed left-0 top-0 h-screen bg-card border-r border-border z-30 transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-expanded)' }}
      >
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => {
              setMobileOpen(false);
            }}
          />
          <aside
            className="md:hidden fixed left-0 top-0 h-screen bg-card border-r border-border z-50 transition-transform duration-200"
            style={{ width: 'var(--sidebar-expanded)' }}
          >
            {sidebarContent}
          </aside>
        </>
      )}

      <NewEntityDialog
        open={newDialogOpen}
        onClose={() => {
          setNewDialogOpen(false);
        }}
      />

      {aboutOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => {
            setAboutOpen(false);
          }}
        >
          <div
            className="bg-background border rounded-lg p-6 w-full max-w-sm shadow-lg"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">About SecureYeoman</h3>
              <button
                onClick={() => {
                  setAboutOpen(false);
                }}
                className="btn-ghost p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">Version</span>
                <span className="text-sm font-medium">{health?.version ?? '...'}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">Network</span>
                {health?.networkMode === 'public' ? (
                  <span className="text-sm font-medium text-success">Public (TLS Secured)</span>
                ) : health?.networkMode === 'lan' ? (
                  <span className="text-sm font-medium text-warning">Network (No TLS)</span>
                ) : (
                  <span className="text-sm font-medium text-success">Local Only</span>
                )}
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className="text-sm font-medium text-success">Connected</span>
              </div>
              <div className="pt-2">
                <p className="text-xs text-muted text-center">
                  Your AI Security Yeoman
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
