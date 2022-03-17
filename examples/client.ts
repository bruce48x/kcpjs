import { Kcp } from '../kcp';
import * as dgram from 'dgram';
import { log } from './common';

const kcpObj = new Kcp(255, { address: '127.0.0.1', port: 22333 });
const client = dgram.createSocket('udp4');

kcpObj.setOutput((data, size, context) => {
    // log('output()', data.slice(0, size));
    client.send(data, 0, size, context.port, context.address);
});

client.on('error', (err) => {
    log(`cleint error:${err.stack}`);
    client.close();
});

client.on('message', (msg, rinfo) => {
    kcpObj.input(msg, true, false);
});

setInterval(() => {
    kcpObj.update();
    const size = kcpObj.peekSize();
    if (size > 0) {
        const buffer = Buffer.alloc(size);
        const len = kcpObj.recv(buffer);
        if (len) {
            const msg = buffer.slice(0, len);
            log(`recv: ${msg}`);
        }
    }
}, 100);

setInterval(() => {
    const msg = Buffer.from(new Date().toISOString());
    log(`send: ${msg}`);
    kcpObj.send(msg);
}, 1000);
