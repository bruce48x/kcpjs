import * as crypto from 'crypto';

export function log(...msg) {
    console.log(`[${new Date().toISOString()}]`, ...msg);
}

// 连接信息
export const host = '127.0.0.1';
export const port = 12345;
export const conv = 255;

// fec 前向纠错
// 两个参数的任意一个为0，则不启用 fec
export const dataShards = 4;
export const parityShards = 1;

// 加密
// 3个参数的任意一个为空，则不启用加密
export const algorithm: crypto.CipherGCMTypes = 'aes-128-gcm';
export const key = 'aabbccddeeffgghh'; // crypto.randomBytes(128 / 8);
export const iv = 'aabbccddeeff'; // crypto.randomBytes(12);
// export const iv = '';
