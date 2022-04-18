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
        return Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
    }
    decrypt(data) {
        const authTag = data.slice(data.byteLength - this.authTagLength);
        const encryptedData = data.slice(0, data.byteLength - this.authTagLength);
        const opts = { authTagLength: this.authTagLength };
        const decipher = crypto.createDecipheriv(this.algorithm, this.key, this.iv, opts);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    }
}
exports.AesBlock = AesBlock;
