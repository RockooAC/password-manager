export class TotpManager {
  constructor() {
    this.timeStep = 30; // seconds
    this.codeDigits = 6;
  }

  generateSecret(length = 20) {
    const randomBytes = crypto.getRandomValues(new Uint8Array(length));
    const secret = this.#toBase32(randomBytes);
    const otpauthUrl = `otpauth://totp/SecurePass?secret=${secret}&issuer=SecurePass`;
    return { secret, otpauthUrl };
  }

  async generateTotp(secret, timestamp = Date.now()) {
    const counter = Math.floor(timestamp / 1000 / this.timeStep);
    const key = await crypto.subtle.importKey(
      'raw',
      this.#fromBase32(secret),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const counterBuffer = new ArrayBuffer(8);
    const view = new DataView(counterBuffer);
    view.setUint32(4, counter, false);

    const hmac = await crypto.subtle.sign('HMAC', key, counterBuffer);
    const hmacBytes = new Uint8Array(hmac);

    const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
    const binary =
      ((hmacBytes[offset] & 0x7f) << 24) |
      (hmacBytes[offset + 1] << 16) |
      (hmacBytes[offset + 2] << 8) |
      hmacBytes[offset + 3];

    const otp = binary % 10 ** this.codeDigits;
    return otp.toString().padStart(this.codeDigits, '0');
  }

  async verifyTotp(secret, code) {
    const now = Date.now();
    const windows = [-1, 0, 1];

    for (const w of windows) {
      const timestamp = now + w * this.timeStep * 1000;
      const generated = await this.generateTotp(secret, timestamp);
      if (generated === code) {
        return true;
      }
    }
    return false;
  }

  #toBase32(bytes) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of bytes) {
      value = (value << 8) | byte;
      bits += 8;

      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }

    return output;
  }

  #fromBase32(str) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    const output = [];

    for (const char of str.replace(/=+$/, '')) {
      const idx = alphabet.indexOf(char.toUpperCase());
      if (idx === -1) continue;

      value = (value << 5) | idx;
      bits += 5;

      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }

    return new Uint8Array(output);
  }
}
