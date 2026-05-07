import * as dgram from 'dgram';
import EventEmitter = require('events');
import {
    fecHeaderSizePlus2,
    typeData,
    typeParity,
    nonceSize,
    mtuLimit,
    cryptHeaderSize,
    crcSize,
    acceptBacklog,
} from './common';
import { FecDecoder } from './fecDecoder';
import { FecEncoder } from './fecEncoder';
import { FecPacket } from './fecPacket';
import { IKCP_OVERHEAD, IKCP_SN_OFFSET, Kcp } from './kcp';
import * as crypto from 'crypto';
import * as crc32 from 'crc-32';
import { CryptBlock } from './crypt';

function addrToString(host: string, port: number): string;
function addrToString(rinfo: dgram.RemoteInfo): string;
function addrToString(arg1: dgram.RemoteInfo | string, arg2?: number): string {
    if (typeof arg1 === 'string') {
        return `${arg1}:${arg2}`;
    } else {
        return `${arg1.address}:${arg1.port}`;
    }
}

export class Listener {
    block: CryptBlock; // block encryption
    dataShards: number; // FEC data shard
    parityShards: number; // FEC parity shard
    conn: dgram.Socket; // the underlying packet connection
    ownConn: boolean; // true if we created conn internally, false if provided by caller

    sessions: { [key: string]: UDPSession }; // all sessions accepted by this Listener
    maxSessions: number;
    sessionCount: number;
    closed: boolean;

    callback: ListenCallback;
    private messageHandler: (msg: Buffer, rinfo: dgram.RemoteInfo) => void;

    // packet input stage
    private packetInput(data: Buffer, rinfo: dgram.RemoteInfo) {
        if (this.closed) {
            return;
        }
        let decrypted = false;
        if (this.block && data.byteLength >= cryptHeaderSize) {
            try {
                data = this.block.decrypt(data);
                const checksum = crc32.buf(data.slice(cryptHeaderSize)) >>> 0;
                if (checksum === data.readUInt32LE(nonceSize)) {
                    data = data.slice(cryptHeaderSize);
                    decrypted = true;
                } else {
                    // do nothing
                    // crc32 检测未通过
                }
            } catch (err) {
                return;
            }
        } else if (!this.block) {
            decrypted = true;
        }

        const key = addrToString(rinfo);
        if (decrypted && data.byteLength >= IKCP_OVERHEAD) {
            let sess = this.sessions[key];
            let conv = 0;
            let sn = 0;
            let convRecovered = false;

            const fecFlag = data.readUInt16LE(4);
            if (fecFlag == typeData || fecFlag == typeParity) {
                // 16bit kcp cmd [81-84] and frg [0-255] will not overlap with FEC type 0x00f1 0x00f2
                // packet with FEC
                if (fecFlag == typeData && data.byteLength >= fecHeaderSizePlus2 + IKCP_OVERHEAD) {
                    conv = data.readUInt32LE(fecHeaderSizePlus2);
                    sn = data.readUInt32LE(fecHeaderSizePlus2 + IKCP_SN_OFFSET);
                    convRecovered = true;
                }
            } else {
                // packet without FEC
                conv = data.readUInt32LE();
                sn = data.readUInt32LE(IKCP_SN_OFFSET);
                convRecovered = true;
            }

            if (sess) {
                // existing connection
                if (!convRecovered || conv == sess.kcp.conv) {
                    // parity data or valid conversation
                    sess.kcpInput(data);
                } else if (sn == 0) {
                    // should replace current connection
                    sess.close();
                    sess = undefined;
                }
            }

            if (!sess && convRecovered) {
                if (this.sessionCount >= this.maxSessions) {
                    return;
                }
                // new session
                sess = newUDPSession({
                    conv,
                    port: rinfo.port,
                    host: rinfo.address,
                    dataShards: this.dataShards,
                    parityShards: this.parityShards,
                    listener: this,
                    conn: this.conn,
                    ownConn: false,
                    block: this.block,
                });
                sess.key = key;
                this.sessions[key] = sess;
                this.sessionCount++;
                this.callback(sess);
                sess.kcpInput(data);
            }
        }
    }

    /**
     * 停止 UDP 监听，关闭 socket
     */
    close(): any {
        if (this.closed) {
            return;
        }
        this.closed = true;
        if (this.messageHandler) {
            this.conn.off('message', this.messageHandler);
            this.messageHandler = undefined;
        }
        for (const sess of Object.values(this.sessions)) {
            sess.close();
        }
        this.sessions = {};
        this.sessionCount = 0;
        if (this.ownConn) {
            this.conn.close();
        }
    }

    closeSession(key: string): boolean {
        if (this.sessions[key]) {
            delete this.sessions[key];
            this.sessionCount = Math.max(0, this.sessionCount - 1);
            return true;
        }
        return false;
    }

    monitor() {
        this.messageHandler = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
            this.packetInput(msg, rinfo);
        };
        this.conn.on('message', this.messageHandler);
    }
}

const defaultWriteBufferLimit = 1024;

export class UDPSession extends EventEmitter {
    key: string;
    conn: dgram.Socket; // the underlying packet connection
    ownConn: boolean; // true if we created conn internally, false if provided by caller
    kcp: Kcp; // KCP ARQ protocol
    listener: Listener; // pointing to the Listener object if it's been accepted by a Listener
    block: CryptBlock; // BlockCrypt     // block encryption object

    // kcp receiving is based on packets
    // recvbuf turns packets into stream
    recvbuf: Buffer;
    bufptr: Buffer;

    // FEC codec
    fecDecoder: FecDecoder;
    fecEncoder: FecEncoder;

    // settings
    port: number;
    host: string;

    headerSize: number; // the header size additional to a KCP frame
    ackNoDelay: boolean; // send ack immediately for each incoming packet(testing purpose)
    writeDelay: boolean; // delay kcp.flush() for Write() for bulk transfer
    maxSendQueueSize: number;
    closed: boolean;
    private updateTimer: NodeJS.Timeout;
    private messageHandler: (msg: Buffer) => void;

    constructor() {
        super();
        this.ownConn = false;

        // kcp receiving is based on packets
        // recvbuf turns packets into stream
        this.recvbuf = Buffer.alloc(1);
        this.bufptr = Buffer.alloc(1);

        // FEC codec

        // settings
        this.port = 0;

        this.headerSize = 0; // the header size additional to a KCP frame
        this.ackNoDelay = false; // send ack immediately for each incoming packet(testing purpose)
        this.writeDelay = false; // delay kcp.flush() for Write() for bulk transfer
        this.maxSendQueueSize = defaultWriteBufferLimit;
        this.closed = false;
    }

    // Write implements net.Conn
    write(b: Buffer): number {
        return this.writeBuffers([b]);
    }

    // WriteBuffers write a vector of byte slices to the underlying connection
    writeBuffers(v: Buffer[]): number {
        if (this.closed || !this.kcp) {
            return -1;
        }
        let n = 0;
        let pending = this.kcp.getWaitSnd();
        for (const b of v) {
            const segmentCount = Math.max(1, Math.ceil(b.byteLength / this.kcp.mss));
            if (segmentCount > 255) {
                return n > 0 ? n : -2;
            }
            if (pending + segmentCount > this.maxSendQueueSize) {
                return n > 0 ? n : -1;
            }

            const ret = this.kcp.send(b);
            if (ret !== 0) {
                return n > 0 ? n : ret;
            }
            pending += segmentCount;
            n += b.byteLength;
        }
        if (!this.writeDelay) {
            this.kcp.flush(false);
        }
        return n;
    }

    // Close closes the connection.
    close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = undefined;
        }
        if (this.messageHandler) {
            this.conn.off('message', this.messageHandler);
            this.messageHandler = undefined;
        }

        // release pending segments
        if (this.kcp) {
            this.kcp.release();
            this.kcp = undefined;
        }

        // 释放 fec
        if (this.fecDecoder) {
            this.fecDecoder.release();
            this.fecDecoder = undefined;
        }
        if (this.fecEncoder) {
            this.fecEncoder.release();
            this.fecEncoder = undefined;
        }

        if (this.listener) {
            this.listener.closeSession(this.key);
        } else if (this.ownConn) {
            this.conn.close();
        }
        this.removeAllListeners();
    }

    // SetWriteDelay delays write for bulk transfer until the next update interval
    setWriteDelay(delay: boolean) {
        this.writeDelay = delay;
    }

    setWriteBufferLimit(maxSegments: number) {
        this.maxSendQueueSize = Math.max(1, Math.floor(maxSegments));
    }

    // SetWindowSize set maximum window size
    setWindowSize(sndwnd: number, rcvwnd: number) {
        this.kcp.setWndSize(sndwnd, rcvwnd);
    }

    // SetMtu sets the maximum transmission unit(not including UDP header)
    setMtu(mtu: number): boolean {
        if (mtu > mtuLimit) {
            return false;
        }

        this.kcp.setMtu(mtu);
        return true;
    }

    // SetStreamMode toggles the stream mode on/off
    setStreamMode(enable: boolean) {
        if (enable) {
            this.kcp.stream = 1;
        } else {
            this.kcp.stream = 0;
        }
    }

    // SetACKNoDelay changes ack flush option, set true to flush ack immediately,
    setACKNoDelay(nodelay: boolean) {
        this.ackNoDelay = nodelay;
    }

    // SetNoDelay calls nodelay() of kcp
    // https://github.com/skywind3000/kcp/blob/master/README.en.md#protocol-configuration
    setNoDelay(nodelay: number, interval: number, resend: number, nc: number) {
        this.kcp.setNoDelay(nodelay, interval, resend, nc);
    }

    // post-processing for sending a packet from kcp core
    // steps:
    // 1. FEC packet generation
    // 2. CRC32 integrity
    // 3. Encryption
    output(buf: Buffer) {
        if (this.closed) {
            return;
        }
        const doOutput = (buff: Buffer) => {
            if (this.closed) {
                return;
            }
            try {
                // 2&3. crc32 & encryption
                if (this.block) {
                    crypto.randomFillSync(buff, 0, nonceSize);
                    const checksum = crc32.buf(buff.slice(cryptHeaderSize)) >>> 0;
                    buff.writeUInt32LE(checksum, nonceSize);
                    buff = this.block.encrypt(buff);
                }
                this.conn.send(buff, this.port, this.host);
            } catch (err) {
                // socket may have been closed while FEC encryption was finishing
            }
        };

        // 1. FEC encoding
        if (this.fecEncoder) {
            // ecc = this.fecEncoder.encode
            this.fecEncoder.encode(buf, (err, result) => {
                if (this.closed) {
                    return;
                }
                if (err) {
                    // logger.error(err);
                    return;
                }
                const { data, parity } = result;
                const dataArr: Buffer[] = [];
                if (data?.length) {
                    dataArr.push(...data);
                }
                if (parity?.length) {
                    dataArr.push(...parity);
                }
                for (const buff of dataArr) {
                    doOutput(buff);
                }
            });
        } else {
            doOutput(buf);
        }
    }

    check() {
        if (this.closed || !this.kcp) {
            return;
        }
        this.kcp.update();
        this.updateTimer = setTimeout(() => {
            this.updateTimer = undefined;
            this.check();
        }, this.kcp.check());
    }

    // GetConv gets conversation id of a session
    getConv(): number {
        return this.kcp.conv;
    }

    // GetRTO gets current rto of the session
    getRTO(): number {
        return this.kcp.rx_rto;
    }

    // GetSRTT gets current srtt of the session
    getSRTT(): number {
        return this.kcp.rx_srtt;
    }

    // GetRTTVar gets current rtt variance of the session
    getSRTTVar(): number {
        return this.kcp.rx_rttvar;
    }

    // packet input stage
    packetInput(data: Buffer): void {
        if (this.closed || !this.kcp) {
            return;
        }
        let decrypted = false;
        if (this.block && data.byteLength >= cryptHeaderSize) {
            try {
                // 解密
                data = this.block.decrypt(data);

                const checksum = crc32.buf(data.slice(cryptHeaderSize)) >>> 0;
                if (checksum === data.readUInt32LE(nonceSize)) {
                    data = data.slice(cryptHeaderSize);
                    decrypted = true;
                } else {
                    // do nothing
                    // crc32 检测未通过
                }
            } catch (err) {
                return;
            }
        } else if (this.block == undefined) {
            decrypted = true;
        }

        if (decrypted && data.byteLength >= IKCP_OVERHEAD) {
            this.kcpInput(data);
        }
    }

    kcpInput(data: Buffer) {
        if (this.closed || !this.kcp) {
            return;
        }
        let kcpInErrors = 0;
        let fecParityShards = 0;

        const fpkt = new FecPacket(data);
        const fecFlag = fpkt.flag();
        if (fecFlag == typeData || fecFlag == typeParity) {
            // 16bit kcp cmd [81-84] and frg [0-255] will not overlap with FEC type 0x00f1 0x00f2
            if (data.byteLength >= fecHeaderSizePlus2) {
                if (fecFlag == typeParity) {
                    fecParityShards++;
                }

                // if fecDecoder is not initialized, create one with default parameter
                if (!this.fecDecoder) {
                    this.fecDecoder = new FecDecoder(1, 1);
                }
                this.fecDecoder.decode(fpkt, (err, result) => {
                    if (err) {
                        return;
                    }
                    const { data = [], parity = [] } = result;
                    for (const buff of data) {
                        const len = buff.readUInt16LE();
                        const ret = this.kcp.input(buff.slice(2, 2 + len), true, this.ackNoDelay);
                        if (ret != 0) {
                            kcpInErrors++;
                        }
                    }
                    for (const buff of parity) {
                        const len = buff.readUInt16LE();
                        const ret = this.kcp.input(buff.slice(2, 2 + len), false, this.ackNoDelay);
                        if (ret != 0) {
                            kcpInErrors++;
                        }
                    }

                    const size = this.kcp.peekSize();
                    if (size > 0) {
                        const buffer = Buffer.alloc(size);
                        const len = this.kcp.recv(buffer);
                        if (len) {
                            this.emit('recv', buffer.slice(0, len));
                        }
                    }
                });
            }
        } else {
            this.kcp.input(data, true, this.ackNoDelay);
            const size = this.kcp.peekSize();
            if (size > 0) {
                const buffer = Buffer.alloc(size);
                const len = this.kcp.recv(buffer);
                if (len) {
                    this.emit('recv', buffer.slice(0, len));
                }
            }
        }
    }

    readLoop() {
        this.messageHandler = (msg: Buffer) => {
            this.packetInput(msg);
        };
        this.conn.on('message', this.messageHandler);
    }
}

// newUDPSession create a new udp session for client or server
function newUDPSession(args: {
    conv: number;
    port: number;
    host: string;
    dataShards: number;
    parityShards: number;
    listener: Listener;
    conn: any;
    ownConn: boolean;
    block: CryptBlock;
}): UDPSession {
    const { conv, port, host, dataShards, parityShards, listener, conn, ownConn, block } = args;
    const sess = new UDPSession();
    sess.port = port;
    sess.host = host;
    sess.conn = conn;
    sess.ownConn = ownConn;
    sess.listener = listener;
    sess.block = block;
    sess.recvbuf = Buffer.alloc(mtuLimit);

    // FEC codec initialization
    if (dataShards && parityShards) {
        sess.fecDecoder = new FecDecoder(dataShards, parityShards);
        if (sess.block) {
            sess.fecEncoder = new FecEncoder(dataShards, parityShards, cryptHeaderSize);
        } else {
            sess.fecEncoder = new FecEncoder(dataShards, parityShards, 0);
        }
    }

    // calculate additional header size introduced by FEC and encryption
    if (sess.block) {
        sess.headerSize += cryptHeaderSize;
    }
    if (sess.fecEncoder) {
        sess.headerSize += fecHeaderSizePlus2;
    }

    sess.kcp = new Kcp(conv, sess);
    sess.kcp.setReserveBytes(sess.headerSize);
    sess.kcp.setOutput((buff, len) => {
        if (len >= IKCP_OVERHEAD + sess.headerSize) {
            sess.output(Buffer.from(buff.subarray(0, len)));
        }
    });

    if (!sess.listener) {
        // it's a client connection
        sess.readLoop();
    }

    sess.check();

    return sess;
}

export type ListenCallback = (session: UDPSession) => void;

// Listen listens for incoming KCP packets addressed to the local address laddr on the network "udp",
export function Listen(port: number, callback: ListenCallback): any {
    return ListenWithOptions({ port, callback });
}

export interface ListenOptions {
    port: number;
    block?: CryptBlock;
    dataShards?: number;
    parityShards?: number;
    maxSessions?: number;
    callback: ListenCallback;
}

// ListenWithOptions listens for incoming KCP packets addressed to the local address laddr on the network "udp" with packet encryption.
//
// 'block' is the block encryption algorithm to encrypt packets.
//
// 'dataShards', 'parityShards' specify how many parity packets will be generated following the data packets.
//
// Check https://github.com/klauspost/reedsolomon for details
export function ListenWithOptions(opts: ListenOptions): Listener {
    const { port, block, dataShards, parityShards, maxSessions, callback } = opts;
    const socket = dgram.createSocket('udp4');
    socket.bind(port);
    socket.on('listening', (err) => {
        if (err) {
            console.error(err);
        }
    });
    return serveConn(block, dataShards, parityShards, socket, true, callback, maxSessions);
}

// ServeConn serves KCP protocol for a single packet connection.
export function ServeConn(
    block: any,
    dataShards: number,
    parityShards: number,
    conn: dgram.Socket,
    callback: ListenCallback,
): Listener {
    return serveConn(block, dataShards, parityShards, conn, false, callback);
}

function serveConn(
    block: any,
    dataShards: number,
    parityShards: number,
    conn: dgram.Socket,
    ownConn: boolean,
    callback: ListenCallback,
    maxSessions = acceptBacklog,
): Listener {
    const listener = new Listener();
    listener.conn = conn;
    listener.ownConn = ownConn;
    listener.sessions = {};
    listener.sessionCount = 0;
    listener.maxSessions = Math.max(1, Math.floor(maxSessions));
    listener.dataShards = dataShards;
    listener.parityShards = parityShards;
    listener.block = block;
    listener.callback = callback;
    listener.monitor();
    return listener;
}

// Dial connects to the remote address "raddr" on the network "udp" without encryption and FEC
export function Dial(conv: number, port: number, host: string): any {
    return DialWithOptions({ conv, port, host });
}

export interface DialOptions {
    conv: number;
    port: number;
    host: string;
    block?: CryptBlock;
    dataShards?: number;
    parityShards?: number;
}

// DialWithOptions connects to the remote address "raddr" on the network "udp" with packet encryption
//
// 'block' is the block encryption algorithm to encrypt packets.
//
// 'dataShards', 'parityShards' specify how many parity packets will be generated following the data packets.
//
// Check https://github.com/klauspost/reedsolomon for details
export function DialWithOptions(opts: DialOptions): UDPSession {
    const { conv, port, host, dataShards, parityShards, block } = opts;
    const conn = dgram.createSocket('udp4');
    return newUDPSession({
        conv,
        port,
        host,
        dataShards,
        parityShards,
        listener: undefined,
        conn,
        ownConn: true,
        block,
    });
}
