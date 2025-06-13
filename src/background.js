import { CryptoManager } from './modules/crypto.js';
import { StorageManager } from './modules/storage.js';
import { AuthManager } from './modules/auth.js';

const cryptoManager = new CryptoManager();
const storageManager = new StorageManager();
const authManager = new AuthManager(cryptoManager, storageManager);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'ENCRYPT_ENTRY':
      handleEncrypt(request.data, sendResponse);
      return true;
      
    case 'GET_ENTRIES':
      storageManager.getAllEntries().then(sendResponse);
      return true;
  }
});

async function handleEncrypt(data, sendResponse) {
  if (!authManager.currentKey) {
    sendResponse({ error: 'Vault is locked' });
    return;
  }
  
  const encrypted = await cryptoManager.encryptData(
    authManager.currentKey,
    data
  );
  
  await storageManager.saveEntry({
    id: Date.now(),
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    url: data.url
  });
  
  sendResponse({ success: true });
}
