import { CryptoManager } from './modules/crypto.js';
import { StorageManager } from './modules/storage.js';
import { AuthManager } from './modules/auth.js';

const cryptoManager = new CryptoManager();
const storageManager = new StorageManager();
const authManager = new AuthManager(cryptoManager, storageManager);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action);
  
  switch (request.action) {
    case 'CHECK_VAULT_EXISTS':
      handleCheckVaultExists(sendResponse);
      return true;
      
    case 'INITIALIZE_VAULT':
      handleInitializeVault(request.data, sendResponse);
      return true;
      
    case 'UNLOCK_VAULT':
      handleUnlockVault(request.data, sendResponse);
      return true;
      
    case 'LOCK_VAULT':
      handleLockVault(sendResponse);
      return true;
      
    case 'IS_UNLOCKED':
      sendResponse({ success: true, isUnlocked: authManager.isUnlocked() });
      return false;
      
    case 'SAVE_ENTRY':
      handleSaveEntry(request.data, sendResponse);
      return true;
      
    case 'GET_ALL_ENTRIES':
      handleGetAllEntries(sendResponse);
      return true;
      
    case 'DELETE_ENTRY':
      handleDeleteEntry(request.data, sendResponse);
      return true;
      
    case 'GENERATE_PASSWORD':
      handleGeneratePassword(request.data, sendResponse);
      return true;
      
    case 'RESET_LOCK_TIMER':
      authManager.resetLockTimer();
      sendResponse({ success: true });
      return false;
      
    case 'RESET_VAULT':
      handleResetVault(sendResponse);
      return true;
      
    case 'GET_ENTRIES_FOR_URL':
      handleGetEntriesForUrl(request.data, sendResponse);
      return true;
      
    default:
      sendResponse({ error: 'Unknown action' });
      return false;
  }
});

async function handleCheckVaultExists(sendResponse) {
  try {
    const exists = await authManager.vaultExists();
    sendResponse({ success: true, exists });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleInitializeVault(data, sendResponse) {
  try {
    await authManager.initializeVault(data.password);
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleUnlockVault(data, sendResponse) {
  try {
    await authManager.unlockVault(data.password);
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleLockVault(sendResponse) {
  try {
    authManager.lockVault();
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleSaveEntry(data, sendResponse) {
  try {
    if (!authManager.isUnlocked()) {
      throw new Error('Sejf jest zablokowany');
    }
    
    const key = authManager.getCurrentKey();
    const encrypted = await cryptoManager.encryptData(key, {
      title: data.title,
      url: data.url,
      username: data.username,
      password: data.password,
      notes: data.notes,
      created: data.created || Date.now(),
      modified: Date.now()
    });
    
    const entry = {
      id: data.id || Date.now() + Math.random(),
      ...encrypted,
      url: data.url,
      created: data.created || Date.now(),
      modified: Date.now()
    };
    
    await storageManager.saveEntry(entry);
    authManager.resetLockTimer();
    
    sendResponse({ success: true, id: entry.id });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleGetAllEntries(sendResponse) {
  try {
    if (!authManager.isUnlocked()) {
      throw new Error('Sejf jest zablokowany');
    }
    
    const key = authManager.getCurrentKey();
    const entries = await storageManager.getAllEntries();
    const decryptedEntries = [];
    
    for (const entry of entries) {
      if (!entry.isTestEntry) {
        try {
          const decrypted = await cryptoManager.decryptData(key, entry.iv, entry.ciphertext);
          decryptedEntries.push({
            id: entry.id,
            ...decrypted,
            created: entry.created,
            modified: entry.modified
          });
        } catch (error) {
          console.error('Error decrypting entry:', entry.id, error);
        }
      }
    }
    
    authManager.resetLockTimer();
    sendResponse({ success: true, entries: decryptedEntries });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleDeleteEntry(data, sendResponse) {
  try {
    if (!authManager.isUnlocked()) {
      throw new Error('Sejf jest zablokowany');
    }
    
    await storageManager.deleteEntry(data.id);
    authManager.resetLockTimer();
    
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleGeneratePassword(data, sendResponse) {
  try {
    const password = cryptoManager.generatePassword(data.length || 16, data.options || {});
    sendResponse({ success: true, password });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleResetVault(sendResponse) {
  try {
    await authManager.resetVault();
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleGetEntriesForUrl(data, sendResponse) {
  try {
    if (!authManager.isUnlocked()) {
      throw new Error('Sejf jest zablokowany');
    }
    
    const key = authManager.getCurrentKey();
    const entries = await storageManager.getAllEntries();
    const matchingEntries = [];
    
    const domain = new URL(data.url).hostname;
    
    for (const entry of entries) {
      if (!entry.isTestEntry && entry.url) {
        try {
          const entryDomain = new URL(entry.url).hostname;
          if (entryDomain === domain) {
            const decrypted = await cryptoManager.decryptData(key, entry.iv, entry.ciphertext);
            matchingEntries.push({
              id: entry.id,
              title: decrypted.title,
              username: decrypted.username,
              password: decrypted.password
            });
          }
        } catch (error) {
          console.error('Error processing entry for URL:', error);
        }
      }
    }
    
    authManager.resetLockTimer();
    sendResponse({ success: true, entries: matchingEntries });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log('SecurePass Manager installed:', details.reason);
});
