import { Routes, Route, Navigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { DashboardLayout } from './components/DashboardLayout';
import { LoginPage } from './pages/LoginPage';
import { useAuth } from './hooks/useAuth';
import { SidebarProvider } from './hooks/useSidebar';

function App() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Shield className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Routes>
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
        } />
        <Route path="/*" element={
          isAuthenticated ? <DashboardLayout /> : <Navigate to="/login" replace />
        } />
      </Routes>
    </SidebarProvider>
  );
}

export default App;
