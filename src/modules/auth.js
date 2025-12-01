export class AuthManager {
    constructor(cryptoManager, storageManager) {
      this.crypto = cryptoManager;
      this.storage = storageManager;
      this.currentKey = null;
      this.lockTimer = null;
      this.lockTimeout = 900000; // 15 minut
      this.isLocked = true;
    }

    generateRecoveryKey() {
      const segments = [];
      for (let i = 0; i < 4; i++) {
        segments.push(Math.random().toString(36).slice(2, 8).toUpperCase());
      }
      return segments.join('-');
    }
  
    async vaultExists() {
      try {
        const config = await this.storage.getVaultConfig();
        return !!config;
      } catch (error) {
        console.error('Error checking vault existence:', error);
        return false;
      }
    }
  
    async initializeVault(masterPassword) {
      try {
        const salt = await this.crypto.generateSalt();
        const key = await this.crypto.deriveKey(masterPassword, salt);

        const recoveryKey = this.generateRecoveryKey();
        const recoverySalt = await this.crypto.generateSalt();
        const recoveryDerivation = await this.crypto.deriveKey(recoveryKey, recoverySalt);
        const keyJwk = await this.crypto.exportKeyToJWK(key);
        const recoveryWrap = await this.crypto.encryptData(recoveryDerivation, keyJwk);
        
        await this.storage.saveVaultConfig({
          salt: Array.from(salt),
          iterations: this.crypto.kdfParams.iterations,
          created: Date.now(),
          recoverySalt: Array.from(recoverySalt),
          recoveryWrap
        });
        
        const testData = { test: 'vault_initialized', timestamp: Date.now() };
        const encrypted = await this.crypto.encryptData(key, testData);
        
        await this.storage.saveEntry({
          id: 'test_entry',
          ...encrypted,
          isTestEntry: true
        });

        const encryptedRecoveryKey = await this.crypto.encryptData(key, { recoveryKey });
        await this.storage.saveSetting('recoveryKey', encryptedRecoveryKey);
        
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
        } else {
          throw new Error('Brak wpisu testowego, sejf może być uszkodzony');
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

    async unlockWithRecoveryKey(recoveryKey) {
      try {
        const config = await this.storage.getVaultConfig();
        if (!config || !config.recoverySalt || !config.recoveryWrap) {
          throw new Error('Odzyskiwanie nie jest dostępne');
        }

        const recoveryDerivation = await this.crypto.deriveKey(
          recoveryKey,
          new Uint8Array(config.recoverySalt)
        );

        const masterJwk = await this.crypto.decryptData(
          recoveryDerivation,
          config.recoveryWrap.iv,
          config.recoveryWrap.ciphertext
        );

        const masterKey = await this.crypto.importKeyFromJWK(masterJwk);
        const testEntry = await this.storage.getEntry('test_entry');
        if (testEntry) {
          await this.crypto.decryptData(masterKey, testEntry.iv, testEntry.ciphertext);
        }

        this.currentKey = masterKey;
        this.isLocked = false;
        this.startLockTimer();

        return true;
      } catch (error) {
        console.error('Recovery unlock error:', error);
        throw new Error('Nieprawidłowy klucz odzyskiwania');
      }
    }
  
    lockVault() {
      this.currentKey = null;
      this.isLocked = true;
      this.clearLockTimer();
      
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

    async getRecoveryKey() {
      if (!this.isUnlocked()) {
        throw new Error('Sejf jest zablokowany');
      }

      const encrypted = await this.storage.getSetting('recoveryKey');
      if (!encrypted) {
        throw new Error('Brak zapisanego klucza odzyskiwania');
      }

      const data = await this.crypto.decryptData(
        this.currentKey,
        encrypted.iv,
        encrypted.ciphertext
      );

      return data.recoveryKey;
    }
    
    async exportSession() {
      if (!this.isUnlocked()) {
        return null;
      }
      
      try {
        const keyJwk = await this.crypto.exportKeyToJWK(this.currentKey);
        const config = await this.storage.getVaultConfig();
        
        return {
          keyJwk,
          config,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Error exporting session:', error);
        return null;
      }
    }
    
    async restoreSession(sessionData) {
      try {
        if (!sessionData || !sessionData.keyJwk || !sessionData.config) {
          throw new Error('Nieprawidłowe dane sesji');
        }
        
        const key = await this.crypto.importKeyFromJWK(sessionData.keyJwk);
        
        const testEntry = await this.storage.getEntry('test_entry');
        if (testEntry) {
          await this.crypto.decryptData(key, testEntry.iv, testEntry.ciphertext);
        } else {
          throw new Error('Brak wpisu testowego, sesja nie może być przywrócona');
        }
        
        this.currentKey = key;
        this.isLocked = false;
        this.startLockTimer();
        
        return true;
      } catch (error) {
        console.error('Error restoring session:', error);
        throw new Error('Nie można przywrócić sesji');
      }
    }
  }
  