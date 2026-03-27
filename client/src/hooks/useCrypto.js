import { useState, useContext, createContext } from 'react';
import { CryptoManager } from '../crypto/CryptoManager';

const CryptoContext = createContext({
  identity: null,
  posts: [],
  theme: 'light',
  viewMode: 'chronological',
  filters: {}
});

// Singleton CryptoManager instance - persists across renders
const cryptoManagerInstance = new CryptoManager();

export const useCrypto = () => {
  const context = useContext(CryptoContext);
  
  const createIdentity = async () => {
    const seed = await cryptoManagerInstance.generateSeedPhrase();
    cryptoManagerInstance.setSeedPhrase(seed);
    await cryptoManagerInstance.deriveKeys();
    
    const newIdentity = {
      seedPhrase: seed,
      publicKey: cryptoManagerInstance.getPublicKey(),
      createdAt: new Date().toISOString()
    };
    
    if (context.setIdentity) {
      context.setIdentity(newIdentity);
    }
    return newIdentity;
  };
  
  const signMessage = async (message) => {
    return await cryptoManagerInstance.signMessage(message);
  };
  
  const verifySignature = async (message, signature, publicKey) => {
    return await cryptoManagerInstance.verifySignature(message, signature, publicKey);
  };
  
  const clearIdentity = () => {
    localStorage.removeItem('unbound-seed');
    if (context.setIdentity) {
      context.setIdentity(null);
    }
  };
  
  return {
    ...context,
    createIdentity,
    signMessage,
    verifySignature,
    clearIdentity,
    cryptoManager: cryptoManagerInstance
  };
};

export default useCrypto;
