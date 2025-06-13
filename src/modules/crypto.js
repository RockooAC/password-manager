export class CryptoManager {
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
  
      return { 
        iv: Array.from(iv), 
        ciphertext: Array.from(new Uint8Array(ciphertext)) 
      };
    }
  
    async decryptData(key, iv, ciphertext) {
      try {
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: new Uint8Array(iv) },
          key,
          new Uint8Array(ciphertext)
        );
        
        return JSON.parse(new TextDecoder().decode(decrypted));
      } catch (error) {
        throw new Error('Decryption failed - invalid key or corrupted data');
      }
    }
  
    async exportKeyToJWK(key) {
      return await crypto.subtle.exportKey('jwk', key);
    }
  
    async importKeyFromJWK(jwk) {
      return await crypto.subtle.importKey(
        'jwk',
        jwk,
        this.algorithm,
        true,
        ['encrypt', 'decrypt']
      );
    }
  
    generatePassword(length = 16, options = {}) {
      const lowercase = 'abcdefghijklmnopqrstuvwxyz';
      const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const numbers = '0123456789';
      const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      
      let charset = '';
      if (options.lowercase !== false) charset += lowercase;
      if (options.uppercase !== false) charset += uppercase;
      if (options.numbers !== false) charset += numbers;
      if (options.symbols !== false) charset += symbols;
      
      if (charset === '') charset = lowercase + uppercase + numbers;
      
      const randomBytes = crypto.getRandomValues(new Uint8Array(length));
      return Array.from(randomBytes)
        .map(byte => charset[byte % charset.length])
        .join('');
    }
  
    checkPasswordStrength(password) {
      let score = 0;
      let feedback = [];
  
      if (password.length >= 8) score += 1;
      else feedback.push('Co najmniej 8 znaków');
  
      if (/[a-z]/.test(password)) score += 1;
      else feedback.push('Małe litery');
  
      if (/[A-Z]/.test(password)) score += 1;
      else feedback.push('Wielkie litery');
  
      if (/[0-9]/.test(password)) score += 1;
      else feedback.push('Cyfry');
  
      if (/[^A-Za-z0-9]/.test(password)) score += 1;
      else feedback.push('Znaki specjalne');
  
      const strength = ['Bardzo słabe', 'Słabe', 'Średnie', 'Silne', 'Bardzo silne'][score];
      
      return { score, strength, feedback };
    }
  }
  