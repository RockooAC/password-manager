class AuthManager {
    constructor(cryptoManager, storageManager) {
      this.crypto = cryptoManager;
      this.storage = storageManager;
      this.lockTimer = null;
      this.lockTimeout = 300000; // 5 minut
    }
  
    async initializeVault(masterPassword) {
      const salt = await this.crypto.generateSalt();
      const key = await this.crypto.deriveKey(masterPassword, salt);
      
      await this.storage.initDB();
      await this.storage.saveEntry({
        id: 'vault-config',
        salt,
        iterations: this.crypto.kdfParams.iterations
      });
      
      this.startLockTimer();
    }
  
    async unlockVault(masterPassword) {
      const config = await this.storage.getEntry('vault-config');
      this.currentKey = await this.crypto.deriveKey(
        masterPassword,
        config.salt
      );
      this.startLockTimer();
    }
  
    startLockTimer() {
      if (this.lockTimer) clearTimeout(this.lockTimer);
      this.lockTimer = setTimeout(() => this.lockVault(), this.lockTimeout);
    }
  
    lockVault() {
      this.currentKey = null;
      chrome.runtime.sendMessage({ action: 'VAULT_LOCKED' });
    }
  }
  