import { CryptoManager } from './modules/crypto.js';
import { StorageManager } from './modules/storage.js';
import { AuthManager } from './modules/auth.js';
import { TotpManager } from './modules/totp.js';

const cryptoManager = new CryptoManager();
const storageManager = new StorageManager();
const authManager = new AuthManager(cryptoManager, storageManager);
const totpManager = new TotpManager();

// Inicjalizacja przy starcie
(async function initializeAuth() {
  try {
    await storageManager.initDB();
    
    // Sprawdź czy klucz sesji jest zapisany
    const sessionData = await chrome.storage.session.get('securepass_session');
    if (sessionData.securepass_session) {
      try {
        await authManager.restoreSession(sessionData.securepass_session);
        console.log('Session restored successfully');
      } catch (error) {
        console.error('Failed to restore session:', error);
        await chrome.storage.session.remove('securepass_session');
      }
    }
  } catch (error) {
    console.error('Initialization error:', error);
  }
})();

// Obsługuj komunikaty
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

    case 'UNLOCK_WITH_RECOVERY':
      handleUnlockWithRecovery(request.data, sendResponse);
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

    case 'GET_RECOVERY_KEY':
      handleGetRecoveryKey(sendResponse);
      return true;

    case 'GET_TOTP_STATUS':
      handleGetTotpStatus(sendResponse);
      return true;

    case 'ENABLE_TOTP':
      handleEnableTotp(sendResponse);
      return true;

    case 'DISABLE_TOTP':
      handleDisableTotp(sendResponse);
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
    const initResult = await authManager.initializeVault(data.password);

    // Zapisz sesję
    const sessionData = await authManager.exportSession();
    await chrome.storage.session.set({ 'securepass_session': sessionData });

    sendResponse({ success: true, recoveryKey: initResult?.recoveryKey });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleUnlockVault(data, sendResponse) {
  try {
    await authManager.unlockVault(data.password);

    const totpData = await storageManager.getSetting('totp');
    if (totpData) {
      if (!data.totpCode) {
        sendResponse({ error: 'Wymagany kod TOTP', totpRequired: true });
        return;
      }

      const decrypted = await cryptoManager.decryptData(
        authManager.getCurrentKey(),
        totpData.iv,
        totpData.ciphertext
      );

      const valid = await totpManager.verifyTotp(decrypted.secret, data.totpCode);
      if (!valid) {
        sendResponse({ error: 'Nieprawidłowy kod TOTP', totpRequired: true });
        return;
      }
    }

    // Zapisz sesję
    const sessionData = await authManager.exportSession();
    await chrome.storage.session.set({ 'securepass_session': sessionData });
    
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleLockVault(sendResponse) {
  try {
    authManager.lockVault();
    await chrome.storage.session.remove('securepass_session');
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleUnlockWithRecovery(data, sendResponse) {
  try {
    await authManager.unlockWithRecoveryKey(data.recoveryKey);

    const sessionData = await authManager.exportSession();
    await chrome.storage.session.set({ 'securepass_session': sessionData });

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
        id: data.id || `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext,
        url: data.url,
        created: data.created || Date.now(),
        modified: Date.now()
      };
    console.log('[SAVE_ENTRY]', 'ID:', entry.id, 'is update:', !!data.id);

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
    await chrome.storage.session.remove('securepass_session');
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

async function handleGetRecoveryKey(sendResponse) {
  try {
    const recoveryKey = await authManager.getRecoveryKey();
    sendResponse({ success: true, recoveryKey });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleGetTotpStatus(sendResponse) {
  try {
    const totpData = await storageManager.getSetting('totp');
    sendResponse({ success: true, enabled: !!totpData });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleEnableTotp(sendResponse) {
  try {
    if (!authManager.isUnlocked()) {
      throw new Error('Sejf jest zablokowany');
    }

    const secretData = totpManager.generateSecret();
    const encrypted = await cryptoManager.encryptData(authManager.getCurrentKey(), {
      secret: secretData.secret
    });

    await storageManager.saveSetting('totp', encrypted);
    authManager.resetLockTimer();

    sendResponse({ success: true, ...secretData });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleDisableTotp(sendResponse) {
  try {
    if (!authManager.isUnlocked()) {
      throw new Error('Sejf jest zablokowany');
    }

    await storageManager.saveSetting('totp', null);
    authManager.resetLockTimer();
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log('SecurePass Manager installed:', details.reason);
});
