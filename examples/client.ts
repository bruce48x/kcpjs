import { ListenWithOptions, DialWithOptions } from '../src/session';
import * as crypto from 'crypto';
import { AesBlock } from '../src/crypt';
import { log, host, port, conv, algorithm, key, iv, dataShards, parityShards } from './common';

// client
const session = DialWithOptions({
    conv,
    port,
    host,
    // block: new AesBlock(algorithm, key, iv),
    // dataShards,
    // parityShards,
});
session.on('recv', (buff: Buffer) => {
    log('recv:', buff.toString());
});
setInterval(() => {
    const msg = Buffer.from(new Date().toISOString());
    log(`send: ${msg}`);
    session.write(msg);
}, 1000);
