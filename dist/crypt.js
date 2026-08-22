"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AesBlock = void 0;
const crypto = require("crypto");
class AesBlock {
    constructor(algorithm, key, legacyIv) {
        this.algorithm = algorithm;
        this.key = key;
        this.authenticated = true;
        this.nonceSize = 12;
        this.algorithm = algorithm;
        this.key = key;
        void legacyIv;
        this.authTagLength = 16;
        this.nextNonceValue = crypto.randomBytes(this.nonceSize);
        this.nonceExhausted = false;
    }
    nextNonce() {
        if (this.nonceExhausted) {
            throw new Error('AES-GCM nonce space exhausted');
        }
        const nonce = Buffer.from(this.nextNonceValue);
        for (let i = this.nextNonceValue.byteLength - 1; i >= 0; i--) {
            if (this.nextNonceValue[i] !== 0xff) {
                this.nextNonceValue[i]++;
                return nonce;
            }
            this.nextNonceValue[i] = 0;
        }
        this.nonceExhausted = true;
        return nonce;
    }
    encrypt(data) {
        const nonce = this.nextNonce();
        const opts = { authTagLength: this.authTagLength };
        const cipher = crypto.createCipheriv(this.algorithm, this.key, nonce, opts);
        const encrypted = cipher.update(data);
        const final = cipher.final();
        const authTag = cipher.getAuthTag();
        const output = Buffer.allocUnsafe(nonce.byteLength + encrypted.byteLength + final.byteLength + authTag.byteLength);
        let offset = nonce.byteLength;
        nonce.copy(output);
        encrypted.copy(output, offset);
        offset += encrypted.byteLength;
        final.copy(output, offset);
        offset += final.byteLength;
        authTag.copy(output, offset);
        return output;
    }
    decrypt(data) {
        if (data.byteLength < this.nonceSize + this.authTagLength) {
            throw new Error('AES-GCM ciphertext is too short');
        }
        const nonce = data.subarray(0, this.nonceSize);
        const authTag = data.slice(data.byteLength - this.authTagLength);
        const encryptedData = data.slice(this.nonceSize, data.byteLength - this.authTagLength);
        const opts = { authTagLength: this.authTagLength };
        const decipher = crypto.createDecipheriv(this.algorithm, this.key, nonce, opts);
        decipher.setAuthTag(authTag);
        const decrypted = decipher.update(encryptedData);
        const final = decipher.final();
        const output = Buffer.allocUnsafe(decrypted.byteLength + final.byteLength);
        decrypted.copy(output);
        final.copy(output, decrypted.byteLength);
        return output;
    }
}
exports.AesBlock = AesBlock;
