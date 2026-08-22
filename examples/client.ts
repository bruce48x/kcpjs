import { DialWithOptions } from '../src/session';
import { AesBlock, CryptBlock } from '../src/crypt';
import { log, host, port, conv, encryptionEnabled, algorithm, key, dataShards, parityShards } from './common';

let block: CryptBlock | undefined = undefined;
if (encryptionEnabled) {
    block = new AesBlock(algorithm, key);
}

// client
const session = DialWithOptions({
    conv,
    port,
    host,
    block,
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
