import React, { useState } from 'react';
import { Button } from '../Common/Button';
import { Input } from '../Common/Input';

const LoginSection = ({ 
  title,
  description,
  showPasswordLogin = true,
  onLoginWithSeed,
  onLoginWithPassword 
}) => {
  const [seedPhrase, setSeedPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const handleLoginWithSeed = async () => {
    setIsLoading(true);
    try {
      // Import cryptoManager to avoid circular dependencies
      const { CryptoManager } = await import('../../crypto.js');
      const cryptoManager = new CryptoManager();
      
      cryptoManager.setSeedPhrase(seedPhrase);
      await cryptoManager.deriveKeys();
      
      const publicKey = cryptoManager.getPublicKey();
      onLoginWithSeed({ seedPhrase, publicKey });
    } catch (error) {
      console.error('Login with seed failed:', error);
      // Show user-friendly error
      onLoginWithPassword && onLoginWithPassword('Invalid seed phrase', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="auth-section">
      <h2>{title}</h2>
      <p className="auth-description">{description}</p>
      
      <div className="login-options">
        <div className="login-option">
          <h3>Seed Phrase Login</h3>
          <Input
            type="text"
            placeholder="Enter your 12-word seed phrase"
            value={seedPhrase}
            onChange={(e) => setSeedPhrase(e.target.value)}
            rows={3}
            disabled={isLoading}
          />
          <Button 
            onClick={handleLoginWithSeed}
            disabled={isLoading || !seedPhrase.trim()}
            variant="primary"
            className="login-button"
          >
            {isLoading ? 'Logging in...' : 'Login with Seed'}
          </Button>
        </div>
        
        {showPasswordLogin && (
          <div className="login-option">
            <h3>Password Login</h3>
            <Input
              type="password"
              placeholder="Enter password to decrypt stored seed"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="password-input"
            />
            <Button 
              onClick={handleLoginWithSeed}
              disabled={isLoading || !password.trim()}
              variant="secondary"
              className="login-button"
            >
              {isLoading ? 'Logging in...' : 'Login with Password'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginSection;