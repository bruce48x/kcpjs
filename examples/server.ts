import { ListenWithOptions } from '../src/session';
import { AesBlock, CryptBlock } from '../src/crypt';
import { port, encryptionEnabled, algorithm, key, dataShards, parityShards } from './common';

let block: CryptBlock | undefined = undefined;
if (encryptionEnabled) {
    block = new AesBlock(algorithm, key);
}

// server
ListenWithOptions({
    port,
    block,
    dataShards,
    parityShards,
    callback: (session) => {
        // accept new session
        session.on('recv', (buff: Buffer) => {
            session.write(buff);
        });
    },
});
