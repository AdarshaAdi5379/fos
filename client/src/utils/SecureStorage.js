/**
 * Secure Storage Manager
 * 
 * Provides encrypted storage for sensitive data using IndexedDB with AES-GCM encryption
 * and proper key derivation using PBKDF2.
 */

class SecureStorage {
  constructor() {
    this.dbName = 'unbound-secure-storage';
    // Version bump so existing installs upgrade and get all object stores.
    // We also self-heal in `openDatabase()` if the DB exists but is missing stores.
    this.dbVersion = 2;
    this.db = null;
    this.encryptionKey = null;
    this.initialized = false;
  }

  /**
   * Initialize secure storage
   */
  async initialize(password) {
    try {
      // Initialize IndexedDB first so we can read/write the salt
      this.db = await this.openDatabase();

      // Derive encryption key from password using persisted salt
      this.encryptionKey = await this.deriveKey(password);
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize secure storage:', error);
      throw error;
    }
  }

  /**
   * Derive encryption key using PBKDF2.
   * Uses a persisted salt stored in IndexedDB so the same key can be
   * re-derived on subsequent sessions with the correct password.
   */
  async deriveKey(password) {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // Try to retrieve existing salt, generate a new one only if none exists
    let salt = await this.getSalt();
    if (!salt) {
      salt = crypto.getRandomValues(new Uint8Array(32));
      await this.storeSalt(salt);
    }
    
    // Derive key using PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    return key;
  }

  /**
   * Store salt for key derivation
   */
  async storeSalt(salt) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['meta'], 'readwrite');
      const store = transaction.objectStore('meta');
      const request = store.put({ id: 'salt', value: Array.from(salt) });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieve stored salt
   */
  async getSalt() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['meta'], 'readonly');
      const store = transaction.objectStore('meta');
      const request = store.get('salt');
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? new Uint8Array(result.value) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Open IndexedDB database
   */
  async openDatabase() {
    const requiredStores = ['seeds', 'keys', 'meta'];

    const createMissingStores = (db) => {
      // Create object stores if they don't exist (idempotent across upgrades)
      if (!db.objectStoreNames.contains('seeds')) {
        db.createObjectStore('seeds', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'id' });
      }
    };

    const openWithVersion = (version, allowRetry) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, version);
        const timeoutId = setTimeout(() => {
          try {
            request.onerror = null;
            request.onsuccess = null;
            request.onupgradeneeded = null;
            request.onblocked = null;
          } catch {
            // ignore
          }
          reject(new Error('Secure storage open timed out. Close other Unbound tabs and retry.'));
        }, 8000);

        request.onerror = () => {
          clearTimeout(timeoutId);
          reject(request.error);
        };

        request.onblocked = () => {
          clearTimeout(timeoutId);
          reject(new Error('Secure storage upgrade is blocked. Close other Unbound tabs and retry.'));
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          createMissingStores(db);
        };

        request.onsuccess = () => {
          clearTimeout(timeoutId);
          const db = request.result;

          const hasAllStores = requiredStores.every((s) => db.objectStoreNames.contains(s));
          if (hasAllStores) {
            resolve(db);
            return;
          }

          // If the DB exists but is missing stores, bump the version to trigger an upgrade.
          if (allowRetry) {
            const nextVersion = (db.version || version) + 1;
            db.close();
            openWithVersion(nextVersion, false).then(resolve).catch(reject);
            return;
          }

          db.close();
          reject(new Error('Secure storage schema is incomplete. Please clear site storage for Unbound and try again.'));
        };
      });

    return await openWithVersion(this.dbVersion, true);
  }

  /**
   * Encrypt data using AES-GCM
   */
  async encrypt(data) {
    if (!this.initialized || !this.encryptionKey) {
      throw new Error('Secure storage not initialized');
    }

    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(JSON.stringify(data));
      
      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // Encrypt data
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        this.encryptionKey,
        dataBuffer
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      return Array.from(combined);
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data using AES-GCM
   */
  async decrypt(encryptedData) {
    if (!this.initialized || !this.encryptionKey) {
      throw new Error('Secure storage not initialized');
    }

    try {
      const combined = new Uint8Array(encryptedData);
      
      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      // Decrypt data
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        this.encryptionKey,
        encrypted
      );

      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decrypted));
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data - invalid password or corrupted data');
    }
  }

  /**
   * Store seed phrase securely
   */
  async storeSeedPhrase(seedPhrase) {
    if (!this.initialized) {
      throw new Error('Secure storage not initialized');
    }

    try {
      const encrypted = await this.encrypt(seedPhrase);
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['seeds'], 'readwrite');
        const store = transaction.objectStore('seeds');
        const request = store.put({
          id: 'current',
          data: encrypted,
          created_at: new Date().toISOString()
        });
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to store seed phrase:', error);
      throw error;
    }
  }

  /**
   * Retrieve seed phrase securely
   */
  async retrieveSeedPhrase() {
    if (!this.initialized) {
      throw new Error('Secure storage not initialized');
    }

    try {
      const result = await new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['seeds'], 'readonly');
        const store = transaction.objectStore('seeds');
        const request = store.get('current');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      if (!result) {
        throw new Error('No seed phrase found in storage');
      }

      return await this.decrypt(result.data);
    } catch (error) {
      console.error('Failed to retrieve seed phrase:', error);
      throw error;
    }
  }

  /**
   * Store private key securely
   */
  async storePrivateKey(privateKey, publicKey) {
    if (!this.initialized) {
      throw new Error('Secure storage not initialized');
    }

    try {
      const encrypted = await this.encrypt(privateKey);
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['keys'], 'readwrite');
        const store = transaction.objectStore('keys');
        const request = store.put({
          id: publicKey,
          data: encrypted,
          created_at: new Date().toISOString()
        });
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to store private key:', error);
      throw error;
    }
  }

  /**
   * Retrieve private key securely
   */
  async retrievePrivateKey(publicKey) {
    if (!this.initialized) {
      throw new Error('Secure storage not initialized');
    }

    try {
      const result = await new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['keys'], 'readonly');
        const store = transaction.objectStore('keys');
        const request = store.get(publicKey);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      if (!result) {
        throw new Error('Private key not found in storage');
      }

      return await this.decrypt(result.data);
    } catch (error) {
      console.error('Failed to retrieve private key:', error);
      throw error;
    }
  }

  /**
   * Clear all stored data
   */
  async clearAll() {
    if (!this.initialized) {
      throw new Error('Secure storage not initialized');
    }

    try {
      const stores = ['seeds', 'keys', 'meta'];
      
      for (const storeName of stores) {
        await new Promise((resolve, reject) => {
          const transaction = this.db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }

      // Also clear any localStorage remnants (for migration)
      localStorage.removeItem('unbound-seed');
      localStorage.removeItem('unbound-public-key');
      localStorage.removeItem('unbound-private-key');

      return true;
    } catch (error) {
      console.error('Failed to clear storage:', error);
      throw error;
    }
  }

  /**
   * Check if storage contains data
   */
  async hasData() {
    if (!this.initialized) {
      return false;
    }

    try {
      const result = await new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['seeds'], 'readonly');
        const store = transaction.objectStore('seeds');
        const request = store.get('current');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return !!result;
    } catch (error) {
      console.error('Failed to check storage:', error);
      return false;
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStorageInfo() {
    if (!this.initialized) {
      throw new Error('Secure storage not initialized');
    }

    try {
      const stores = ['seeds', 'keys', 'meta'];
      const info = {};

      for (const storeName of stores) {
        info[storeName] = await new Promise((resolve, reject) => {
          const transaction = this.db.transaction([storeName], 'readonly');
          const store = transaction.objectStore(storeName);
          const request = store.count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }

      return info;
    } catch (error) {
      console.error('Failed to get storage info:', error);
      throw error;
    }
  }

  /**
   * Migrate from localStorage to secure storage
   */
  async migrateFromLocalStorage(password) {
    try {
      const oldSeed = localStorage.getItem('unbound-seed');
      const oldPublicKey = localStorage.getItem('unbound-public-key');
      const oldPrivateKey = localStorage.getItem('unbound-private-key');

      if (!oldSeed) {
        return { migrated: false, reason: 'No data found in localStorage' };
      }

      await this.initialize(password);

      if (oldSeed) {
        await this.storeSeedPhrase(oldSeed);
      }

      if (oldPrivateKey && oldPublicKey) {
        await this.storePrivateKey(oldPrivateKey, oldPublicKey);
      }

      // Clear old localStorage data
      localStorage.removeItem('unbound-seed');
      localStorage.removeItem('unbound-public-key');
      localStorage.removeItem('unbound-private-key');

      return { migrated: true };
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.encryptionKey = null;
      this.initialized = false;
    }
  }
}

export { SecureStorage };
