import * as crypto from 'crypto';

// 初始向量 iv 的长度 n 必须在 7 到 13 之间（ n 大于等于7，n 小于等于 13 ）

// 明文的长度最多是 2 ^ ( 8 * (15 - n)) 个字节
// 最小：iv长度是13的时候，明文长度最大是 65535 字节
// 最大：iv长度是7的时候，明文长度最大是 18446744073709551616 字节

export interface CryptBlock {
    encrypt: (plainData: Buffer) => Buffer;
    decrypt: (encryptData: Buffer) => Buffer;
}

export class AesBlock implements CryptBlock {
    authTagLength: number;

    constructor(
        private readonly algorithm: crypto.CipherGCMTypes,
        private readonly key: crypto.CipherKey,
        private readonly iv: crypto.BinaryLike,
    ) {
        this.algorithm = algorithm;
        this.key = key;
        this.iv = iv;
        this.authTagLength = 16;
    }

    encrypt(data: Buffer) {
        const opts: crypto.CipherGCMOptions = { authTagLength: this.authTagLength };
        const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv, opts);
        return Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
    }

    decrypt(data: Buffer) {
        const authTag = data.slice(data.byteLength - this.authTagLength);
        const encryptedData = data.slice(0, data.byteLength - this.authTagLength);
        const opts: crypto.CipherGCMOptions = { authTagLength: this.authTagLength };
        const decipher = crypto.createDecipheriv(this.algorithm, this.key, this.iv, opts);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    }
}
