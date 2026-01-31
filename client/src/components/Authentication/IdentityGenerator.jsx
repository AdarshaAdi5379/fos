import React, { useState } from 'react';
import { Button } from '../Common/Button';
import { Input } from '../Common/Input';

const IdentityGenerator = ({ onIdentityGenerated }) => {
  const [step, setStep] = useState(1);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const generateSeedPhrase = async () => {
    setIsGenerating(true);
    try {
      // Import cryptoManager directly to avoid circular dependencies
      const { CryptoManager } = await import('../crypto.js');
      const cryptoManager = new CryptoManager();
      
      const seed = cryptoManager.generateSeedPhrase();
      setSeedPhrase(seed);
      await cryptoManager.deriveKeys();
      
      const publicKey = cryptoManager.getPublicKey();
      onIdentityGenerated({ seedPhrase, publicKey });
      setStep(2);
    } catch (error) {
      console.error('Identity generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };
  
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };
  
  return (
    <div className="auth-section">
      <h2>Generate New Identity</h2>
      <p className="auth-description">
        Generate a cryptographically secure identity with a 12-word seed phrase.
        Your seed phrase is your master key - save it in a secure location.
      </p>
      
      {step === 1 && (
        <div className="step">
          <Button 
            onClick={generateSeedPhrase}
            disabled={isGenerating}
            variant="primary"
          >
            {isGenerating ? 'Generating...' : 'Generate Seed Phrase'}
          </Button>
        </div>
      )}
      
      {step === 2 && (
        <div className="step">
          <div className="seed-phrase-display">
            <h3>Your Seed Phrase (Save This!)</h3>
            <p className="seed-phrase-text">{seedPhrase}</p>
            <div className="seed-phrase-actions">
              <Button 
                onClick={() => copyToClipboard(seedPhrase)}
                variant="secondary"
                size="sm"
              >
                Copy to Clipboard
              </Button>
            </div>
          </div>
          <div className="step">
            <h3>Identity Generated Successfully!</h3>
            <p className="auth-description">
              Your cryptographic identity has been created.
              Your public key: <code>{seedPhrase ? (new (await import('../crypto.js')).CryptoManager()).getPublicKey().substring(0, 20) + '...' : ''}</code>
            </p>
            <Button 
              onClick={() => onIdentityGenerated({ seedPhrase, publicKey: seedPhrase ? (new (await import('../crypto.js')).CryptoManager()).getPublicKey() : '' })}
              variant="primary"
            >
              Continue to Unbound
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IdentityGenerator;