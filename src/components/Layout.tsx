import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/leads', label: 'Leads', icon: '🎯' },
  { to: '/pipeline', label: 'Pipeline', icon: '📋' },
  { to: '/contacts', label: 'Contacts', icon: '👥' },
  { to: '/properties', label: 'Properties', icon: '🏠' },
  { to: '/import-export', label: 'Import / Export', icon: '📁', adminOnly: true },
  { to: '/employees', label: 'Employees', icon: '🧑‍💼', adminOnly: true },
  { to: '/calls', label: 'Calls', icon: '📞' },
  { to: '/integrations', label: 'Ad Integrations', icon: '🔗', adminOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const isEmployee = user?.role === 'employee';
  const navItems = NAV_ITEMS.filter(item => !item.adminOnly || !isEmployee);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">🏢</div>
          PropertyInsta CRM
        </div>
        <div className="sidebar-section-label">Menu</div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">
                {user?.name}
                <span className={`role-badge ${isEmployee ? 'role-badge-employee' : 'role-badge-admin'}`}>
                  {isEmployee ? 'Employee' : 'Admin'}
                </span>
              </div>
              <div className="sidebar-user-email">{user?.email}</div>
            </div>
          </div>
          <button className="sidebar-link" onClick={handleLogout} style={{ marginTop: 8 }}>
            <span className="icon">🚪</span>
            Sign Out
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
