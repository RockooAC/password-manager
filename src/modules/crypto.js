class CryptoManager {
    constructor() {
      this.algorithm = { name: 'AES-GCM', length: 256 };
      this.kdfParams = {
        name: 'PBKDF2',
        iterations: 100000,
        hash: 'SHA-256'
      };
    }
  
    async generateSalt() {
      return crypto.getRandomValues(new Uint8Array(16));
    }
  
    async deriveKey(password, salt) {
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
      );
  
      return crypto.subtle.deriveKey(
        { ...this.kdfParams, salt },
        keyMaterial,
        this.algorithm,
        true,
        ['encrypt', 'decrypt']
      );
    }
  
    async encryptData(key, data) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encodedData = new TextEncoder().encode(JSON.stringify(data));
      
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encodedData
      );
  
      return { iv, ciphertext: new Uint8Array(ciphertext) };
    }
  
    async decryptData(key, iv, ciphertext) {
      try {
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          ciphertext
        );
        
        return JSON.parse(new TextDecoder().decode(decrypted));
      } catch (error) {
        throw new Error('Decryption failed - invalid key or corrupted data');
      }
    }
  }
  