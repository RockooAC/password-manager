export class AuthManager {
    constructor(cryptoManager, storageManager) {
      this.crypto = cryptoManager;
      this.storage = storageManager;
      this.currentKey = null;
      this.lockTimer = null;
      this.lockTimeout = 900000; // 15 minut
      this.isLocked = true;
    }
  
    async vaultExists() {
      try {
        const config = await this.storage.getVaultConfig();
        return !!config;
      } catch (error) {
        return false;
      }
    }
  
    async initializeVault(masterPassword) {
      try {
        const salt = await this.crypto.generateSalt();
        const key = await this.crypto.deriveKey(masterPassword, salt);
        
        await this.storage.saveVaultConfig({
          salt: Array.from(salt),
          iterations: this.crypto.kdfParams.iterations,
          created: Date.now()
        });
        
        const testData = { test: 'vault_initialized', timestamp: Date.now() };
        const encrypted = await this.crypto.encryptData(key, testData);
        
        await this.storage.saveEntry({
          id: 'test_entry',
          ...encrypted,
          isTestEntry: true
        });
        
        this.currentKey = key;
        this.isLocked = false;
        this.startLockTimer();
        
        return true;
      } catch (error) {
        console.error('Error initializing vault:', error);
        throw new Error('Nie można utworzyć sejfu');
      }
    }
  
    async unlockVault(masterPassword) {
      try {
        const config = await this.storage.getVaultConfig();
        if (!config) {
          throw new Error('Sejf nie istnieje');
        }
        
        const key = await this.crypto.deriveKey(
          masterPassword, 
          new Uint8Array(config.salt)
        );
        
        const testEntry = await this.storage.getEntry('test_entry');
        if (testEntry) {
          await this.crypto.decryptData(key, testEntry.iv, testEntry.ciphertext);
        }
        
        this.currentKey = key;
        this.isLocked = false;
        this.startLockTimer();
        
        return true;
      } catch (error) {
        console.error('Error unlocking vault:', error);
        throw new Error('Nieprawidłowe hasło główne');
      }
    }
  
    lockVault() {
      this.currentKey = null;
      this.isLocked = true;
      if (this.lockTimer) {
        clearTimeout(this.lockTimer);
        this.lockTimer = null;
      }
      
      chrome.runtime.sendMessage({ action: 'VAULT_LOCKED' }).catch(() => {});
    }
  
    startLockTimer() {
      this.clearLockTimer();
      this.lockTimer = setTimeout(() => {
        this.lockVault();
      }, this.lockTimeout);
    }
  
    clearLockTimer() {
      if (this.lockTimer) {
        clearTimeout(this.lockTimer);
        this.lockTimer = null;
      }
    }
  
    resetLockTimer() {
      if (!this.isLocked) {
        this.startLockTimer();
      }
    }
  
    isUnlocked() {
      return !this.isLocked && this.currentKey !== null;
    }
  
    getCurrentKey() {
      if (this.isLocked || !this.currentKey) {
        throw new Error('Sejf jest zablokowany');
      }
      return this.currentKey;
    }
  
    async resetVault() {
      try {
        await this.storage.clearAllData();
        this.lockVault();
        return true;
      } catch (error) {
        console.error('Error resetting vault:', error);
        throw new Error('Nie można zresetować sejfu');
      }
    }
  }
  