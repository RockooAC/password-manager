function detectLoginForms() {
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
      const inputs = form.querySelectorAll('input[type="password"], input[name*="pass"]');
      if (inputs.length > 0) {
        enhanceForm(form, inputs);
      }
    });
  }
  
  function enhanceForm(form, passwordInputs) {
    const overlay = document.createElement('div');
    overlay.style.position = 'relative';
    
    passwordInputs.forEach(input => {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      
      const fillButton = document.createElement('button');
      fillButton.textContent = '🔒 Fill';
      fillButton.style.position = 'absolute';
      fillButton.style.right = '5px';
      fillButton.style.top = '50%';
      fillButton.style.transform = 'translateY(-50%)';
      
      fillButton.addEventListener('click', async () => {
        const entries = await chrome.runtime.sendMessage({ action: 'GET_ENTRIES' });
        // Implementacja wyboru konta
      });
      
      wrapper.appendChild(input.cloneNode(true));
      wrapper.appendChild(fillButton);
      input.parentNode.replaceChild(wrapper, input);
    });
  }
  
  document.addEventListener('DOMContentLoaded', detectLoginForms);
  