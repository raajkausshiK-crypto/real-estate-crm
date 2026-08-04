import { StrictMode, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Pipeline from './pages/Pipeline';
import Contacts from './pages/Contacts';
import Properties from './pages/Properties';
import ImportExport from './pages/ImportExport';
import Integrations from './pages/Integrations';
import Calls from './pages/Calls';
import Employees from './pages/Employees';
import './index.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Page error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: '#666', margin: '12px 0' }}>This page encountered an error.</p>
          <button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 15, boxShadow: '0 4px 14px rgba(37,99,235,0.3)' }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="leads" element={<ErrorBoundary><Leads /></ErrorBoundary>} />
            <Route path="pipeline" element={<ErrorBoundary><Pipeline /></ErrorBoundary>} />
            <Route path="contacts" element={<ErrorBoundary><Contacts /></ErrorBoundary>} />
            <Route path="properties" element={<ErrorBoundary><Properties /></ErrorBoundary>} />
            <Route path="import-export" element={<ErrorBoundary><ImportExport /></ErrorBoundary>} />
            <Route path="integrations" element={<ErrorBoundary><Integrations /></ErrorBoundary>} />
            <Route path="calls" element={<ErrorBoundary><Calls /></ErrorBoundary>} />
            <Route path="employees" element={<ErrorBoundary><Employees /></ErrorBoundary>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
