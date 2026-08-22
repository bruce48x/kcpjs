/// <reference types="node" />
/// <reference types="node" />
import * as crypto from 'crypto';
export interface CryptBlock {
    encrypt: (plainData: Buffer) => Buffer;
    decrypt: (encryptData: Buffer) => Buffer;
    authenticated?: boolean;
}
export declare class AesBlock implements CryptBlock {
    private readonly algorithm;
    private readonly key;
    authTagLength: number;
    readonly authenticated = true;
    readonly nonceSize = 12;
    private nextNonceValue;
    private nonceExhausted;
    constructor(algorithm: crypto.CipherGCMTypes, key: crypto.CipherKey, legacyIv?: crypto.BinaryLike);
    private nextNonce;
    encrypt(data: Buffer): Buffer;
    decrypt(data: Buffer): Buffer;
}
