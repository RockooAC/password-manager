export function bufferToBase64url(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64urlToBuffer(base64url) {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export class WebAuthnManager {
  constructor(storageManager) {
    this.storage = storageManager;
    this.activeChallenge = null;
    this.challengeTtl = 2 * 60 * 1000; // 2 minutes
  }

  async getRegistration() {
    return await this.storage.getSetting('webauthn');
  }

  async saveRegistration(data) {
    await this.storage.saveSetting('webauthn', data);
  }

  async clearRegistration() {
    await this.storage.saveSetting('webauthn', null);
  }

  generateChallenge() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return bufferToBase64url(bytes);
  }

  setActiveChallenge(challenge) {
    this.activeChallenge = {
      value: challenge,
      createdAt: Date.now()
    };
  }

  clearActiveChallenge() {
    this.activeChallenge = null;
  }

  isChallengeValid(challenge) {
    if (!this.activeChallenge) return false;
    const isExpired = Date.now() - this.activeChallenge.createdAt > this.challengeTtl;
    if (isExpired) return false;
    return this.activeChallenge.value === challenge;
  }

  verifyAssertion(assertion, registration) {
    if (!assertion || !registration) {
      return { success: false, error: 'Brak danych WebAuthn' };
    }

    if (!this.activeChallenge) {
      return { success: false, error: 'Brak aktywnego wyzwania WebAuthn' };
    }

    try {
      const clientDataJSON = JSON.parse(new TextDecoder().decode(new Uint8Array(base64urlToBuffer(assertion.clientDataJSON))));
      if (clientDataJSON.type !== 'webauthn.get') {
        return { success: false, error: 'Nieprawidłowy typ odpowiedzi WebAuthn' };
      }

      if (!this.isChallengeValid(clientDataJSON.challenge)) {
        return { success: false, error: 'Wyzwanie WebAuthn jest nieaktualne lub nieprawidłowe' };
      }

      if (assertion.id !== registration.credentialId) {
        return { success: false, error: 'Klucz sprzętowy nie jest zarejestrowany' };
      }

      this.clearActiveChallenge();
      return { success: true };
    } catch (error) {
      console.error('WebAuthn verify error:', error);
      return { success: false, error: 'Nie można zweryfikować odpowiedzi WebAuthn' };
    }
  }
}
