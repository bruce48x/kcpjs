"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DialWithOptions = exports.Dial = exports.ServeConn = exports.ListenWithOptions = exports.Listen = exports.UDPSession = exports.Listener = void 0;
const dgram = require("dgram");
const EventEmitter = require("events");
const common_1 = require("./common");
const fecDecoder_1 = require("./fecDecoder");
const fecEncoder_1 = require("./fecEncoder");
const fecPacket_1 = require("./fecPacket");
const kcp_1 = require("./kcp");
const crypto = require("crypto");
const crc32 = require("crc-32");
function addrToString(arg1, arg2) {
    if (typeof arg1 === 'string') {
        return `${arg1}:${arg2}`;
    }
    else {
        return `${arg1.address}:${arg1.port}`;
    }
}
class Listener {
    // packet input stage
    packetInput(data, rinfo) {
        if (this.closed) {
            return;
        }
        let decrypted = false;
        if (this.block && data.byteLength >= common_1.cryptHeaderSize) {
            try {
                data = this.block.decrypt(data);
                const checksum = crc32.buf(data.slice(common_1.cryptHeaderSize)) >>> 0;
                if (checksum === data.readUInt32LE(common_1.nonceSize)) {
                    data = data.slice(common_1.cryptHeaderSize);
                    decrypted = true;
                }
                else {
                    // do nothing
                    // crc32 检测未通过
                }
            }
            catch (err) {
                return;
            }
        }
        else if (!this.block) {
            decrypted = true;
        }
        const key = addrToString(rinfo);
        if (decrypted && data.byteLength >= kcp_1.IKCP_OVERHEAD) {
            let sess = this.sessions[key];
            let conv = 0;
            let sn = 0;
            let convRecovered = false;
            const fecFlag = data.readUInt16LE(4);
            if (fecFlag == common_1.typeData || fecFlag == common_1.typeParity) {
                // 16bit kcp cmd [81-84] and frg [0-255] will not overlap with FEC type 0x00f1 0x00f2
                // packet with FEC
                if (fecFlag == common_1.typeData && data.byteLength >= common_1.fecHeaderSizePlus2 + kcp_1.IKCP_OVERHEAD) {
                    conv = data.readUInt32LE(common_1.fecHeaderSizePlus2);
                    sn = data.readUInt32LE(common_1.fecHeaderSizePlus2 + kcp_1.IKCP_SN_OFFSET);
                    convRecovered = true;
                }
            }
            else {
                // packet without FEC
                conv = data.readUInt32LE();
                sn = data.readUInt32LE(kcp_1.IKCP_SN_OFFSET);
                convRecovered = true;
            }
            if (sess) {
                // existing connection
                if (!convRecovered || conv == sess.kcp.conv) {
                    // parity data or valid conversation
                    sess.kcpInput(data);
                }
                else if (sn == 0) {
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
    close() {
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
    closeSession(key) {
        if (this.sessions[key]) {
            delete this.sessions[key];
            this.sessionCount = Math.max(0, this.sessionCount - 1);
            return true;
        }
        return false;
    }
    monitor() {
        this.messageHandler = (msg, rinfo) => {
            this.packetInput(msg, rinfo);
        };
        this.conn.on('message', this.messageHandler);
    }
}
exports.Listener = Listener;
const defaultWriteBufferLimit = 1024;
const defaultOutputBufferPoolLimit = 64;
class UDPSession extends EventEmitter {
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
        this.outputBufferPool = [];
        this.outputBufferPoolLimit = defaultOutputBufferPoolLimit;
    }
    // Write implements net.Conn
    write(b) {
        return this.writeBuffers([b]);
    }
    // WriteBuffers write a vector of byte slices to the underlying connection
    writeBuffers(v) {
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
        this.outputBufferPool = [];
        if (this.listener) {
            this.listener.closeSession(this.key);
        }
        else if (this.ownConn) {
            this.conn.close();
        }
        this.removeAllListeners();
    }
    // SetWriteDelay delays write for bulk transfer until the next update interval
    setWriteDelay(delay) {
        this.writeDelay = delay;
    }
    setWriteBufferLimit(maxSegments) {
        this.maxSendQueueSize = Math.max(1, Math.floor(maxSegments));
    }
    // SetWindowSize set maximum window size
    setWindowSize(sndwnd, rcvwnd) {
        this.kcp.setWndSize(sndwnd, rcvwnd);
    }
    // SetMtu sets the maximum transmission unit(not including UDP header)
    setMtu(mtu) {
        if (mtu > common_1.mtuLimit) {
            return false;
        }
        this.kcp.setMtu(mtu);
        return true;
    }
    // SetStreamMode toggles the stream mode on/off
    setStreamMode(enable) {
        if (enable) {
            this.kcp.stream = 1;
        }
        else {
            this.kcp.stream = 0;
        }
    }
    // SetACKNoDelay changes ack flush option, set true to flush ack immediately,
    setACKNoDelay(nodelay) {
        this.ackNoDelay = nodelay;
    }
    // SetNoDelay calls nodelay() of kcp
    // https://github.com/skywind3000/kcp/blob/master/README.en.md#protocol-configuration
    setNoDelay(nodelay, interval, resend, nc) {
        this.kcp.setNoDelay(nodelay, interval, resend, nc);
    }
    // post-processing for sending a packet from kcp core
    // steps:
    // 1. FEC packet generation
    // 2. CRC32 integrity
    // 3. Encryption
    output(buf, release) {
        if (this.closed) {
            if (release) {
                release();
            }
            return;
        }
        const doOutput = (buff, releaseOutput) => {
            if (this.closed) {
                if (releaseOutput) {
                    releaseOutput();
                }
                return;
            }
            try {
                // 2&3. crc32 & encryption
                if (this.block) {
                    crypto.randomFillSync(buff, 0, common_1.nonceSize);
                    const checksum = crc32.buf(buff.slice(common_1.cryptHeaderSize)) >>> 0;
                    buff.writeUInt32LE(checksum, common_1.nonceSize);
                    buff = this.block.encrypt(buff);
                }
                this.conn.send(buff, this.port, this.host, () => {
                    if (releaseOutput) {
                        releaseOutput();
                    }
                });
            }
            catch (err) {
                if (releaseOutput) {
                    releaseOutput();
                }
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
                const dataArr = [];
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
        }
        else {
            doOutput(buf, release);
        }
    }
    acquireOutputBuffer(size) {
        for (let i = this.outputBufferPool.length - 1; i >= 0; i--) {
            const buff = this.outputBufferPool[i];
            if (buff.byteLength === size) {
                this.outputBufferPool.splice(i, 1);
                return buff;
            }
        }
        return Buffer.allocUnsafe(size);
    }
    releaseOutputBuffer(buff) {
        if (this.closed || this.outputBufferPool.length >= this.outputBufferPoolLimit) {
            return;
        }
        this.outputBufferPool.push(buff);
    }
    copyKcpOutputBuffer(buff, len) {
        const output = this.acquireOutputBuffer(len);
        buff.copy(output, 0, 0, len);
        return output;
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
    getConv() {
        return this.kcp.conv;
    }
    // GetRTO gets current rto of the session
    getRTO() {
        return this.kcp.rx_rto;
    }
    // GetSRTT gets current srtt of the session
    getSRTT() {
        return this.kcp.rx_srtt;
    }
    // GetRTTVar gets current rtt variance of the session
    getSRTTVar() {
        return this.kcp.rx_rttvar;
    }
    // packet input stage
    packetInput(data) {
        if (this.closed || !this.kcp) {
            return;
        }
        let decrypted = false;
        if (this.block && data.byteLength >= common_1.cryptHeaderSize) {
            try {
                // 解密
                data = this.block.decrypt(data);
                const checksum = crc32.buf(data.slice(common_1.cryptHeaderSize)) >>> 0;
                if (checksum === data.readUInt32LE(common_1.nonceSize)) {
                    data = data.slice(common_1.cryptHeaderSize);
                    decrypted = true;
                }
                else {
                    // do nothing
                    // crc32 检测未通过
                }
            }
            catch (err) {
                return;
            }
        }
        else if (this.block == undefined) {
            decrypted = true;
        }
        if (decrypted && data.byteLength >= kcp_1.IKCP_OVERHEAD) {
            this.kcpInput(data);
        }
    }
    kcpInput(data) {
        if (this.closed || !this.kcp) {
            return;
        }
        let kcpInErrors = 0;
        let fecParityShards = 0;
        const fpkt = new fecPacket_1.FecPacket(data);
        const fecFlag = fpkt.flag();
        if (fecFlag == common_1.typeData || fecFlag == common_1.typeParity) {
            // 16bit kcp cmd [81-84] and frg [0-255] will not overlap with FEC type 0x00f1 0x00f2
            if (data.byteLength >= common_1.fecHeaderSizePlus2) {
                if (fecFlag == common_1.typeParity) {
                    fecParityShards++;
                }
                // if fecDecoder is not initialized, create one with default parameter
                if (!this.fecDecoder) {
                    this.fecDecoder = new fecDecoder_1.FecDecoder(1, 1);
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
                    this.emitPendingKcpMessage();
                });
            }
        }
        else {
            this.kcp.input(data, true, this.ackNoDelay);
            this.emitPendingKcpMessage();
        }
    }
    emitPendingKcpMessage() {
        const size = this.kcp.peekSize();
        if (size <= 0) {
            return;
        }
        if (this.recvbuf.byteLength < size) {
            this.recvbuf = Buffer.alloc(size);
        }
        const len = this.kcp.recv(this.recvbuf);
        if (len > 0) {
            this.emit('recv', Buffer.from(this.recvbuf.subarray(0, len)));
        }
    }
    readLoop() {
        this.messageHandler = (msg) => {
            this.packetInput(msg);
        };
        this.conn.on('message', this.messageHandler);
    }
}
exports.UDPSession = UDPSession;
// newUDPSession create a new udp session for client or server
function newUDPSession(args) {
    const { conv, port, host, dataShards, parityShards, listener, conn, ownConn, block } = args;
    const sess = new UDPSession();
    sess.port = port;
    sess.host = host;
    sess.conn = conn;
    sess.ownConn = ownConn;
    sess.listener = listener;
    sess.block = block;
    sess.recvbuf = Buffer.alloc(common_1.mtuLimit);
    // FEC codec initialization
    if (dataShards && parityShards) {
        sess.fecDecoder = new fecDecoder_1.FecDecoder(dataShards, parityShards);
        if (sess.block) {
            sess.fecEncoder = new fecEncoder_1.FecEncoder(dataShards, parityShards, common_1.cryptHeaderSize);
        }
        else {
            sess.fecEncoder = new fecEncoder_1.FecEncoder(dataShards, parityShards, 0);
        }
    }
    // calculate additional header size introduced by FEC and encryption
    if (sess.block) {
        sess.headerSize += common_1.cryptHeaderSize;
    }
    if (sess.fecEncoder) {
        sess.headerSize += common_1.fecHeaderSizePlus2;
    }
    sess.kcp = new kcp_1.Kcp(conv, sess);
    sess.kcp.setReserveBytes(sess.headerSize);
    sess.kcp.setOutput((buff, len) => {
        if (len >= kcp_1.IKCP_OVERHEAD + sess.headerSize) {
            if (sess.fecEncoder) {
                sess.output(Buffer.from(buff.subarray(0, len)));
            }
            else {
                const output = sess.copyKcpOutputBuffer(buff, len);
                sess.output(output, () => sess.releaseOutputBuffer(output));
            }
        }
    });
    if (!sess.listener) {
        // it's a client connection
        sess.readLoop();
    }
    sess.check();
    return sess;
}
// Listen listens for incoming KCP packets addressed to the local address laddr on the network "udp",
function Listen(port, callback) {
    return ListenWithOptions({ port, callback });
}
exports.Listen = Listen;
// ListenWithOptions listens for incoming KCP packets addressed to the local address laddr on the network "udp" with packet encryption.
//
// 'block' is the block encryption algorithm to encrypt packets.
//
// 'dataShards', 'parityShards' specify how many parity packets will be generated following the data packets.
//
// Check https://github.com/klauspost/reedsolomon for details
function ListenWithOptions(opts) {
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
exports.ListenWithOptions = ListenWithOptions;
// ServeConn serves KCP protocol for a single packet connection.
function ServeConn(block, dataShards, parityShards, conn, callback) {
    return serveConn(block, dataShards, parityShards, conn, false, callback);
}
exports.ServeConn = ServeConn;
function serveConn(block, dataShards, parityShards, conn, ownConn, callback, maxSessions = common_1.acceptBacklog) {
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
function Dial(conv, port, host) {
    return DialWithOptions({ conv, port, host });
}
exports.Dial = Dial;
// DialWithOptions connects to the remote address "raddr" on the network "udp" with packet encryption
//
// 'block' is the block encryption algorithm to encrypt packets.
//
// 'dataShards', 'parityShards' specify how many parity packets will be generated following the data packets.
//
// Check https://github.com/klauspost/reedsolomon for details
function DialWithOptions(opts) {
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
exports.DialWithOptions = DialWithOptions;
