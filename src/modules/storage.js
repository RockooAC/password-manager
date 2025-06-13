export class StorageManager {
    constructor() {
      this.dbName = 'SecurePassDB';
      this.dbVersion = 1;
      this.db = null;
    }
  
    async initDB() {
      return new Promise((resolve, reject) => {
        try {
          const request = indexedDB.open(this.dbName, this.dbVersion);
          
          request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('entries')) {
              const entryStore = db.createObjectStore('entries', { keyPath: 'id' });
              entryStore.createIndex('url', 'url', { unique: false });
              entryStore.createIndex('title', 'title', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('settings')) {
              db.createObjectStore('settings', { keyPath: 'name' });
            }
            
            if (!db.objectStoreNames.contains('vault')) {
              db.createObjectStore('vault', { keyPath: 'id' });
            }
          };
  
          request.onsuccess = (event) => {
            this.db = event.target.result;
            resolve(this.db);
          };
  
          request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject(event.target.error);
          };
        } catch (error) {
          console.error('Error initializing database:', error);
          reject(error);
        }
      });
    }
  
    async saveEntry(entry) {
      if (!this.db) await this.initDB();
      
      return new Promise((resolve, reject) => {
        try {
          const transaction = this.db.transaction(['entries'], 'readwrite');
          const store = transaction.objectStore('entries');
          const request = store.put(entry);
          
          request.onsuccess = () => resolve(request.result);
          request.onerror = (event) => {
            console.error('Error saving entry:', event.target.error);
            reject(event.target.error);
          };
        } catch (error) {
          console.error('Transaction error:', error);
          reject(error);
        }
      });
    }
  
    async getEntry(id) {
      if (!this.db) await this.initDB();
      
      return new Promise((resolve, reject) => {
        try {
          const transaction = this.db.transaction(['entries'], 'readonly');
          const store = transaction.objectStore('entries');
          const request = store.get(id);
          
          request.onsuccess = () => resolve(request.result);
          request.onerror = (event) => {
            console.error('Error getting entry:', event.target.error);
            reject(event.target.error);
          };
        } catch (error) {
          console.error('Transaction error:', error);
          reject(error);
        }
      });
    }
  
    async getAllEntries() {
      if (!this.db) await this.initDB();
      
      return new Promise((resolve, reject) => {
        try {
          const transaction = this.db.transaction(['entries'], 'readonly');
          const store = transaction.objectStore('entries');
          const request = store.getAll();
          
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = (event) => {
            console.error('Error getting all entries:', event.target.error);
            reject(event.target.error);
          };
        } catch (error) {
          console.error('Transaction error:', error);
          reject(error);
        }
      });
    }
  
    async deleteEntry(id) {
      if (!this.db) await this.initDB();
      
      return new Promise((resolve, reject) => {
        try {
          const transaction = this.db.transaction(['entries'], 'readwrite');
          const store = transaction.objectStore('entries');
          const request = store.delete(id);
          
          request.onsuccess = () => resolve();
          request.onerror = (event) => {
            console.error('Error deleting entry:', event.target.error);
            reject(event.target.error);
          };
        } catch (error) {
          console.error('Transaction error:', error);
          reject(error);
        }
      });
    }
  
    async saveSetting(name, value) {
      if (!this.db) await this.initDB();
      
      return new Promise((resolve, reject) => {
        try {
          const transaction = this.db.transaction(['settings'], 'readwrite');
          const store = transaction.objectStore('settings');
          const request = store.put({ name, value });
          
          request.onsuccess = () => resolve();
          request.onerror = (event) => {
            console.error('Error saving setting:', event.target.error);
            reject(event.target.error);
          };
        } catch (error) {
          console.error('Transaction error:', error);
          reject(error);
        }
      });
    }
  
    async getSetting(name) {
      if (!this.db) await this.initDB();
      
      return new Promise((resolve, reject) => {
        try {
          const transaction = this.db.transaction(['settings'], 'readonly');
          const store = transaction.objectStore('settings');
          const request = store.get(name);
          
          request.onsuccess = () => resolve(request.result?.value);
          request.onerror = (event) => {
            console.error('Error getting setting:', event.target.error);
            reject(event.target.error);
          };
        } catch (error) {
          console.error('Transaction error:', error);
          reject(error);
        }
      });
    }
  
    async saveVaultConfig(config) {
      if (!this.db) await this.initDB();
      
      return new Promise((resolve, reject) => {
        try {
          const transaction = this.db.transaction(['vault'], 'readwrite');
          const store = transaction.objectStore('vault');
          const request = store.put({ id: 'config', ...config });
          
          request.onsuccess = () => resolve();
          request.onerror = (event) => {
            console.error('Error saving vault config:', event.target.error);
            reject(event.target.error);
          };
        } catch (error) {
          console.error('Transaction error:', error);
          reject(error);
        }
      });
    }
  
    async getVaultConfig() {
      if (!this.db) await this.initDB();
      
      return new Promise((resolve, reject) => {
        try {
          const transaction = this.db.transaction(['vault'], 'readonly');
          const store = transaction.objectStore('vault');
          const request = store.get('config');
          
          request.onsuccess = () => resolve(request.result);
          request.onerror = (event) => {
            console.error('Error getting vault config:', event.target.error);
            reject(event.target.error);
          };
        } catch (error) {
          console.error('Transaction error:', error);
          reject(error);
        }
      });
    }
  
    async clearAllData() {
      if (!this.db) await this.initDB();
      
      return Promise.all([
        new Promise((resolve, reject) => {
          try {
            const transaction = this.db.transaction(['entries'], 'readwrite');
            const store = transaction.objectStore('entries');
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
          } catch (error) {
            reject(error);
          }
        }),
        new Promise((resolve, reject) => {
          try {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
          } catch (error) {
            reject(error);
          }
        }),
        new Promise((resolve, reject) => {
          try {
            const transaction = this.db.transaction(['vault'], 'readwrite');
            const store = transaction.objectStore('vault');
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
          } catch (error) {
            reject(error);
          }
        })
      ]);
    }
  }
  