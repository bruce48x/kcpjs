import { ListenWithOptions, DialWithOptions } from '../src/session';

const dataShards = 4;
const parityShards = 1;

function log(...msg) {
    console.log('[', new Date().toISOString(), ']', ...msg);
}

const host = '127.0.0.1';
const port = 22333;
const conv = 255;

// server
const listener = ListenWithOptions(port, undefined, dataShards, parityShards, (session) => {
    // accept new session
    session.on('recv', (buff: Buffer) => {
        session.write(buff);
    });
});

// client
const session = DialWithOptions(conv, port, host, undefined, dataShards, parityShards);
session.on('recv', (buff: Buffer) => {
    log('recv:', buff.toString());
});
setInterval(() => {
    const msg = Buffer.from(new Date().toISOString());
    log(`send: ${msg}`);
    session.write(msg);
}, 1000);
