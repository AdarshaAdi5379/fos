import { useState, useContext, createContext } from 'react';
import CryptoManager from '../crypto';

const CryptoContext = createContext({
  identity: null,
  posts: [],
  theme: 'light',
  viewMode: 'chronological',
  filters: {}
});

export const useCrypto = () => {
  const context = useContext(CryptoContext);
  
  const createIdentity = () => {
    const cryptoManager = new CryptoManager();
    const seed = cryptoManager.generateSeedPhrase();
    cryptoManager.setSeedPhrase(seed);
    cryptoManager.deriveKeys();
    
    const newIdentity = {
      seedPhrase: seed,
      publicKey: cryptoManager.getPublicKey(),
      createdAt: new Date().toISOString()
    };
    
    context.setIdentity(newIdentity);
    return newIdentity;
  };
  
  const signMessage = async (message) => {
    const cryptoManager = new CryptoManager();
    return await cryptoManager.signMessage(message);
  };
  
  const verifySignature = async (message, signature, publicKey) => {
    const cryptoManager = new CryptoManager();
    return await cryptoManager.verifySignature(message, signature, publicKey);
  };
  
  const clearIdentity = () => {
    localStorage.removeItem('unbound-seed');
    context.setIdentity(null);
  };
  
  return {
    ...context,
    createIdentity,
    signMessage,
    verifySignature,
    clearIdentity,
    cryptoManager: new CryptoManager()
  };
};

export default useCrypto;