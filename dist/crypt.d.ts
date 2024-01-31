/// <reference types="node" />
/// <reference types="node" />
import * as crypto from 'crypto';
export interface CryptBlock {
    encrypt: (plainData: Buffer) => Buffer;
    decrypt: (encryptData: Buffer) => Buffer;
}
export declare class AesBlock implements CryptBlock {
    private readonly algorithm;
    private readonly key;
    private readonly iv;
    authTagLength: number;
    constructor(algorithm: crypto.CipherGCMTypes, key: crypto.CipherKey, iv: crypto.BinaryLike);
    encrypt(data: Buffer): Buffer;
    decrypt(data: Buffer): Buffer;
}
