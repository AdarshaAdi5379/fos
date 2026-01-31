import React from 'react';
import { designTokens } from '../styles/design-tokens';

const Header = ({ currentUser, onLogout }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const navItems = [
    { path: '/', label: 'Feed', icon: '🏠' },
    { path: '/explore', label: 'Explore', icon: '🧭' },
    { path: '/settings', label: 'Settings', icon: '⚙️' }
  ];
  
  return (
    <header className="main-header">
      <div className="header-content">
        <div className="logo">
          <div style={{ 
            fontSize: '2rem',
            fontWeight: 800,
            color: designTokens.accentPrimary,
            background: `linear-gradient(45deg, ${designTokens.accentPrimary}, ${designTokens.accentSecondary})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            clipPath: 'polygon(50% 0%, 100% 50%, 100% 50%, 100% 50%, 50% 0, 100%)',
            width: '60px',
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: designTokens.shadowLg
          }}>
            UNBOUND
          </div>
        </div>
        
        <nav className="desktop-navigation">
          <ul className="nav-list">
            {navItems.map(item => (
              <li key={item.path}>
                <a 
                  href={item.path}
                  className={`nav-link ${window.location.pathname === item.path ? 'active' : ''}`}
                >
                  <item.icon className="nav-icon" />
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          
          <button 
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            ☰
          </button>
        </nav>
        
        <div className="user-actions">
          {currentUser && (
            <>
              <span className="welcome-text">Welcome back!</span>
              <button onClick={onLogout} className="logout-button">
                Logout
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="mobile-navigation-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-navigation">
            <ul className="nav-list">
              {navItems.map(item => (
                <li key={item.path}>
                  <a href={item.path} className="nav-link">
                    {item.icon}
                    <span>{item.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;