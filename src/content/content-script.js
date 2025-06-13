console.log('SecurePass content script loaded');

let autoFillButtons = [];
let currentUrl = window.location.href;
let formObserver = null;

initialize();

function initialize() {
  detectAndEnhanceForms();
  
  setInterval(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      detectAndEnhanceForms();
    }
  }, 1000);
  
  setupMutationObserver();
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'FILL_FORM') {
      fillForm(request.data);
      sendResponse({ success: true });
    }
  });
}

function setupMutationObserver() {
  if (formObserver) {
    formObserver.disconnect();
  }
  
  formObserver = new MutationObserver((mutations) => {
    let shouldRescan = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && 
          (isFormElement(mutation.target) || 
           Array.from(mutation.addedNodes).some(isFormElement))) {
        shouldRescan = true;
        break;
      }
    }
    
    if (shouldRescan) {
      detectAndEnhanceForms();
    }
  });
  
  formObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function isFormElement(node) {
  if (!node || !node.tagName) return false;
  
  const tag = node.tagName.toLowerCase();
  return tag === 'form' || tag === 'input' || tag === 'div' || tag === 'button';
}

function detectAndEnhanceForms() {
  console.log('Scanning for login forms...');
  
  removeExistingButtons();
  
  const forms = document.querySelectorAll('form');
  for (const form of forms) {
    const passwordFields = form.querySelectorAll('input[type="password"]');
    
    if (passwordFields.length > 0) {
      enhanceForm(form, passwordFields);
    }
  }
  
  const standalonePasswordFields = document.querySelectorAll('input[type="password"]:not(form input)');
  for (const field of standalonePasswordFields) {
    enhanceStandaloneField(field);
  }
}

function removeExistingButtons() {
  for (const button of autoFillButtons) {
    if (button.parentNode) {
      button.parentNode.removeChild(button);
    }
  }
  autoFillButtons = [];
}

function enhanceForm(form, passwordFields) {
  let usernameField = null;
  
  const inputs = form.querySelectorAll('input[type="text"], input[type="email"], input:not([type])');
  
  for (const input of inputs) {
    if (input.type === 'hidden' || !isVisible(input)) continue;
    
    if (input.type === 'email' || 
        input.name?.toLowerCase().includes('email') || 
        input.id?.toLowerCase().includes('email') ||
        input.placeholder?.toLowerCase().includes('email') ||
        input.autocomplete === 'username') {
      usernameField = input;
      break;
    }
    
    if (!usernameField) {
      usernameField = input;
    }
  }
  
  for (const passwordField of passwordFields) {
    if (!isVisible(passwordField)) continue;
    
    createAutofillButton(passwordField, usernameField);
  }
  
  form.addEventListener('submit', () => {
    if (usernameField && passwordFields.length > 0) {
      const passwordField = passwordFields[0];
      const loginData = {
        url: window.location.href,
        username: usernameField.value,
        password: passwordField.value
      };
      
      if (loginData.username && loginData.password) {
        setTimeout(() => {
          offerToSaveCredentials(loginData);
        }, 500);
      }
    }
  });
}

function enhanceStandaloneField(passwordField) {
  let usernameField = null;
  const container = findParentContainer(passwordField);
  
  if (container) {
    const inputs = container.querySelectorAll('input[type="text"], input[type="email"], input:not([type])');
    for (const input of inputs) {
      if (input.type !== 'hidden' && isVisible(input)) {
        usernameField = input;
        break;
      }
    }
  }
  
  createAutofillButton(passwordField, usernameField);
}

function findParentContainer(element) {
  let parent = element.parentElement;
  let depth = 0;
  const maxDepth = 4;
  
  while (parent && depth < maxDepth) {
    const inputs = parent.querySelectorAll('input');
    if (inputs.length >= 2) {
      return parent;
    }
    
    parent = parent.parentElement;
    depth++;
  }
  
  return null;
}

function createAutofillButton(passwordField, usernameField) {
  const wrapper = document.createElement('div');
  wrapper.className = 'securepass-autofill-wrapper';
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-block';
  wrapper.style.zIndex = '10000';
  
  const button = document.createElement('button');
  button.className = 'securepass-autofill-button';
  button.textContent = '🔐';
  button.title = 'Autouzupełnij hasło z SecurePass';
  button.style.position = 'absolute';
  button.style.right = '10px';
  button.style.top = '50%';
  button.style.transform = 'translateY(-50%)';
  button.style.backgroundColor = 'transparent';
  button.style.border = 'none';
  button.style.cursor = 'pointer';
  button.style.fontSize = '16px';
  button.style.padding = '4px';
  button.style.zIndex = '10001';
  button.style.borderRadius = '4px';
  
  button.addEventListener('mouseover', () => {
    button.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
  });
  
  button.addEventListener('mouseout', () => {
    button.style.backgroundColor = 'transparent';
  });
  
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'GET_ENTRIES_FOR_URL',
        data: { url: window.location.href }
      });
      
      if (response.success && response.entries.length > 0) {
        if (response.entries.length === 1) {
          fillForm({
            username: response.entries[0].username,
            password: response.entries[0].password
          });
        } else {
          showCredentialSelector(response.entries, {
            passwordField,
            usernameField
          });
        }
      } else {
        showMessage('Brak zapisanych haseł dla tej strony');
      }
    } catch (error) {
      console.error('Error getting credentials:', error);
      showMessage('Błąd pobierania haseł', 'error');
    }
  });
  
  const rect = passwordField.getBoundingClientRect();
  const fieldParent = passwordField.parentElement;
  
  wrapper.appendChild(button);
  
  if (fieldParent) {
    fieldParent.style.position = 'relative';
    fieldParent.appendChild(wrapper);
    
    button.style.right = '10px';
    button.style.top = `${passwordField.offsetTop + passwordField.offsetHeight/2}px`;
    
    autoFillButtons.push(wrapper);
  }
}

function showCredentialSelector(entries, fields) {
  const overlay = document.createElement('div');
  overlay.className = 'securepass-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  overlay.style.zIndex = '10000';
  overlay.style.display = 'flex';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  
  const modal = document.createElement('div');
  modal.className = 'securepass-modal';
  modal.style.backgroundColor = 'white';
  modal.style.padding = '20px';
  modal.style.borderRadius = '8px';
  modal.style.maxWidth = '350px';
  modal.style.width = '90%';
  modal.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  
  const header = document.createElement('h3');
  header.textContent = 'Wybierz konto';
  header.style.margin = '0 0 15px 0';
  header.style.fontSize = '16px';
  header.style.color = '#333';
  
  const list = document.createElement('div');
  list.style.maxHeight = '300px';
  list.style.overflowY = 'auto';
  
  for (const entry of entries) {
    const item = document.createElement('div');
    item.style.padding = '10px';
    item.style.margin = '5px 0';
    item.style.borderRadius = '4px';
    item.style.cursor = 'pointer';
    item.style.transition = 'background-color 0.2s ease';
    
    item.innerHTML = `
      <div style="font-weight: 500; color: #333;">${entry.title || 'Bez nazwy'}</div>
      <div style="font-size: 13px; color: #666;">${entry.username}</div>
    `;
    
    item.addEventListener('mouseover', () => {
      item.style.backgroundColor = '#f5f5f5';
    });
    
    item.addEventListener('mouseout', () => {
      item.style.backgroundColor = 'transparent';
    });
    
    item.addEventListener('click', () => {
      fillForm({
        username: entry.username,
        password: entry.password
      });
      document.body.removeChild(overlay);
    });
    
    list.appendChild(item);
  }
  
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Anuluj';
  closeButton.style.marginTop = '15px';
  closeButton.style.padding = '8px 16px';
  closeButton.style.backgroundColor = '#f1f1f1';
  closeButton.style.border = 'none';
  closeButton.style.borderRadius = '4px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.width = '100%';
  
  closeButton.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  
  modal.appendChild(header);
  modal.appendChild(list);
  modal.appendChild(closeButton);
  overlay.appendChild(modal);
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
  
  document.body.appendChild(overlay);
}

function fillForm(data) {
  const passwordFields = document.querySelectorAll('input[type="password"]');
  let usernameField = null;
  
  if (passwordFields.length > 0) {
    let passwordField = null;
    for (const field of passwordFields) {
      if (isVisible(field)) {
        passwordField = field;
        break;
      }
    }
    
    if (passwordField) {
      const form = passwordField.closest('form');
      const container = form || findParentContainer(passwordField);
      
      if (container) {
        const inputs = container.querySelectorAll('input[type="text"], input[type="email"], input:not([type])');
        for (const input of inputs) {
          if (input.type !== 'hidden' && isVisible(input)) {
            usernameField = input;
            break;
          }
        }
      }
      
      if (usernameField && data.username) {
        usernameField.value = data.username;
        triggerInputEvent(usernameField);
      }
      
      if (passwordField && data.password) {
        passwordField.value = data.password;
        triggerInputEvent(passwordField);
      }
      
      showMessage('Formularz wypełniony!');
    }
  }
}

function offerToSaveCredentials(loginData) {
  const prompt = document.createElement('div');
  prompt.className = 'securepass-save-prompt';
  prompt.style.position = 'fixed';
  prompt.style.top = '20px';
  prompt.style.right = '20px';
  prompt.style.padding = '15px';
  prompt.style.backgroundColor = 'white';
  prompt.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  prompt.style.borderRadius = '8px';
  prompt.style.zIndex = '10000';
  prompt.style.maxWidth = '300px';
  prompt.style.animation = 'securepass-slide-in 0.3s ease-out';
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes securepass-slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  prompt.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 10px;">
      <div style="font-size: 24px; margin-right: 10px;">🔐</div>
      <div>
        <div style="font-weight: 600; color: #333;">Zapisać dane logowania?</div>
        <div style="font-size: 13px; color: #666;">${loginData.username} dla ${new URL(loginData.url).hostname}</div>
      </div>
    </div>
    <div style="display: flex; gap: 10px;">
      <button id="securepass-save-yes" style="flex: 1; padding: 8px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 4px; cursor: pointer;">Zapisz</button>
      <button id="securepass-save-no" style="flex: 1; padding: 8px; background: #f1f1f1; border: none; border-radius: 4px; cursor: pointer;">Anuluj</button>
    </div>
  `;
  
  document.body.appendChild(prompt);
  
  document.getElementById('securepass-save-yes').addEventListener('click', async () => {
    try {
      const title = new URL(loginData.url).hostname;
      
      await chrome.runtime.sendMessage({
        action: 'SAVE_ENTRY',
        data: {
          title: `Login dla ${title}`,
          url: loginData.url,
          username: loginData.username,
          password: loginData.password,
          notes: `Automatycznie zapisane ${new Date().toLocaleString()}`
        }
      });
      
      showMessage('Dane logowania zapisane!');
    } catch (error) {
      console.error('Error saving credentials:', error);
      showMessage('Błąd zapisywania danych', 'error');
    } finally {
      document.body.removeChild(prompt);
    }
  });
  
  document.getElementById('securepass-save-no').addEventListener('click', () => {
    document.body.removeChild(prompt);
  });
  
  setTimeout(() => {
    if (document.body.contains(prompt)) {
      document.body.removeChild(prompt);
    }
  }, 30000);
}

function showMessage(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'securepass-toast';
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.left = '20px';
  toast.style.padding = '10px 15px';
  toast.style.borderRadius = '4px';
  toast.style.color = 'white';
  toast.style.fontSize = '14px';
  toast.style.zIndex = '10000';
  toast.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
  
  if (type === 'error') {
    toast.style.backgroundColor = '#ff4757';
  } else {
    toast.style.backgroundColor = '#2ed573';
  }
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

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
