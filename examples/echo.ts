import { ListenWithOptions, DialWithOptions } from '../src/session';
import * as crypto from 'crypto';
import { AesBlock } from '../src/crypt';
import { log } from './common';

// 连接信息
const host = '127.0.0.1';
const port = 22333;
const conv = 255;

// fec 前向纠错
const dataShards = 4;
const parityShards = 1;

// 加密
const algorithm: crypto.CipherGCMTypes = 'aes-128-gcm';
const key = crypto.randomBytes(128 / 8);
const iv = crypto.randomBytes(12);

// server
const listener = ListenWithOptions({
    port,
    block: new AesBlock(algorithm, key, iv),
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
    block: new AesBlock(algorithm, key, iv),
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
