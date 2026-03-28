/**
 * Enhanced Crypto Manager with Secure Storage Integration
 * 
 * This file replaces the basic crypto.js implementation with secure storage
 * and improved key management.
 */

import {
  mnemonicToEntropy,
  entropyToMnemonic,
  validateMnemonic
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { getPublicKey, sign, verify, etc, hashes as secpHashes } from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { SecureStorage } from '../utils/SecureStorage';

// Configure secp256k1 with sha256 and hmacSha256
secpHashes.sha256 = (...m) => sha256(etc.concatBytes(...m));
secpHashes.hmacSha256 = (k, ...m) => hmac(sha256, k, etc.concatBytes(...m));

class CryptoManager {
  constructor() {
    this.seedPhrase = null;
    this.privateKey = null;
    this.publicKey = null;
    this.secureStorage = new SecureStorage();
    this.initialized = false;
  }

  /**
   * Initialize crypto manager with secure storage
   */
  async initialize(password) {
    try {
      // Initialize secure storage
      await this.secureStorage.initialize(password);

      // Check if we have existing data
      const hasData = await this.secureStorage.hasData();

      if (hasData) {
        // Retrieve existing seed phrase
        this.seedPhrase = await this.secureStorage.retrieveSeedPhrase();
        await this.deriveKeys();

        return {
          initialized: true,
          hasExistingData: true,
          seedPhrase: this.seedPhrase
        };
      } else {
        // Check for migration opportunity
        try {
          const migration = await this.secureStorage.migrateFromLocalStorage(password);
          if (migration.migrated) {
            this.seedPhrase = await this.secureStorage.retrieveSeedPhrase();
            await this.deriveKeys();

            return {
              initialized: true,
              hasExistingData: true,
              migrated: true,
              seedPhrase: this.seedPhrase
            };
          }
        } catch (migrationError) {
          console.warn('Migration failed:', migrationError);
        }
      }

      this.initialized = true;
      return {
        initialized: true,
        hasExistingData: false
      };
    } catch (error) {
      console.error('Failed to initialize crypto manager:', error);
      throw error;
    }
  }

  /**
   * Generate new seed phrase using BIP-39
   */
  async generateSeedPhrase() {
    try {
      const entropy = crypto.getRandomValues(new Uint8Array(16));
      this.seedPhrase = entropyToMnemonic(entropy, wordlist);
      return this.seedPhrase;
    } catch (error) {
      console.error('Failed to generate seed phrase:', error);
      throw new Error('Failed to generate cryptographic seed');
    }
  }

  /**
   * Set seed phrase and derive keys
   */
  setSeedPhrase(seedPhrase) {
    if (!validateMnemonic(seedPhrase, wordlist)) {
      throw new Error('Invalid seed phrase');
    }

    this.seedPhrase = seedPhrase;
  }

  /**
   * Derive cryptographic keys from seed phrase
   */
  async deriveKeys() {
    if (!this.seedPhrase) {
      throw new Error('Seed phrase not set');
    }

    try {
      // Convert seed phrase to entropy
      let entropy = mnemonicToEntropy(this.seedPhrase, wordlist);

      // Ensure entropy is in Uint8Array format for Web Crypto API
      if (typeof entropy === 'string') {
        entropy = new TextEncoder().encode(entropy);
      }

      // Derive private key using SHA-256 hash (Web Crypto API)
      const privateKeyBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', entropy));

      // Derive public key
      const publicKeyBytes = getPublicKey(privateKeyBytes, false);

      // Convert to hex strings (browser compatible)
      this.privateKey = Array.from(privateKeyBytes, byte => byte.toString(16).padStart(2, '0')).join('');
      this.publicKey = Array.from(publicKeyBytes, byte => byte.toString(16).padStart(2, '0')).join('');

      // Only store if secure storage is initialized
      if (this.secureStorage && this.secureStorage.initialized) {
        await this.secureStorage.storePrivateKey(this.privateKey, this.publicKey);
      }

      return {
        privateKey: this.privateKey,
        publicKey: this.publicKey
      };
    } catch (error) {
      console.error('Failed to derive keys:', error);
      throw new Error('Failed to derive cryptographic keys');
    }
  }

  /**
   * Store seed phrase securely
   */
  async storeSeedPhrase(password) {
    try {
      if (!this.seedPhrase) {
        throw new Error('Seed phrase not set');
      }

      if (!this.secureStorage.initialized) {
        await this.secureStorage.initialize(password);
      }

      await this.secureStorage.storeSeedPhrase(this.seedPhrase);
      return true;
    } catch (error) {
      console.error('Failed to store seed phrase:', error);
      throw new Error(error?.message || 'Failed to securely store seed phrase');
    }
  }

  /**
   * Retrieve seed phrase securely
   */
  async retrieveSeedPhrase(password) {
    try {
      if (!this.secureStorage.initialized) {
        await this.secureStorage.initialize(password);
      }
      this.seedPhrase = await this.secureStorage.retrieveSeedPhrase();
      await this.deriveKeys();
      return this.seedPhrase;
    } catch (error) {
      console.error('Failed to retrieve seed phrase:', error);
      throw new Error(error?.message || 'Failed to retrieve seed phrase');
    }
  }

  /**
   * Sign a message with the private key
   */
  async signMessage(message) {
    if (!this.privateKey) {
      throw new Error('Private key not available');
    }

    try {
      // Hash the message (Web Crypto API)
      const messageHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message)));

      // Sign with private key.
      // NOTE: In @noble/secp256k1 v3, `sign()` returns a Uint8Array (compact 64-byte signature by default).
      const privateKeyBytes = etc.hexToBytes(this.privateKey);
      const sigBytes = await sign(messageHash, privateKeyBytes, { lowS: true });

      // Convert to hex for transport (server expects compact signature hex)
      const signatureHex = etc.bytesToHex(sigBytes);

      return {
        signature: signatureHex,
        // Recovery isn't used by the current server verification flow.
        recovery: 0
      };
    } catch (error) {
      console.error('Failed to sign message:', error);
      throw new Error('Failed to sign message');
    }
  }

  /**
   * Verify a signature
   */
  async verifySignature(message, signature, publicKey, recovery) {
    try {
      const messageHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message)));
      const signatureBytes = new Uint8Array(signature.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const publicKeyBytes = new Uint8Array(publicKey.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

      // Verify signature
      const isValid = verify(signatureBytes, messageHash, publicKeyBytes);

      return isValid;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Get public key
   */
  getPublicKey() {
    return this.publicKey;
  }

  /**
   * Get seed phrase (for backup purposes)
   */
  getSeedPhrase() {
    return this.seedPhrase;
  }

  /**
   * Check if initialized
   */
  isInitialized() {
    return this.initialized && !!this.publicKey && !!this.privateKey;
  }

  /**
   * Clear all cryptographic data
   */
  async clearAll() {
    try {
      await this.secureStorage.clearAll();
      this.seedPhrase = null;
      this.privateKey = null;
      this.publicKey = null;
      this.initialized = false;
      return true;
    } catch (error) {
      console.error('Failed to clear cryptographic data:', error);
      throw error;
    }
  }

  /**
   * Get storage information
   */
  async getStorageInfo() {
    if (!this.secureStorage.initialized) {
      throw new Error('Secure storage not initialized');
    }

    return await this.secureStorage.getStorageInfo();
  }

  /**
   * Validate seed phrase
   */
  static validateSeedPhrase(seedPhrase) {
    return validateMnemonic(seedPhrase, wordlist);
  }

  /**
   * Generate secure random string
   */
  static generateSecureRandom(length = 32) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Derive address-like identifier from public key
   */
  async deriveAddress() {
    if (!this.publicKey) {
      throw new Error('Public key not available');
    }

    // Create a shorter, address-like identifier
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.publicKey)));
    const hashHex = Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
    return `0x${hashHex.slice(0, 40)}`; // First 20 bytes like Ethereum address
  }

  /**
   * Close secure storage
   */
  async close() {
    await this.secureStorage.close();
    this.initialized = false;
  }
}

export { CryptoManager };
