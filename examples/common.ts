import * as crypto from 'crypto';

export function log(...msg) {
    console.log(`[${new Date().toISOString()}]`, ...msg);
}

// 连接信息
export const host = '127.0.0.1';
export const port = 12345;
export const conv = 255;

// fec 前向纠错
// 默认关闭；启用示例：dataShards = 4, parityShards = 1
export const dataShards = 0;
export const parityShards = 0;

// 加密
// 默认关闭；设为 true 可启用 AES-GCM
export const encryptionEnabled: boolean = false;
export const algorithm: crypto.CipherGCMTypes = 'aes-128-gcm';
export const key = 'aabbccddeeffgghh'; // crypto.randomBytes(128 / 8);
