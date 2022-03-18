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
function addrToString(rinfo) {
    return `${rinfo.address}:${rinfo.port}`;
}
class Listener {
    // packet input stage
    packetInput(data, rinfo) {
        let decrypted = false;
        if (this.block && data.byteLength >= common_1.cryptHeaderSize) {
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
        }
        else if (!this.block) {
            decrypted = true;
        }
        const addr = addrToString(rinfo);
        if (decrypted && data.byteLength >= kcp_1.IKCP_OVERHEAD) {
            let sess = this.sessions[addr];
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
                sess.kcpInput(data);
                this.sessions[addr] = sess;
                this.callback(sess);
                // this.chAccepts.push(sess)
            }
        }
    }
    notifyReadError(err) {
        /*
        l.socketReadErrorOnce.Do(func() {
            l.socketReadError.Store(err)
            close(l.chSocketReadError)
    
            // propagate read error to all sessions
            l.sessionLock.RLock()
            for _, s := range l.sessions {
                s.notifyReadError(err)
            }
            l.sessionLock.RUnlock()
        })
        */
    }
    // SetReadBuffer sets the socket read buffer for the Listener
    SetReadBuffer(bytes) {
        /*
        if nc, ok := l.conn.(setReadBuffer); ok {
            return nc.SetReadBuffer(bytes)
        }
        return errInvalidOperation
        */
    }
    // SetWriteBuffer sets the socket write buffer for the Listener
    SetWriteBuffer(bytes) {
        /*
       if nc, ok := l.conn.(setWriteBuffer); ok {
           return nc.SetWriteBuffer(bytes)
       }
       return errInvalidOperation
       */
    }
    // SetDSCP sets the 6bit DSCP field in IPv4 header, or 8bit Traffic Class in IPv6 header.
    //
    // if the underlying connection has implemented `func SetDSCP(int) error`, SetDSCP() will invoke
    // this function instead.
    SetDSCP(dscp) {
        /*
       // interface enabled
       if ts, ok := l.conn.(setDSCP); ok {
           return ts.SetDSCP(dscp)
       }
   
       if nc, ok := l.conn.(net.Conn); ok {
           var succeed bool
           if err := ipv4.NewConn(nc).SetTOS(dscp << 2); err == nil {
               succeed = true
           }
           if err := ipv6.NewConn(nc).SetTrafficClass(dscp); err == nil {
               succeed = true
           }
   
           if succeed {
               return nil
           }
       }
       return errInvalidOperation
       */
    }
    // Accept implements the Accept method in the Listener interface; it waits for the next call and returns a generic Conn.
    Accept() {
        return this.AcceptKCP();
    }
    // AcceptKCP accepts a KCP connection
    AcceptKCP() {
        /*
       var timeout <-chan time.Time
       if tdeadline, ok := l.rd.Load().(time.Time); ok && !tdeadline.IsZero() {
           timeout = time.After(time.Until(tdeadline))
       }
   
       select {
       case <-timeout:
           return nil, errors.WithStack(errTimeout)
       case c := <-l.chAccepts:
           return c, nil
       case <-l.chSocketReadError:
           return nil, l.socketReadError.Load().(error)
       case <-l.die:
           return nil, errors.WithStack(io.ErrClosedPipe)
       }
       */
        return undefined;
    }
    // SetDeadline sets the deadline associated with the listener. A zero time value disables the deadline.
    SetDeadline(t) {
        /*
       l.SetReadDeadline(t)
       l.SetWriteDeadline(t)
       return nil
       */
        this.SetReadDeadline(t);
        this.SetWriteDeadline(t);
    }
    // SetReadDeadline implements the Conn SetReadDeadline method.
    SetReadDeadline(t) {
        /*
       l.rd.Store(t)
       return nil
       */
    }
    // SetWriteDeadline implements the Conn SetWriteDeadline method.
    SetWriteDeadline(t) {
        //  return errInvalidOperation
    }
    // Close stops listening on the UDP address, and closes the socket
    Close() {
        /*
       var once bool
       l.dieOnce.Do(func() {
           close(l.die)
           once = true
       })
   
       var err error
       if once {
           if l.ownConn {
               err = l.conn.Close()
           }
       } else {
           err = errors.WithStack(io.ErrClosedPipe)
       }
       return err
       */
        this.conn.close();
    }
    // closeSession notify the listener that a session has closed
    closeSession(remote) {
        /*
        l.sessionLock.Lock()
        defer l.sessionLock.Unlock()
        if _, ok := l.sessions[remote.String()]; ok {
            delete(l.sessions, remote.String())
            return true
        }
        */
        if (this.sessions[remote]) {
            delete this.sessions[remote];
            return true;
        }
        return false;
    }
    // Addr returns the listener's network address, The Addr returned is shared by all invocations of Addr, so do not modify it.
    Addr() {
        //  return this.conn.LocalAddr()
        return this.conn.address;
    }
    monitor() {
        this.conn.on('message', (msg, rinfo) => {
            this.packetInput(msg, rinfo);
        });
    }
}
exports.Listener = Listener;
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
        // remote: any; // net.Addr  // remote peer address
        this.port = 0;
        this.headerSize = 0; // the header size additional to a KCP frame
        this.ackNoDelay = false; // send ack immediately for each incoming packet(testing purpose)
        this.writeDelay = false; // delay kcp.flush() for Write() for bulk transfer
        this.dup = 0; // duplicate udp packets(testing purpose)
    }
    read() {
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
    write(b) {
        return this.writeBuffers([b]);
    }
    // WriteBuffers write a vector of byte slices to the underlying connection
    writeBuffers(v) {
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
            // console.log('sess.write(), will kcp.send()', b);
            this.kcp.send(b);
        }
        this.kcp.update();
        // this.kcp.flush(false);
        // this.uncork();
        return n;
    }
    uncork() {
        // todo
        // 无用，删掉
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
    localAddr() {
        // return this.conn.LocalAddr()
        return {};
    }
    // RemoteAddr returns the remote network address. The Addr returned is shared by all invocations of RemoteAddr, so do not modify it.
    remoteAddr() {
        return `${this.host}:${this.port}`;
    }
    // SetWriteDelay delays write for bulk transfer until the next update interval
    setWriteDelay(delay) {
        this.writeDelay = delay;
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
    // (deprecated)
    //
    // SetDUP duplicates udp packets for kcp output.
    setDUP(dup) {
        this.dup = dup;
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
    // 4. TxQueue
    output(buf) {
        // console.log('session.output', buf);
        const doOutput = (buff) => {
            // 2&3. crc32 & encryption
            if (this.block) {
                this.nonce.Fill(buf.slice(0, common_1.nonceSize));
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
    // sess update to trigger protocol
    update() {
        /*
        while (true) {
            const interval = this.kcp.flush(false);
            const waitsnd = this.kcp.getWaitSnd();
            if (waitsnd < this.kcp.snd_wnd && waitsnd < this.kcp.rmt_wnd) {
                this.notifyWriteEvent();
            }
            this.uncork();
            // self-synchronized timed scheduling
            // todo
            // SystemTimedSched.Put(s.update, time.Now().Add(time.Duration(interval)*time.Millisecond))
        }
        */
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
        let decrypted = false;
        if (this.block != undefined && data.byteLength >= common_1.cryptHeaderSize) {
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
        }
        else if (this.block == undefined) {
            decrypted = true;
        }
        if (decrypted && data.byteLength >= kcp_1.IKCP_OVERHEAD) {
            this.kcpInput(data);
        }
    }
    kcpInput(data) {
        // todo
        // 收到消息要触发 recv 事件，让外部可以处理
        let kcpInErrors = 0;
        const fecErrs = 0;
        const fecRecovered = 0;
        let fecParityShards = 0;
        // fecFlag := binary.LittleEndian.Uint16(data[4:])
        const fecFlag = data.readUInt16LE(4);
        if (fecFlag == common_1.typeData || fecFlag == common_1.typeParity) {
            // 16bit kcp cmd [81-84] and frg [0-255] will not overlap with FEC type 0x00f1 0x00f2
            if (data.byteLength >= common_1.fecHeaderSizePlus2) {
                // f := fecPacket(data)
                const f = new fecPacket_1.FecPacket(data);
                if (f.flag() == common_1.typeParity) {
                    fecParityShards++;
                }
                // if fecDecoder is not initialized, create one with default parameter
                if (!this.fecDecoder) {
                    this.fecDecoder = new fecDecoder_1.FecDecoder(1, 1);
                }
                this.fecDecoder.decode(f, (err, result) => {
                    if (err) {
                        return;
                    }
                    const { data = [], parity = [] } = result;
                    const buffs = [...data, ...parity];
                    for (const buff of buffs) {
                        const len = buff.readUInt16LE();
                        const pkt = new fecPacket_1.FecPacket(buff);
                        if (pkt.flag() === common_1.typeData) {
                            const ret = this.kcp.input(buff.slice(2, 2 + len), true, this.ackNoDelay);
                            if (ret != 0) {
                                kcpInErrors++;
                            }
                        }
                        else if (pkt.flag() === common_1.typeParity) {
                            const ret = this.kcp.input(buff.slice(2, 2 + len), false, this.ackNoDelay);
                            if (ret != 0) {
                                kcpInErrors++;
                            }
                        }
                    }
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
                });
            }
            else {
                // atomic.AddUint64(&DefaultSnmp.InErrs, 1)
            }
        }
        else {
            this.kcp.input(data, true, this.ackNoDelay);
            const n = this.kcp.peekSize();
            if (n > 0) {
                this.notifyReadEvent();
            }
            const waitsnd = this.kcp.getWaitSnd();
            if (waitsnd < this.kcp.snd_wnd && waitsnd < this.kcp.rmt_wnd) {
                this.notifyWriteEvent();
            }
            this.uncork();
        }
    }
    notifyReadEvent() {
        // todo
        // 没用
    }
    notifyWriteEvent() {
        // todo
        // 没用
    }
    readLoop() {
        this.conn.on('message', (msg, rinfo) => {
            this.packetInput(msg);
        });
    }
}
exports.UDPSession = UDPSession;
// newUDPSession create a new udp session for client or server
function newUDPSession(args) {
    const { conv, port, host, dataShards, parityShards, listener, conn, ownConn, block } = args;
    const sess = new UDPSession();
    sess.port = port;
    sess.host = host;
    sess.nonce = {};
    sess.conn = conn;
    sess.ownConn = ownConn;
    sess.listener = listener;
    sess.block = block;
    sess.recvbuf = Buffer.alloc(common_1.mtuLimit);
    // FEC codec initialization
    sess.fecDecoder = new fecDecoder_1.FecDecoder(dataShards, parityShards);
    if (sess.block) {
        sess.fecEncoder = new fecEncoder_1.FecEncoder(dataShards, parityShards, common_1.cryptHeaderSize);
    }
    else {
        sess.fecEncoder = new fecEncoder_1.FecEncoder(dataShards, parityShards, 0);
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
// Listen listens for incoming KCP packets addressed to the local address laddr on the network "udp",
function Listen(port, callback) {
    return ListenWithOptions(port, null, 0, 0, callback);
}
exports.Listen = Listen;
// ListenWithOptions listens for incoming KCP packets addressed to the local address laddr on the network "udp" with packet encryption.
//
// 'block' is the block encryption algorithm to encrypt packets.
//
// 'dataShards', 'parityShards' specify how many parity packets will be generated following the data packets.
//
// Check https://github.com/klauspost/reedsolomon for details
function ListenWithOptions(port, block, dataShards, parityShards, callback) {
    const socket = dgram.createSocket('udp4');
    socket.bind(port);
    socket.on('listening', () => {
        console.log('listening', port);
    });
    return serveConn(block, dataShards, parityShards, socket, true, callback);
}
exports.ListenWithOptions = ListenWithOptions;
// ServeConn serves KCP protocol for a single packet connection.
function ServeConn(block, dataShards, parityShards, conn, callback) {
    return serveConn(block, dataShards, parityShards, conn, false, callback);
}
exports.ServeConn = ServeConn;
function serveConn(block, dataShards, parityShards, conn, ownConn, callback) {
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
function Dial(conv, port, host) {
    return DialWithOptions(conv, port, host, null, 0, 0);
}
exports.Dial = Dial;
// DialWithOptions connects to the remote address "raddr" on the network "udp" with packet encryption
//
// 'block' is the block encryption algorithm to encrypt packets.
//
// 'dataShards', 'parityShards' specify how many parity packets will be generated following the data packets.
//
// Check https://github.com/klauspost/reedsolomon for details
function DialWithOptions(conv, port, host, block, dataShards, parityShards) {
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
