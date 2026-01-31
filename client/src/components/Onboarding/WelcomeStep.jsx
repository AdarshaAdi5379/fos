import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useCrypto } from '../../hooks/useCrypto';

const WelcomeStep = ({ onComplete }) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const [started, setStarted] = useState(false);
  
  const { currentUser } = useCrypto();
  const { ws } = useWebSocket();
  
  const handleGetStarted = async () => {
    setStarted(true);
    
    // Trigger animation and transition
    setTimeout(() => {
      onComplete();
    }, 500);
  };
  
  return (
    <div className="step">
      <div className="step-icon">
        <div className="welcome-animation">
          <div className="unbound-logo">UNBOUND</div>
        </div>
      </div>
      
      <div className="step-content">
        <h2>Welcome to Unbound</h2>
        <p className="step-description">
          A cryptographically pseudonymous platform for unrestricted expression.
        </p>
        
        {!acknowledged && (
          <div className="acknowledgment">
            <input
              type="checkbox"
              id="acknowledgment-checkbox"
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <label htmlFor="acknowledgment-checkbox">
              I understand this is a platform for free expression and assume all associated risks.
            </label>
          </div>
        )}
        
        {acknowledged && !started && (
          <Button 
            onClick={handleGetStarted}
            variant="primary"
            className="get-started-button"
            disabled={!currentUser}
          >
            Get Started
          </Button>
        )}
        
        {started && (
          <div className="starting-message">
            Initializing your cryptographic identity...
          </div>
        )}
      </div>
    </div>
  );
};

export default WelcomeStep;