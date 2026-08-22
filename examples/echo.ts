import { ListenWithOptions, DialWithOptions } from '../src/session';
import * as crypto from 'crypto';
import { AesBlock } from '../src/crypt';
import { log } from './common';

// 连接信息
const host = '127.0.0.1';
const port = 22333;
const conv = 255;

// fec 前向纠错
const dataShards = 0;
const parityShards = 0;

// 加密
const encryptionEnabled: boolean = false;
const algorithm: crypto.CipherGCMTypes = 'aes-128-gcm';
const key = crypto.randomBytes(128 / 8);

// server
const listener = ListenWithOptions({
    port,
    block: encryptionEnabled ? new AesBlock(algorithm, key) : undefined,
    dataShards,
    parityShards,
    callback: (session) => {
        // accept new session
        session.on('recv', (buff: Buffer) => {
            session.write(buff);
        });
    },
});

// client
const session = DialWithOptions({
    conv,
    port,
    host,
    block: encryptionEnabled ? new AesBlock(algorithm, key) : undefined,
    dataShards,
    parityShards,
});
session.on('recv', (buff: Buffer) => {
    log('recv:', buff.toString());
});
setInterval(() => {
    const msg = Buffer.from(new Date().toISOString());
    log(`send: ${msg}`);
    session.write(msg);
}, 1000);
