import { ListenWithOptions, DialWithOptions } from '../src/session';
import * as crypto from 'crypto';
import { AesBlock } from '../src/crypt';
import { log, host, port, conv, algorithm, key, iv, dataShards, parityShards } from './common';

// server
const listener = ListenWithOptions({
    port,
    // block: new AesBlock(algorithm, key, iv),
    // dataShards,
    // parityShards,
    callback: (session) => {
        // accept new session
        session.on('recv', (buff: Buffer) => {
            session.write(buff);
        });
    },
});
