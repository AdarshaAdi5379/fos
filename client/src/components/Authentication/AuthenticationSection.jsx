import React from 'react';

const AuthenticationSection = ({ currentUser, onLogout }) => {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };
  
  const confirmLogout = () => {
    onLogout();
    setShowLogoutConfirm(false);
  };
  
  const cancelLogout = () => {
    setShowLogoutConfirm(false);
  };
  
  if (!currentUser) {
    return (
      <div className="auth-section">
        <h2>Authentication</h2>
        <p className="auth-description">
          You are not logged in. Generate a new identity to get started.
        </p>
      </div>
    );
  }
  
  return (
    <div className="auth-section">
      <h2>Your Identity</h2>
      <div className="identity-display">
        <div className="identity-info">
          <h3>Public Key</h3>
          <code className="public-key">{currentUser?.publicKey?.substring(0, 40) || ''}</code>
        </div>
        <div className="identity-actions">
          <Button 
            onClick={handleLogout}
            variant="secondary"
            size="sm"
          >
            Logout
          </Button>
        </div>
      </div>
      
      {showLogoutConfirm && (
        <div className="logout-confirm">
          <div className="confirm-message">
            Are you sure you want to logout?
          </div>
          <div className="confirm-actions">
            <Button 
              onClick={confirmLogout}
              variant="primary"
              size="sm"
            >
              Yes, Logout
            </Button>
            <Button 
              onClick={cancelLogout}
              variant="secondary"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthenticationSection;