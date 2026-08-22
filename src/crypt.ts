import * as crypto from 'crypto';

// 初始向量 iv 的长度 n 必须在 7 到 13 之间（ n 大于等于7，n 小于等于 13 ）

// 明文的长度最多是 2 ^ ( 8 * (15 - n)) 个字节
// 最小：iv长度是13的时候，明文长度最大是 65535 字节
// 最大：iv长度是7的时候，明文长度最大是 18446744073709551616 字节

export interface CryptBlock {
    encrypt: (plainData: Buffer) => Buffer;
    decrypt: (encryptData: Buffer) => Buffer;
    authenticated?: boolean;
}

export class AesBlock implements CryptBlock {
    authTagLength: number;
    readonly authenticated = true;
    readonly nonceSize = 12;
    private nextNonceValue: Buffer;
    private nonceExhausted: boolean;

    constructor(
        private readonly algorithm: crypto.CipherGCMTypes,
        private readonly key: crypto.CipherKey,
        legacyIv?: crypto.BinaryLike,
    ) {
        this.algorithm = algorithm;
        this.key = key;
        void legacyIv;
        this.authTagLength = 16;
        this.nextNonceValue = crypto.randomBytes(this.nonceSize);
        this.nonceExhausted = false;
    }

    private nextNonce(): Buffer {
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

    encrypt(data: Buffer) {
        const nonce = this.nextNonce();
        const opts: crypto.CipherGCMOptions = { authTagLength: this.authTagLength };
        const cipher = crypto.createCipheriv(this.algorithm, this.key, nonce, opts);
        const encrypted = cipher.update(data);
        const final = cipher.final();
        const authTag = cipher.getAuthTag();
        const output = Buffer.allocUnsafe(
            nonce.byteLength + encrypted.byteLength + final.byteLength + authTag.byteLength,
        );
        let offset = nonce.byteLength;
        nonce.copy(output);
        encrypted.copy(output, offset);
        offset += encrypted.byteLength;
        final.copy(output, offset);
        offset += final.byteLength;
        authTag.copy(output, offset);
        return output;
    }

    decrypt(data: Buffer) {
        if (data.byteLength < this.nonceSize + this.authTagLength) {
            throw new Error('AES-GCM ciphertext is too short');
        }

        const nonce = data.subarray(0, this.nonceSize);
        const authTag = data.slice(data.byteLength - this.authTagLength);
        const encryptedData = data.slice(this.nonceSize, data.byteLength - this.authTagLength);
        const opts: crypto.CipherGCMOptions = { authTagLength: this.authTagLength };
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
