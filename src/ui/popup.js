import { CryptoManager } from '../modules/crypto.js';
import { StorageManager } from '../modules/storage.js';
import { AuthManager } from '../modules/auth.js';

// Global state
let currentScreen = 'loading-screen';
let currentEntryId = null;
let entries = [];
let currentDetailEntry = null;

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup initialized');
  
  showScreen('loading-screen');
  
  setTimeout(async () => {
    await initializeApp();
  }, 1000);
  
  setupEventListeners();
});

async function initializeApp() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'CHECK_VAULT_EXISTS' });
    
    if (response.success) {
      if (response.exists) {
        showScreen('login-screen');
      } else {
        showScreen('welcome-screen');
      }
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Error initializing app:', error);
    showToast('Błąd inicjalizacji aplikacji', 'error');
    showScreen('welcome-screen');
  }
}

function setupEventListeners() {
  // Welcome screen
  const createVaultBtn = document.getElementById('create-vault-btn');
  if (createVaultBtn) {
    createVaultBtn.addEventListener('click', () => {
      showScreen('register-screen');
    });
  }
  
  // Registration screen
  const backToWelcome = document.getElementById('back-to-welcome');
  if (backToWelcome) {
    backToWelcome.addEventListener('click', () => {
      showScreen('welcome-screen');
    });
  }
  
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegistration);
  }
  
  // Password strength checking
  const masterPassword = document.getElementById('master-password');
  if (masterPassword) {
    masterPassword.addEventListener('input', checkPasswordStrength);
  }
  
  const confirmPassword = document.getElementById('confirm-password');
  if (confirmPassword) {
    confirmPassword.addEventListener('input', checkPasswordMatch);
  }
  
  // Login screen
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
  
  const resetVaultBtn = document.getElementById('reset-vault-btn');
  if (resetVaultBtn) {
    resetVaultBtn.addEventListener('click', handleResetVault);
  }
  
  // Main screen
  const logoutVaultBtn = document.getElementById('logout-vault-btn');
  if (logoutVaultBtn) {
    logoutVaultBtn.addEventListener('click', handleLogoutVault);
  }
  
  const addEntryBtn = document.getElementById('add-entry-btn');
  if (addEntryBtn) {
    addEntryBtn.addEventListener('click', showAddEntryForm);
  }
  
  const emptyAddBtn = document.getElementById('empty-add-btn');
  if (emptyAddBtn) {
    emptyAddBtn.addEventListener('click', showAddEntryForm);
  }
  
  const searchEntries = document.getElementById('search-entries');
  if (searchEntries) {
    searchEntries.addEventListener('input', handleSearch);
  }
  
  // Entry form
  const entryForm = document.getElementById('entry-form');
  if (entryForm) {
    entryForm.addEventListener('submit', handleSaveEntry);
  }
  
  const cancelEntryBtn = document.getElementById('cancel-entry-btn');
  if (cancelEntryBtn) {
    cancelEntryBtn.addEventListener('click', () => showScreen('main-screen'));
  }
  
  const togglePassword = document.getElementById('toggle-password');
  if (togglePassword) {
    togglePassword.addEventListener('click', togglePasswordVisibility);
  }
  
  const generatePasswordBtn = document.getElementById('generate-password');
  if (generatePasswordBtn) {
    generatePasswordBtn.addEventListener('click', showPasswordGenerator);
  }
  
  // Entry details modal
  const closeDetails = document.getElementById('close-details');
  if (closeDetails) {
    closeDetails.addEventListener('click', hideEntryDetails);
  }
  
  const toggleDetailPassword = document.getElementById('toggle-detail-password');
  if (toggleDetailPassword) {
    toggleDetailPassword.addEventListener('click', toggleDetailPasswordVisibility);
  }
  
  const editFromDetails = document.getElementById('edit-from-details');
  if (editFromDetails) {
    editFromDetails.addEventListener('click', editFromDetailsModal);
  }
  
  const deleteFromDetails = document.getElementById('delete-from-details');
  if (deleteFromDetails) {
    deleteFromDetails.addEventListener('click', deleteFromDetailsModal);
  }
  
  // Copy buttons in details modal
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', handleDetailCopy);
  });
  
  // Password generator
  const closeGenerator = document.getElementById('close-generator');
  if (closeGenerator) {
    closeGenerator.addEventListener('click', hidePasswordGenerator);
  }
  
  const passwordLength = document.getElementById('password-length');
  if (passwordLength) {
    passwordLength.addEventListener('input', updatePasswordLength);
  }
  
  const regeneratePassword = document.getElementById('regenerate-password');
  if (regeneratePassword) {
    regeneratePassword.addEventListener('click', generateNewPassword);
  }
  
  const copyGenerated = document.getElementById('copy-generated');
  if (copyGenerated) {
    copyGenerated.addEventListener('click', copyGeneratedPassword);
  }
  
  const useGeneratedPassword = document.getElementById('use-generated-password');
  if (useGeneratedPassword) {
    useGeneratedPassword.addEventListener('click', useGeneratedPasswordFunc);
  }
  
  // Generator checkboxes
  document.querySelectorAll('#generator-modal input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', generateNewPassword);
  });
}

// Screen management
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
    currentScreen = screenId;
  }
}

// Registration handling
async function handleRegistration(e) {
  e.preventDefault();
  
  const masterPassword = document.getElementById('master-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  const submitBtn = document.getElementById('create-vault-submit');
  
  if (masterPassword !== confirmPassword) {
    showToast('Hasła nie są identyczne', 'error');
    return;
  }
  
  const strength = checkPasswordStrength();
  if (strength.score < 3) {
    showToast('Hasło jest zbyt słabe', 'error');
    return;
  }
  
  try {
    setButtonLoading(submitBtn, true);
    
    const response = await chrome.runtime.sendMessage({
      action: 'INITIALIZE_VAULT',
      data: { password: masterPassword }
    });
    
    if (response.success) {
      showToast('Sejf został utworzony pomyślnie!', 'success');
      showScreen('main-screen');
      await loadEntries();
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Registration error:', error);
    showToast('Błąd podczas tworzenia sejfu: ' + error.message, 'error');
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

// Login handling
async function handleLogin(e) {
  e.preventDefault();
  
  const password = document.getElementById('login-password').value;
  const submitBtn = document.getElementById('unlock-submit');
  const errorDiv = document.getElementById('login-error');
  
  errorDiv.classList.add('hidden');
  
  try {
    setButtonLoading(submitBtn, true);
    
    const response = await chrome.runtime.sendMessage({
      action: 'UNLOCK_VAULT',
      data: { password }
    });
    
    if (response.success) {
      showToast('Sejf odblokowany!', 'success');
      showScreen('main-screen');
      await loadEntries();
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Login error:', error);
    errorDiv.classList.remove('hidden');
    document.getElementById('login-password').value = '';
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

// Password strength checking
function checkPasswordStrength() {
  const password = document.getElementById('master-password')?.value || '';
  const strengthContainer = document.getElementById('password-strength');
  const strengthLevel = document.getElementById('strength-level');
  const strengthFeedback = document.getElementById('strength-feedback');
  
  if (!strengthContainer) return { score: 0 };
  
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
  
  const levels = ['very-weak', 'weak', 'medium', 'strong', 'very-strong'];
  const levelNames = ['Bardzo słabe', 'Słabe', 'Średnie', 'Silne', 'Bardzo silne'];
  
  levels.forEach(level => strengthContainer.classList.remove(`strength-${level}`));
  
  if (password.length > 0) {
    strengthContainer.classList.add(`strength-${levels[score]}`);
    strengthLevel.textContent = levelNames[score];
    strengthFeedback.textContent = feedback.length > 0 ? 'Brakuje: ' + feedback.join(', ') : 'Hasło spełnia wszystkie wymagania';
  } else {
    strengthLevel.textContent = 'Słabe';
    strengthFeedback.textContent = '';
  }
  
  return { score, strength: levelNames[score], feedback };
}

// Password match checking
function checkPasswordMatch() {
  const password = document.getElementById('master-password')?.value || '';
  const confirm = document.getElementById('confirm-password')?.value || '';
  const matchDiv = document.getElementById('password-match');
  
  if (!matchDiv) return;
  
  if (confirm.length === 0) {
    matchDiv.textContent = '';
    matchDiv.className = 'password-match';
  } else if (password === confirm) {
    matchDiv.textContent = '✓ Hasła są identyczne';
    matchDiv.className = 'password-match valid';
  } else {
    matchDiv.textContent = '✗ Hasła nie są identyczne';
    matchDiv.className = 'password-match invalid';
  }
}

// Vault management
async function handleLogoutVault() {
  try {
    await chrome.runtime.sendMessage({ action: 'LOCK_VAULT' });
    showToast('Wylogowano z sejfu', 'success');
    showScreen('login-screen');
    document.getElementById('login-password').value = '';
  } catch (error) {
    console.error('Logout vault error:', error);
    showToast('Błąd wylogowania', 'error');
  }
}

async function handleResetVault() {
  if (!confirm('Czy na pewno chcesz zresetować sejf? Wszystkie dane zostaną utracone!')) {
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'RESET_VAULT' });
    
    if (response.success) {
      showToast('Sejf został zresetowany', 'success');
      showScreen('welcome-screen');
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Reset vault error:', error);
    showToast('Błąd resetowania sejfu: ' + error.message, 'error');
  }
}

// Entry management
async function loadEntries() {
  try {
    await chrome.runtime.sendMessage({ action: 'RESET_LOCK_TIMER' });
    
    const response = await chrome.runtime.sendMessage({ action: 'GET_ALL_ENTRIES' });
    
    if (response.success) {
      entries = response.entries;
      displayEntries(entries);
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Load entries error:', error);
    showToast('Błąd ładowania haseł: ' + error.message, 'error');
  }
}

function displayEntries(entriesToShow) {
  const entriesList = document.getElementById('entries-list');
  const emptyState = document.getElementById('empty-state');
  
  if (!entriesList) return;
  
  if (entriesToShow.length === 0) {
    entriesList.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
  } else {
    if (emptyState) emptyState.classList.add('hidden');
    
    entriesList.innerHTML = entriesToShow.map(entry => `
      <div class="entry-item" data-id="${entry.id}">
        <div class="entry-icon">
          ${getEntryIcon(entry.url)}
        </div>
        <div class="entry-details" onclick="showEntryDetailsFunc('${entry.id}')">
          <div class="entry-title">${escapeHtml(entry.title)}</div>
          <div class="entry-subtitle">${escapeHtml(entry.username || entry.url || 'Brak danych')}</div>
        </div>
        <div class="entry-actions">
          <button class="btn-icon" onclick="copyEntryDataFunc('${entry.id}', 'username')" title="Kopiuj login">
            👤
          </button>
          <button class="btn-icon" onclick="copyEntryDataFunc('${entry.id}', 'password')" title="Kopiuj hasło">
            🔑
          </button>
          <button class="btn-icon" onclick="editEntryFunc('${entry.id}')" title="Edytuj">
            ✏️
          </button>
          <button class="btn-icon" onclick="deleteEntryFunc('${entry.id}')" title="Usuń">
            🗑️
          </button>
        </div>
      </div>
    `).join('');
  }
}

function getEntryIcon(url) {
  if (!url) return '🔐';
  
  try {
    const domain = new URL(url).hostname.toLowerCase();
    if (domain.includes('google')) return '🅖';
    if (domain.includes('facebook')) return '🅕';
    if (domain.includes('microsoft')) return '🅜';
    if (domain.includes('apple')) return '🍎';
    if (domain.includes('github')) return '🐙';
    return '🌐';
  } catch {
    return '🔐';
  }
}

function showAddEntryForm() {
  currentEntryId = null;
  document.getElementById('entry-form-title').textContent = '➕ Dodaj hasło';
  document.getElementById('entry-form').reset();
  showScreen('entry-form-screen');
}

function editEntryFunc(id) {
  const entry = entries.find(e => e.id == id);
  if (!entry) return;
  
  currentEntryId = id;
  document.getElementById('entry-form-title').textContent = '✏️ Edytuj hasło';
  document.getElementById('entry-title').value = entry.title || '';
  document.getElementById('entry-url').value = entry.url || '';
  document.getElementById('entry-username').value = entry.username || '';
  document.getElementById('entry-password').value = entry.password || '';
  document.getElementById('entry-notes').value = entry.notes || '';
  
  showScreen('entry-form-screen');
}

async function handleSaveEntry(e) {
  e.preventDefault();
  
  const title = document.getElementById('entry-title').value;
  const url = document.getElementById('entry-url').value;
  const username = document.getElementById('entry-username').value;
  const password = document.getElementById('entry-password').value;
  const notes = document.getElementById('entry-notes').value;
  const submitBtn = document.getElementById('save-entry-btn');
  
  try {
    setButtonLoading(submitBtn, true);
    
    const entryData = {
      title,
      url,
      username,
      password,
      notes
    };
    
    if (currentEntryId) {
      entryData.id = currentEntryId;
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'SAVE_ENTRY',
      data: entryData
    });
    
    if (response.success) {
      showToast(currentEntryId ? 'Hasło zaktualizowane!' : 'Hasło zapisane!', 'success');
      showScreen('main-screen');
      await loadEntries();
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Save entry error:', error);
    showToast('Błąd zapisywania: ' + error.message, 'error');
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

async function deleteEntryFunc(id) {
  if (!confirm('Czy na pewno chcesz usunąć to hasło?')) {
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'DELETE_ENTRY',
      data: { id }
    });
    
    if (response.success) {
      showToast('Hasło usunięte', 'success');
      await loadEntries();
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Delete entry error:', error);
    showToast('Błąd usuwania: ' + error.message, 'error');
  }
}

// Entry details modal
function showEntryDetailsFunc(id) {
  const entry = entries.find(e => e.id == id);
  if (!entry) return;
  
  currentDetailEntry = entry;
  
  document.getElementById('detail-entry-title').textContent = entry.title || 'Brak tytułu';
  document.getElementById('detail-entry-url').textContent = entry.url || 'Brak URL';
  document.getElementById('detail-entry-username').textContent = entry.username || 'Brak nazwy użytkownika';
  document.getElementById('detail-entry-password').textContent = '••••••••';
  document.getElementById('detail-entry-notes').textContent = entry.notes || 'Brak notatek';
  
  document.getElementById('entry-details-modal').classList.remove('hidden');
}

function hideEntryDetails() {
  document.getElementById('entry-details-modal').classList.add('hidden');
  currentDetailEntry = null;
}

function toggleDetailPasswordVisibility() {
  const passwordSpan = document.getElementById('detail-entry-password');
  const toggleBtn = document.getElementById('toggle-detail-password');
  
  if (passwordSpan.textContent === '••••••••') {
    passwordSpan.textContent = currentDetailEntry.password;
    toggleBtn.textContent = '🙈';
  } else {
    passwordSpan.textContent = '••••••••';
    toggleBtn.textContent = '👁️';
  }
}

function editFromDetailsModal() {
  hideEntryDetails();
  editEntryFunc(currentDetailEntry.id);
}

async function deleteFromDetailsModal() {
  hideEntryDetails();
  await deleteEntryFunc(currentDetailEntry.id);
}

function handleDetailCopy(e) {
  const field = e.target.getAttribute('data-field');
  if (!currentDetailEntry || !field) return;
  
  const value = currentDetailEntry[field];
  if (value) {
    copyToClipboard(value);
  }
}

// Copy functionality
async function copyEntryDataFunc(id, field) {
  const entry = entries.find(e => e.id == id);
  if (!entry) return;
  
  const value = entry[field];
  if (value) {
    await copyToClipboard(value);
    let fieldName = field === 'username' ? 'Login' : field === 'password' ? 'Hasło' : 'URL';
    showToast(`${fieldName} skopiowane!`, 'success');
  }
}

// Search functionality
function handleSearch(e) {
  const query = e.target.value.toLowerCase();
  
  if (query === '') {
    displayEntries(entries);
  } else {
    const filtered = entries.filter(entry => 
      entry.title?.toLowerCase().includes(query) ||
      entry.username?.toLowerCase().includes(query) ||
      entry.url?.toLowerCase().includes(query)
    );
    displayEntries(filtered);
  }
}

// Password generator
function showPasswordGenerator() {
  document.getElementById('generator-modal').classList.remove('hidden');
  generateNewPassword();
}

function hidePasswordGenerator() {
  document.getElementById('generator-modal').classList.add('hidden');
}

function updatePasswordLength() {
  const length = document.getElementById('password-length').value;
  document.getElementById('length-value').textContent = length;
  generateNewPassword();
}

async function generateNewPassword() {
  const length = parseInt(document.getElementById('password-length').value);
  const options = {
    uppercase: document.getElementById('include-uppercase').checked,
    lowercase: document.getElementById('include-lowercase').checked,
    numbers: document.getElementById('include-numbers').checked,
    symbols: document.getElementById('include-symbols').checked
  };
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'GENERATE_PASSWORD',
      data: { length, options }
    });
    
    if (response.success) {
      document.getElementById('generated-password').value = response.password;
    }
  } catch (error) {
    console.error('Generate password error:', error);
  }
}

function copyGeneratedPassword() {
  const password = document.getElementById('generated-password').value;
  copyToClipboard(password);
}

function useGeneratedPasswordFunc() {
  const password = document.getElementById('generated-password').value;
  document.getElementById('entry-password').value = password;
  hidePasswordGenerator();
  showToast('Hasło użyte!', 'success');
}

// Utility functions
function togglePasswordVisibility() {
  const passwordInput = document.getElementById('entry-password');
  const toggleBtn = document.getElementById('toggle-password');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggleBtn.textContent = '🙈';
  } else {
    passwordInput.type = 'password';
    toggleBtn.textContent = '👁️';
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Copy error:', error);
    showToast('Błąd kopiowania', 'error');
    return false;
  }
}

function setButtonLoading(button, loading) {
  if (!button) return;
  
  const btnText = button.querySelector('.btn-text');
  const btnSpinner = button.querySelector('.btn-spinner');
  
  if (loading) {
    button.classList.add('loading');
    button.disabled = true;
    if (btnSpinner) btnSpinner.classList.remove('hidden');
  } else {
    button.classList.remove('loading');
    button.disabled = false;
    if (btnSpinner) btnSpinner.classList.add('hidden');
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make functions global for onclick handlers
window.copyEntryDataFunc = copyEntryDataFunc;
window.editEntryFunc = editEntryFunc;
window.deleteEntryFunc = deleteEntryFunc;
window.showEntryDetailsFunc = showEntryDetailsFunc;
