import { ListenWithOptions } from '../src/session';
import { AesBlock } from '../src/crypt';
import { port, algorithm, key, iv, dataShards, parityShards } from './common';

let block = undefined;
if (algorithm && key && iv) {
    block = new AesBlock(algorithm, key, iv);
}

// server
const listener = ListenWithOptions({
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
