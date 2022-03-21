import * as dgram from 'dgram';
import EventEmitter = require('events');
import { fecHeaderSizePlus2, typeData, typeParity, nonceSize, mtuLimit, cryptHeaderSize } from './common';
import { FecDecoder } from './fecDecoder';
import { FecEncoder } from './fecEncoder';
import { FecPacket } from './fecPacket';
import { IKCP_OVERHEAD, IKCP_SN_OFFSET, Kcp } from './kcp';

function addrToString(rinfo: dgram.RemoteInfo) {
    return `${rinfo.address}:${rinfo.port}`;
}

export class Listener {
    block: any; // block encryption
    dataShards: number; // FEC data shard
    parityShards: number; // FEC parity shard
    conn: dgram.Socket; // the underlying packet connection
    ownConn: boolean; // true if we created conn internally, false if provided by caller

    sessions: { [key: string]: UDPSession }; // all sessions accepted by this Listener
    sessionLock: any;

    dieOnce: any; // sync.Once

    // socket error handling
    socketReadError: any; //atomic.Value
    socketReadErrorOnce: any; //sync.Once

    callback: ListenCallback;

    // packet input stage
    private packetInput(data: Buffer, rinfo: dgram.RemoteInfo) {
        let decrypted = false;
        if (this.block && data.byteLength >= cryptHeaderSize) {
            /*
            l.block.Decrypt(data, data)
             data = data[nonceSize:]
             checksum := crc32.ChecksumIEEE(data[crcSize:])
             if checksum == binary.LittleEndian.Uint32(data) {
                 data = data[crcSize:]
                 decrypted = true
             } else {
                 atomic.AddUint64(&DefaultSnmp.InCsumErrors, 1)
             }
            */
        } else if (!this.block) {
            decrypted = true;
        }

        const addr = addrToString(rinfo);
        if (decrypted && data.byteLength >= IKCP_OVERHEAD) {
            let sess = this.sessions[addr];
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
                this.sessions[addr] = sess;
                this.callback(sess);
                sess.kcpInput(data);
            }
        }
    }

    // Close stops listening on the UDP address, and closes the socket
    Close(): any {
        this.conn.close();
    }

    // Addr returns the listener's network address, The Addr returned is shared by all invocations of Addr, so do not modify it.
    Addr(): any {
        return this.conn.address;
    }

    monitor() {
        this.conn.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
            this.packetInput(msg, rinfo);
        });
    }
}

export class UDPSession extends EventEmitter {
    conn: dgram.Socket; // the underlying packet connection
    ownConn: boolean; // true if we created conn internally, false if provided by caller
    kcp: Kcp; // KCP ARQ protocol
    listener: Listener; // pointing to the Listener object if it's been accepted by a Listener
    block: any; // BlockCrypt     // block encryption object

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
    dup: number; // duplicate udp packets(testing purpose)

    // nonce generator
    nonce: any; // Entropy

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
        this.dup = 0; // duplicate udp packets(testing purpose)
    }

    read(): void {
        let bufsize = 0; // 每次读的包的长度
        let allsize = 0; // 总共读的包的长度
        let buflen = 0;
        let len = 0;
        while (true) {
            bufsize = this.kcp.peekSize();
            if (bufsize <= 0) {
                break;
            }
            allsize += bufsize;
            if (allsize > this.recvbuf.byteLength) {
                this.recvbuf = Buffer.concat([this.recvbuf, Buffer.alloc(allsize - this.recvbuf.byteLength)]);
            }
            buflen = this.kcp.recv(this.recvbuf);
            if (buflen <= 0) {
                break;
            }
            len += buflen;
            if (this.kcp.stream === 0) {
                break;
            }
        }
        if (len > 0) {
            this.emit('recv', [this.recvbuf.slice(0, len)]);
        }
    }

    // Write implements net.Conn
    write(b: Buffer): number {
        return this.writeBuffers([b]);
    }

    // WriteBuffers write a vector of byte slices to the underlying connection
    writeBuffers(v: Buffer[]): number {
        let n = 0;
        /*
        while (true) {
            // make sure write do not overflow the max sliding window on both side
            let waitsnd = this.kcp.getWaitSnd();
            if (waitsnd < this.kcp.snd_wnd && waitsnd < this.kcp.rmt_wnd) {
                for (let b of v) {
                    n += b.byteLength;
                    while (true) {
                        if (b.byteLength <= this.kcp.mss) {
                            this.kcp.send(b);
                            break;
                        } else {
                            this.kcp.send(b.slice(0, this.kcp.mss));
                            b = b.slice(this.kcp.mss);
                        }
                    }
                }

                waitsnd = this.kcp.getWaitSnd();
                if (waitsnd >= this.kcp.snd_wnd || waitsnd >= this.kcp.rmt_wnd || !this.writeDelay) {
                    this.kcp.flush(false);
                    this.uncork();
                }
                return n;
            }
        }
        */
        for (const b of v) {
            n += b.byteLength;
            this.kcp.send(b);
        }
        this.kcp.update();
        return n;
    }

    // Close closes the connection.
    close() {
        // try best to send all queued messages
        this.kcp.flush(false);
        // release pending segments
        this.kcp.releaseTX();
        if (this.fecDecoder !== undefined) {
            // this.fecDecoder.release()
        }
    }

    // LocalAddr returns the local network address. The Addr returned is shared by all invocations of LocalAddr, so do not modify it.
    localAddr(): any {
        // return this.conn.LocalAddr()
        return {};
    }

    // RemoteAddr returns the remote network address. The Addr returned is shared by all invocations of RemoteAddr, so do not modify it.
    remoteAddr(): any {
        return `${this.host}:${this.port}`;
    }

    // SetWriteDelay delays write for bulk transfer until the next update interval
    setWriteDelay(delay: boolean) {
        this.writeDelay = delay;
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
    // 4. TxQueue
    output(buf: Buffer) {
        const doOutput = (buff: Buffer) => {
            // 2&3. crc32 & encryption
            if (this.block) {
                this.nonce.Fill(buf.slice(0, nonceSize));
                /*
                checksum := crc32.ChecksumIEEE(buf[cryptHeaderSize:])
                binary.LittleEndian.PutUint32(buf[nonceSize:], checksum)
                s.block.Encrypt(buf, buf)
                */

                /*
                for k := range ecc {
                    s.nonce.Fill(ecc[k][:nonceSize])
                    checksum := crc32.ChecksumIEEE(ecc[k][cryptHeaderSize:])
                    binary.LittleEndian.PutUint32(ecc[k][nonceSize:], checksum)
                    s.block.Encrypt(ecc[k], ecc[k])
                }
                */
            }
            this.conn.send(buff, this.port, this.host);
        };

        // 1. FEC encoding
        if (this.fecEncoder) {
            // ecc = this.fecEncoder.encode
            this.fecEncoder.encode(buf, (err, result) => {
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
        if (!this.kcp) {
            return;
        }
        this.kcp.update();
        setTimeout(() => {
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
        let decrypted = false;
        if (this.block != undefined && data.byteLength >= cryptHeaderSize) {
            // todo
            // 解密
            /*
            s.block.Decrypt(data, data)
            data = data[nonceSize:]
            checksum := crc32.ChecksumIEEE(data[crcSize:])
            if checksum == binary.LittleEndian.Uint32(data) {
                data = data[crcSize:]
                decrypted = true
            } else {
                atomic.AddUint64(&DefaultSnmp.InCsumErrors, 1)
            }
            */
        } else if (this.block == undefined) {
            decrypted = true;
        }

        if (decrypted && data.byteLength >= IKCP_OVERHEAD) {
            this.kcpInput(data);
        }
    }

    kcpInput(data: Buffer) {
        // todo
        // 收到消息要触发 recv 事件，让外部可以处理

        let kcpInErrors = 0;
        const fecErrs = 0;
        const fecRecovered = 0;
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

                    /*
                    // to notify the readers to receive the data
                    const n = this.kcp.peekSize();
                    if (n > 0) {
                        this.notifyReadEvent();
                    }
                    // to notify the writers
                    const waitsnd = this.kcp.getWaitSnd();
                    if (waitsnd < this.kcp.snd_wnd && waitsnd < this.kcp.rmt_wnd) {
                        this.notifyWriteEvent();
                    }

                    this.uncork();
                    */
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
            /*
            const n = this.kcp.peekSize();
            if (n > 0) {
                this.notifyReadEvent();
            }
            const waitsnd = this.kcp.getWaitSnd();
            if (waitsnd < this.kcp.snd_wnd && waitsnd < this.kcp.rmt_wnd) {
                this.notifyWriteEvent();
            }
            this.uncork();
            */
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
        this.conn.on('message', (msg: Buffer) => {
            this.packetInput(msg);
        });
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
    block: any;
}): UDPSession {
    const { conv, port, host, dataShards, parityShards, listener, conn, ownConn, block } = args;
    const sess = new UDPSession();
    sess.port = port;
    sess.host = host;
    sess.nonce = {};
    sess.conn = conn;
    sess.ownConn = ownConn;
    sess.listener = listener;
    sess.block = block;
    sess.recvbuf = Buffer.alloc(mtuLimit);

    // FEC codec initialization
    sess.fecDecoder = new FecDecoder(dataShards, parityShards);
    if (sess.block) {
        sess.fecEncoder = new FecEncoder(dataShards, parityShards, cryptHeaderSize);
    } else {
        sess.fecEncoder = new FecEncoder(dataShards, parityShards, 0);
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
            sess.output(buff.slice(0, len));
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
    return ListenWithOptions(port, null, 0, 0, callback);
}

// ListenWithOptions listens for incoming KCP packets addressed to the local address laddr on the network "udp" with packet encryption.
//
// 'block' is the block encryption algorithm to encrypt packets.
//
// 'dataShards', 'parityShards' specify how many parity packets will be generated following the data packets.
//
// Check https://github.com/klauspost/reedsolomon for details
export function ListenWithOptions(
    port: number,
    block: any,
    dataShards: number,
    parityShards: number,
    callback: ListenCallback,
): Listener {
    const socket = dgram.createSocket('udp4');
    socket.bind(port);
    socket.on('listening', (err) => {
        if (err) {
            console.error(err);
        }
    });
    return serveConn(block, dataShards, parityShards, socket, true, callback);
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
): Listener {
    const listener = new Listener();
    listener.conn = conn;
    listener.ownConn = ownConn;
    listener.sessions = {};
    listener.dataShards = dataShards;
    listener.parityShards = parityShards;
    listener.block = block;
    listener.callback = callback;
    listener.monitor();
    return listener;
}

// Dial connects to the remote address "raddr" on the network "udp" without encryption and FEC
export function Dial(conv: number, port: number, host: string): any {
    return DialWithOptions(conv, port, host, null, 0, 0);
}

// DialWithOptions connects to the remote address "raddr" on the network "udp" with packet encryption
//
// 'block' is the block encryption algorithm to encrypt packets.
//
// 'dataShards', 'parityShards' specify how many parity packets will be generated following the data packets.
//
// Check https://github.com/klauspost/reedsolomon for details
export function DialWithOptions(
    conv: number,
    port: number,
    host: string,
    block: any,
    dataShards: number,
    parityShards: number,
): UDPSession {
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
