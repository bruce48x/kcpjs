import { ListenWithOptions } from '../src/session';
import { AesBlock, CryptBlock } from '../src/crypt';
import { port, algorithm, key, iv, dataShards, parityShards } from './common';

let block: CryptBlock | undefined = undefined;
if (algorithm && key && iv) {
    block = new AesBlock(algorithm, key, iv);
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
