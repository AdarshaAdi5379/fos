import { useState } from 'react';

interface SidebarProps {
  publicKey: string;
  currentView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  onNewPost: () => void;
}

export function Sidebar({ publicKey, currentView, onNavigate, onLogout, onNewPost }: SidebarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const truncateKey = (key: string) => {
    if (!key) return '';
    return `${key.substring(0, 8)}...${key.substring(key.length - 6)}`;
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon glow-green">UNBOUND</div>
        <div className="logo-tagline">Anonymous. Verified. Immutable.</div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <button 
          className={`nav-item ${currentView === 'home' ? 'active' : ''}`}
          onClick={() => onNavigate('home')}
        >
          <span className="nav-icon">⌂</span>
          <span>Home</span>
        </button>
        <button 
          className={`nav-item ${currentView === 'explore' ? 'active' : ''}`}
          onClick={() => onNavigate('explore')}
        >
          <span className="nav-icon">◈</span>
          <span>Explore</span>
        </button>
        <button 
          className={`nav-item ${currentView === 'profile' ? 'active' : ''}`}
          onClick={() => onNavigate('profile')}
        >
          <span className="nav-icon">◉</span>
          <span>Profile</span>
        </button>
        <button 
          className={`nav-item ${currentView === 'wallet' ? 'active' : ''}`}
          onClick={() => onNavigate('wallet')}
        >
          <span className="nav-icon">◈</span>
          <span>Wallet</span>
        </button>
        <button 
          className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          <span className="nav-icon">⚙</span>
          <span>Settings</span>
        </button>
      </nav>

      {/* Identity Display */}
      <div className="sidebar-identity">
        <div className="identity-label">Your Key</div>
        <div className="identity-key" title={publicKey}>
          {truncateKey(publicKey)}
        </div>
        <button className="btn-copy" onClick={handleCopyKey}>
          {copied ? '✓ Copied!' : 'Copy Full Key'}
        </button>
      </div>

      {/* New Post Button */}
      <button className="btn btn-primary btn-post" onClick={onNewPost}>
        + New Post
      </button>

      {/* Logout */}
      <button className="btn-logout" onClick={onLogout}>
        ⚠ Logout
      </button>
    </aside>
  );
}

export default Sidebar;
