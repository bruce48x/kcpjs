"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AesBlock = void 0;
const crypto = require("crypto");
class AesBlock {
    constructor(algorithm, key, iv) {
        this.algorithm = algorithm;
        this.key = key;
        this.iv = iv;
        this.algorithm = algorithm;
        this.key = key;
        this.iv = iv;
        this.authTagLength = 16;
    }
    encrypt(data) {
        const opts = { authTagLength: this.authTagLength };
        const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv, opts);
        const encrypted = cipher.update(data);
        const final = cipher.final();
        const authTag = cipher.getAuthTag();
        const output = Buffer.allocUnsafe(encrypted.byteLength + final.byteLength + authTag.byteLength);
        let offset = 0;
        encrypted.copy(output, offset);
        offset += encrypted.byteLength;
        final.copy(output, offset);
        offset += final.byteLength;
        authTag.copy(output, offset);
        return output;
    }
    decrypt(data) {
        const authTag = data.slice(data.byteLength - this.authTagLength);
        const encryptedData = data.slice(0, data.byteLength - this.authTagLength);
        const opts = { authTagLength: this.authTagLength };
        const decipher = crypto.createDecipheriv(this.algorithm, this.key, this.iv, opts);
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
