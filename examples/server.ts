import { Kcp } from '../kcp';
import * as dgram from 'dgram';
import { log } from './common';

const server = dgram.createSocket('udp4');
const clients: { [k: string]: Kcp } = {};

function output(data: Buffer, size: number, context: any) {
    // log('output()', data.slice(0, size));
    server.send(data, 0, size, context.port, context.address);
}

server.on('error', (err) => {
    log(`server error: ${err.stack}`);
    server.close();
});

server.on('message', (msg, rinfo) => {
    const k = rinfo.address + '_' + rinfo.port;
    if (!clients[k]) {
        const context = {
            address: rinfo.address,
            port: rinfo.port,
        };
        const kcpObj = new Kcp(255, context);
        kcpObj.setOutput(output);
        clients[k] = kcpObj;
        check(kcpObj);
    }
    log('on message');

    const kcpObj = clients[k];
    kcpObj.input(msg, true, false);

    kcpObj.update();
    const size = kcpObj.peekSize();
    if (size > 0) {
        const buffer = Buffer.alloc(size);
        const len = kcpObj.recv(buffer);
        if (len) {
            const msg = buffer.slice(0, len);
            log(`recv: ${msg} from ${kcpObj.context().address}:${kcpObj.context().port}`);
            kcpObj.send(Buffer.from(msg));
        }
    }
});

server.on('listening', () => {
    const address = server.address();
    log(`server listening ${address.address} : ${address.port}`);
});

function check(kcpObj: Kcp) {
    if (!kcpObj) {
        return;
    }
    kcpObj.update();
    setTimeout(() => {
        check(kcpObj);
    }, kcpObj.check());
}

// setInterval(()=>{
//     for (const k in clients) {
//         clients[k].update();
//     }
// }, 100);

server.bind(22333);
