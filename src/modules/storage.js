class StorageManager {
    constructor() {
      this.dbName = 'SecurePassDB';
      this.dbVersion = 1;
      this.db = null;
    }
  
    async initDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('entries')) {
            db.createObjectStore('entries', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'name' });
          }
        };
  
        request.onsuccess = (event) => {
          this.db = event.target.result;
          resolve();
        };
  
        request.onerror = (event) => reject(event.target.error);
      });
    }
  
    async saveEntry(encryptedEntry) {
      const transaction = this.db.transaction('entries', 'readwrite');
      const store = transaction.objectStore('entries');
      store.put(encryptedEntry);
    }
  
    async getAllEntries() {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction('entries', 'readonly');
        const store = transaction.objectStore('entries');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = (error) => reject(error);
      });
    }
  }
  