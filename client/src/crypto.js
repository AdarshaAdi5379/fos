import * as bip39 from '@scure/bip39';
import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { wordlist } from '@scure/bip39/wordlists/english.js';

// Configure secp256k1 with sha256 and hmac
secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

export class CryptoManager {
  constructor() {
    this.seedPhrase = null;
    this.privateKey = null;
    this.publicKey = null;
  }

  uint8ArrayToHex(uint8Array) {
    return Array.from(uint8Array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  hexToUint8Array(hex) {
    return new Uint8Array(
      hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    );
  }

  generateSeedPhrase() {
    this.seedPhrase = bip39.generateMnemonic(wordlist);
    return this.seedPhrase;
  }

  setSeedPhrase(seedPhrase) {
    if (!bip39.validateMnemonic(seedPhrase, wordlist)) {
      throw new Error('Invalid seed phrase');
    }
    this.seedPhrase = seedPhrase;
    this.deriveKeys();
  }

  async deriveKeys() {
    const seed = await bip39.mnemonicToSeed(this.seedPhrase);
    const privateKey = new Uint8Array(seed.slice(0, 32));
    this.privateKey = privateKey;
    
    const publicKey = secp.getPublicKey(privateKey, false);
    this.publicKey = this.uint8ArrayToHex(publicKey);
  }

  getPublicKey() {
    return this.publicKey;
  }

  getPrivateKey() {
    return this.privateKey ? this.uint8ArrayToHex(this.privateKey) : null;
  }

  async signMessage(message) {
    if (!this.privateKey) {
      throw new Error('No private key available');
    }
    
    const messageHash = sha256(new TextEncoder().encode(message));
    const signature = await secp.sign(messageHash, this.privateKey);
    
    return {
      signature: this.uint8ArrayToHex(signature),
      recovery: 0 // @noble/secp256k1 doesn't use recovery IDs in the same way
    };
  }

  async verifySignature(message, signature, publicKey) {
    const messageHash = sha256(new TextEncoder().encode(message));
    const signatureBytes = this.hexToUint8Array(signature);
    const publicKeyBytes = this.hexToUint8Array(publicKey);
    
    return secp.verify(signatureBytes, messageHash, publicKeyBytes);
  }

  async storeSeedPhrase(password) {
    if (!this.seedPhrase) return false;
    
    try {
      const encoder = new TextEncoder();
      const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );
      
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encoder.encode(this.seedPhrase)
      );
      
      const encryptedData = {
        encrypted: Array.from(new Uint8Array(encrypted)),
        salt: Array.from(salt),
        iv: Array.from(iv)
      };
      
      localStorage.setItem('unbound-seed', JSON.stringify(encryptedData));
      return true;
    } catch (error) {
      console.error('Failed to encrypt seed phrase:', error);
      return false;
    }
  }

  async retrieveSeedPhrase(password) {
    const encryptedData = localStorage.getItem('unbound-seed');
    if (!encryptedData) return null;
    
    try {
      const data = JSON.parse(encryptedData);
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      
      const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );
      
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: new Uint8Array(data.salt),
          iterations: 100000,
          hash: 'SHA-256'
        },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(data.iv) },
        key,
        new Uint8Array(data.encrypted)
      );
      
      const seedPhrase = decoder.decode(decrypted);
      if (bip39.validateMnemonic(seedPhrase, wordlist)) {
        this.setSeedPhrase(seedPhrase);
        return seedPhrase;
      }
    } catch (error) {
      console.error('Failed to decrypt seed phrase:', error);
    }
    return null;
  }

  clearStorage() {
    localStorage.removeItem('unbound-seed');
    this.seedPhrase = null;
    this.privateKey = null;
    this.publicKey = null;
  }
}