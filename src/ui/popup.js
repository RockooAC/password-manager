// Global state
let currentScreen = 'loading-screen';
let currentEntryId = null;
let entries = [];
let currentDetailEntry = null;

// Funkcja obsługi rozwijanych statystyk
function setupExpandableStats() {
  // Znajdź panel statystyk i zastąp HTML
  const statsPanel = document.querySelector('.stats-panel');
  if (statsPanel) {
    statsPanel.innerHTML = `
      <div class="stats-header">
        <h3>Statystyki</h3>
        <span class="stats-toggle">▼</span>
      </div>
      <div class="stats-content">
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-number" id="total-passwords">0</div>
            <div class="stat-label">Całkowita liczba haseł</div>
          </div>
          <div class="stat-item">
            <div class="stat-number" id="strong-passwords">0</div>
            <div class="stat-label">Silne hasła</div>
          </div>
        </div>
      </div>
    `;
    
    // Dodaj obsługę kliknięcia
    const statsHeader = statsPanel.querySelector('.stats-header');
    const statsToggle = statsPanel.querySelector('.stats-toggle');
    
    if (statsHeader && statsToggle) {
      statsHeader.addEventListener('click', () => {
        statsPanel.classList.toggle('expanded');
        statsToggle.textContent = statsPanel.classList.contains('expanded') ? '▲' : '▼';
      });
    }
  }
}

// Dodane funkcje pomocnicze
function isVisible(element) {
    return !!element &&
           !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length) &&
           window.getComputedStyle(element).visibility !== 'hidden' &&
           window.getComputedStyle(element).display !== 'none';
}
  
function triggerInputEvent(element) {
    const inputEvent = new Event('input', { bubbles: true });
    element.dispatchEvent(inputEvent);
    const changeEvent = new Event('change', { bubbles: true });
    element.dispatchEvent(changeEvent);
}

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
    // Setup expandable stats PRZED showScreen
    setupExpandableStats();
    
    const response = await chrome.runtime.sendMessage({ action: 'CHECK_VAULT_EXISTS' });
    
    if (response.success) {
      if (response.exists) {
        const statusResponse = await chrome.runtime.sendMessage({ action: 'IS_UNLOCKED' });
        if (statusResponse.success && statusResponse.isUnlocked) {
          await loadEntries();
          showScreen('main-screen');
        } else {
          showScreen('login-screen');
        }
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
  document.getElementById('create-vault-btn')?.addEventListener('click', () => {
    showScreen('register-screen');
  });
  
  // Registration screen
  document.getElementById('back-to-welcome')?.addEventListener('click', () => {
    showScreen('welcome-screen');
  });
  
  document.getElementById('register-form')?.addEventListener('submit', handleRegistration);
  
  // Password strength checking
  document.getElementById('master-password')?.addEventListener('input', checkPasswordStrength);
  document.getElementById('confirm-password')?.addEventListener('input', checkPasswordMatch);
  
  // Login screen
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('reset-vault-btn')?.addEventListener('click', handleResetVault);
  document.getElementById('use-recovery')?.addEventListener('click', handleRecoveryUnlock);
  
  // Main screen
  document.getElementById('logout-vault-btn')?.addEventListener('click', handleLogoutVault);
  document.getElementById('show-recovery')?.addEventListener('click', revealRecoveryKey);
  document.getElementById('enable-totp')?.addEventListener('click', handleEnableTotp);
  document.getElementById('disable-totp')?.addEventListener('click', handleDisableTotp);
  
  document.getElementById('add-entry-btn')?.addEventListener('click', () => {
    showAddEntryForm();
  });
  
  document.getElementById('empty-add-btn')?.addEventListener('click', () => {
    showAddEntryForm();
  });

  // Nowe quick actions
  document.getElementById('quick-add')?.addEventListener('click', () => {
    showAddEntryForm();
  });

  document.getElementById('generate-quick')?.addEventListener('click', () => {
    showPasswordGenerator();
  });
  
  document.getElementById('search-entries')?.addEventListener('input', handleSearch);
  
  // Entry form
  document.getElementById('entry-form')?.addEventListener('submit', handleSaveEntry);
  
  document.getElementById('cancel-entry-btn')?.addEventListener('click', () => {
    showScreen('main-screen');
  });
  
  document.getElementById('toggle-password')?.addEventListener('click', togglePasswordVisibility);
  
  document.getElementById('generate-password')?.addEventListener('click', showPasswordGenerator);
  
  // Entry details modal
  document.getElementById('close-details')?.addEventListener('click', hideEntryDetails);
  
  document.getElementById('toggle-detail-password')?.addEventListener('click', toggleDetailPasswordVisibility);
  
  document.getElementById('edit-from-details')?.addEventListener('click', () => {
    if (currentDetailEntry) {
      hideEntryDetails();
      editEntry(currentDetailEntry.id);
    }
  });
  
  document.getElementById('delete-from-details')?.addEventListener('click', async () => {
    if (!currentDetailEntry || !currentDetailEntry.id) {
      console.warn('Brak wpisu do usunięcia');
      return;
    }
    hideEntryDetails();
    await deleteEntry(currentDetailEntry.id);
  });
  
  // Copy buttons in details modal
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', handleDetailCopy);
  });
  
  // Password generator
  document.getElementById('close-generator')?.addEventListener('click', hidePasswordGenerator);
  
  document.getElementById('password-length')?.addEventListener('input', updatePasswordLength);
  
  document.getElementById('regenerate-password')?.addEventListener('click', generateNewPassword);
  
  document.getElementById('copy-generated')?.addEventListener('click', copyGeneratedPassword);
  
  document.getElementById('use-generated-password')?.addEventListener('click', useGeneratedPassword);
  
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
    
    if (screenId === 'main-screen' || screenId === 'entry-form-screen') {
      chrome.runtime.sendMessage({ action: 'RESET_LOCK_TIMER' });
    }
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
      if (response.recoveryKey) {
        await copyToClipboard(response.recoveryKey);
        alert(`Zapisz klucz odzyskiwania:\n${response.recoveryKey}`);
      }
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
  const totpCode = document.getElementById('login-totp').value.trim();
  const submitBtn = document.getElementById('unlock-submit');
  const errorDiv = document.getElementById('login-error');
  
  errorDiv.classList.add('hidden');
  
  try {
    setButtonLoading(submitBtn, true);
    
    const response = await chrome.runtime.sendMessage({
      action: 'UNLOCK_VAULT',
      data: { password, totpCode }
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
    if (error.message?.includes('TOTP')) {
      document.getElementById('login-totp').focus();
    }
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

async function handleRecoveryUnlock() {
  const recoveryKey = document.getElementById('recovery-key').value.trim();
  const submitBtn = document.getElementById('use-recovery');
  const errorDiv = document.getElementById('login-error');

  if (!recoveryKey) {
    showToast('Podaj klucz odzyskiwania', 'error');
    return;
  }

  try {
    setButtonLoading(submitBtn, true);
    const response = await chrome.runtime.sendMessage({
      action: 'UNLOCK_WITH_RECOVERY',
      data: { recoveryKey }
    });

    if (response.success) {
      showToast('Odblokowano za pomocą klucza odzyskiwania', 'success');
      showScreen('main-screen');
      await loadEntries();
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Recovery unlock error:', error);
    errorDiv.classList.remove('hidden');
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
      entries = response.entries || [];
      displayEntries(entries);
      updateStats();
      await updateSecurityStatus();
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Load entries error:', error);
    showToast('Błąd ładowania haseł: ' + error.message, 'error');
  }
}

// Aktualizacja statystyk
function updateStats() {
  const totalElement = document.getElementById('total-passwords');
  const strongElement = document.getElementById('strong-passwords');
  
  if (totalElement) {
    totalElement.textContent = entries.length || 0;
  }
  
  if (strongElement) {
    // Proste sprawdzenie silnych haseł
    const strongCount = entries.filter(entry => {
      const password = entry.password || '';
      return password.length >= 12 && 
             /[A-Z]/.test(password) && 
             /[a-z]/.test(password) && 
             /[0-9]/.test(password) && 
             /[^A-Za-z0-9]/.test(password);
    }).length;
    
    strongElement.textContent = strongCount;
  }
}

async function updateSecurityStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'GET_TOTP_STATUS' });
    if (response.success) {
      const statusText = document.getElementById('totp-status-text');
      const enableBtn = document.getElementById('enable-totp');
      const disableBtn = document.getElementById('disable-totp');

      if (statusText) {
        statusText.textContent = response.enabled ? 'TOTP jest włączony.' : 'TOTP jest wyłączony.';
      }

      if (enableBtn) enableBtn.disabled = !!response.enabled;
      if (disableBtn) disableBtn.disabled = !response.enabled;

      if (!response.enabled) {
        const secretBox = document.getElementById('totp-secret-box');
        if (secretBox) {
          secretBox.classList.add('hidden');
          document.getElementById('totp-secret').textContent = '';
          document.getElementById('totp-otpauth').textContent = '';
        }
      }
    }
  } catch (error) {
    console.error('Security status error:', error);
  }
}

function displayEntries(entriesToShow) {
  const entriesList = document.getElementById('entries-list');
  const emptyState = document.getElementById('empty-state');
  
  if (!entriesList) return;
  
  if (!entriesToShow || entriesToShow.length === 0) {
    entriesList.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
  } else {
    if (emptyState) emptyState.classList.add('hidden');
    
    entriesList.innerHTML = entriesToShow.map(entry => `
      <div class="entry-item" data-id="${entry.id}">
        <div class="entry-icon">
          ${getEntryIcon(entry.url)}
        </div>
        <div class="entry-details" data-action="details">
          <div class="entry-title">${escapeHtml(entry.title || 'Bez tytułu')}</div>
          <div class="entry-subtitle">${escapeHtml(entry.username || entry.url || 'Brak danych')}</div>
        </div>
        <div class="entry-actions">
          <button class="btn-icon" data-action="copy-url" title="Kopiuj link">🔗</button>
          <button class="btn-icon" data-action="copy-username" title="Kopiuj login">👤</button>
          <button class="btn-icon" data-action="copy-password" title="Kopiuj hasło">🔑</button>
          <button class="btn-icon" data-action="edit" title="Edytuj">✏️</button>
          <button class="btn-icon" data-action="delete" title="Usuń">🗑️</button>
        </div>
      </div>
    `).join('');
    
    setupEntriesEventDelegation();
  }
}


function setupEntriesEventDelegation() {
  const entriesList = document.getElementById('entries-list');
  if (entriesList) {
    entriesList.removeEventListener('click', handleEntriesClick);
    entriesList.addEventListener('click', handleEntriesClick);
  }
}

function handleEntriesClick(e) {
    const entryItem = e.target.closest('.entry-item');
    if (!entryItem) return;
  
    const entryId = entryItem.dataset.id;
    const button = e.target.closest('button');
    const details = e.target.closest('[data-action="details"]');
  
    if (button) {
      const action = button.getAttribute('data-action');
      switch (action) {
        case 'copy-url':
          copyEntryData(entryId, 'url');
          break;
        case 'copy-username':
          copyEntryData(entryId, 'username');
          break;
        case 'copy-password':
          copyEntryData(entryId, 'password');
          break;
        case 'edit':
          editEntry(entryId);
          break;
        case 'delete':
          deleteEntry(entryId);
          break;
      }
    } else if (details) {
      showEntryDetails(entryId);
    }
}

function getEntryIcon(url) {
  if (!url) return '🔐';
  
  try {
    const domain = new URL(url).hostname.toLowerCase();
    
    // Rozszerzona mapa domen - około 50 najpopularniejszych serwisów
    const iconMap = {
      // Social Media
      'facebook.com': '🅕', 'instagram.com': '📷', 'twitter.com': '🐦', 'x.com': '🐦',
      'linkedin.com': '🅛', 'youtube.com': '📺', 'tiktok.com': '🎵', 'snapchat.com': '👻',
      'reddit.com': '📱', 'discord.com': '💬', 'telegram.org': '✈️', 'whatsapp.com': '💬',
      
      // Tech Giants
      'google.com': '🅖', 'microsoft.com': '🅜', 'apple.com': '🍎', 'amazon.com': '📦',
      'meta.com': '🅜', 'openai.com': '🤖', 'anthropic.com': '🧠',
      
      // Entertainment
      'netflix.com': '🎬', 'spotify.com': '🎵', 'twitch.tv': '🎮', 'steam.com': '🎮',
      'disney.com': '🏰', 'hulu.com': '📺', 'primevideo.com': '📺',
      
      // Business & Finance
      'paypal.com': '💳', 'stripe.com': '💳', 'revolut.com': '💳', 'wise.com': '💸',
      'chase.com': '🏛️', 'bankofamerica.com': '🏛️', 'wellsfargo.com': '🏛️',
      
      // Development
      'github.com': '🐙', 'gitlab.com': '🦊', 'bitbucket.org': '⚡', 'stackoverflow.com': '📚',
      'npmjs.com': '📦', 'vercel.com': '▲', 'heroku.com': '🟣', 'aws.amazon.com': '☁️',
      
      // E-commerce
      'ebay.com': '🛒', 'etsy.com': '🛍️', 'shopify.com': '🛒', 'alibaba.com': '🌏',
      
      // Email & Communication
      'gmail.com': '📧', 'outlook.com': '📧', 'yahoo.com': '📧', 'protonmail.com': '🔒',
      'slack.com': '💬', 'zoom.us': '📹', 'teams.microsoft.com': '💼',
      
      // Utilities
      'dropbox.com': '📦', 'onedrive.com': '☁️', 'icloud.com': '☁️', 'drive.google.com': '📁'
    };
    
    // Sprawdź mapę dokładnych domen
    for (const [key, icon] of Object.entries(iconMap)) {
      if (domain.includes(key)) return icon;
    }
    
    // Fallback na podstawie kategorii
    if (domain.includes('bank') || domain.includes('credit')) return '🏛️';
    if (domain.includes('shop') || domain.includes('store')) return '🛒';
    if (domain.includes('mail') || domain.includes('email')) return '📧';
    if (domain.includes('game') || domain.includes('gaming')) return '🎮';
    if (domain.includes('music') || domain.includes('audio')) return '🎵';
    if (domain.includes('video') || domain.includes('streaming')) return '📺';
    if (domain.includes('news') || domain.includes('blog')) return '📰';
    
    return '🌐';
  } catch {
    return '🔐';
  }
}


function showAddEntryForm() {
  currentEntryId = null;
  document.getElementById('entry-form-title').textContent = '➕ Dodaj hasło';
  document.getElementById('form-decoration-title').textContent = 'Nowe hasło';
  document.getElementById('entry-form').reset();
  showScreen('entry-form-screen');
}

function editEntry(id) {
  const entry = entries.find(e => e.id == id);
  if (!entry) {
    console.error('Entry not found:', id);
    return;
  }
  
  currentEntryId = id;
  document.getElementById('entry-form-title').textContent = '✏️ Edytuj hasło';
  document.getElementById('form-decoration-title').textContent = 'Edycja hasła';
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
      
      const existingEntry = entries.find(e => e.id == currentEntryId);
      if (existingEntry) {
        entryData.created = existingEntry.created;
      }
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

async function deleteEntry(id) {
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
function showEntryDetails(id) {
  const entry = entries.find(e => e.id == id);
  if (!entry) {
    console.error('Entry not found for details:', id);
    return;
  }
  
  currentDetailEntry = entry;
  
  document.getElementById('detail-entry-title').textContent = entry.title || 'Brak tytułu';
  document.getElementById('detail-entry-url').textContent = entry.url || 'Brak URL';
  document.getElementById('detail-entry-username').textContent = entry.username || 'Brak nazwy użytkownika';
  document.getElementById('detail-entry-password').textContent = '••••••••';
  document.getElementById('detail-entry-password').classList.add('password-hidden');
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
  
  if (passwordSpan.classList.contains('password-hidden')) {
    passwordSpan.textContent = currentDetailEntry.password;
    passwordSpan.classList.remove('password-hidden');
    toggleBtn.textContent = '🙈';
  } else {
    passwordSpan.textContent = '••••••••';
    passwordSpan.classList.add('password-hidden');
    toggleBtn.textContent = '👁️';
  }
}

function handleDetailCopy(e) {
  const field = e.target.getAttribute('data-field');
  if (!currentDetailEntry || !field) return;
  
  const value = currentDetailEntry[field];
  if (value) {
    copyToClipboard(value);
    const fieldNames = {
      'username': 'Login',
      'password': 'Hasło',
      'url': 'URL'
    };
    showToast(`${fieldNames[field] || field} skopiowane!`, 'success');
  }
}

// Copy functionality
async function copyEntryData(id, field) {
  const entry = entries.find(e => e.id == id);
  if (!entry) return;
  
  const value = entry[field];
  if (value) {
    await copyToClipboard(value);
    const fieldNames = {
      'username': 'Login',
      'password': 'Hasło',
      'url': 'URL'
    };
    showToast(`${fieldNames[field] || field} skopiowane!`, 'success');
  }
}

// Search functionality
function handleSearch(e) {
  const query = e.target.value.toLowerCase();
  
  if (!query || query === '') {
    displayEntries(entries);
  } else {
    const filtered = entries.filter(entry => 
      (entry.title && entry.title.toLowerCase().includes(query)) ||
      (entry.username && entry.username.toLowerCase().includes(query)) ||
      (entry.url && entry.url.toLowerCase().includes(query))
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
  showToast('Hasło skopiowane!', 'success');
}

function useGeneratedPassword() {
  const password = document.getElementById('generated-password').value;
  document.getElementById('entry-password').value = password;
  hidePasswordGenerator();
  showToast('Hasło użyte!', 'success');
}

async function revealRecoveryKey() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'GET_RECOVERY_KEY' });
    if (response.success) {
      await copyToClipboard(response.recoveryKey);
      alert(`Klucz odzyskiwania:\n${response.recoveryKey}`);
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Recovery key error:', error);
    showToast('Nie udało się pobrać klucza', 'error');
  }
}

async function handleEnableTotp() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'ENABLE_TOTP' });
    if (response.success) {
      document.getElementById('totp-secret-box')?.classList.remove('hidden');
      document.getElementById('totp-secret').textContent = response.secret;
      document.getElementById('totp-otpauth').textContent = response.otpauthUrl;
      await updateSecurityStatus();
      showToast('TOTP włączony – dodaj sekret do aplikacji 2FA', 'success');
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Enable TOTP error:', error);
    showToast('Nie udało się włączyć TOTP', 'error');
  }
}

async function handleDisableTotp() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'DISABLE_TOTP' });
    if (response.success) {
      document.getElementById('totp-secret-box')?.classList.add('hidden');
      await updateSecurityStatus();
      showToast('TOTP został wyłączony', 'success');
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Disable TOTP error:', error);
    showToast('Nie udało się wyłączyć TOTP', 'error');
  }
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
    toast.classList.add('hidden');
    setTimeout(() => {
      if (container.contains(toast)) {
        container.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make functions available globally
window.showEntryDetails = showEntryDetails;
window.editEntry = editEntry;
window.deleteEntry = deleteEntry;
window.copyEntryData = copyEntryData;
