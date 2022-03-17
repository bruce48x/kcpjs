"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewConn = exports.NewConn2 = exports.NewConn3 = exports.DialWithOptions = exports.Dial = exports.ServeConn = exports.ListenWithOptions = exports.Listen = exports.newUDPSession = exports.UDPSession = exports.Listener = void 0;
const common_1 = require("./common");
const fecDecoder_1 = require("./fecDecoder");
const fecEncoder_1 = require("./fecEncoder");
const fecPacket_1 = require("./fecPacket");
const kcp_1 = require("./kcp");
// 16-bytes nonce for each packet
const nonceSize = 16;
// 4-bytes packet checksum
const crcSize = 4;
// overall crypto header size
const cryptHeaderSize = nonceSize + crcSize;
// maximum packet size
const mtuLimit = 1500;
// accept backlog
const acceptBacklog = 128;
class Listener {
    // packet input stage
    packetInput(data, addr) {
        /*
        decrypted := false
        if l.block != nil && len(data) >= cryptHeaderSize {
            l.block.Decrypt(data, data)
            data = data[nonceSize:]
            checksum := crc32.ChecksumIEEE(data[crcSize:])
            if checksum == binary.LittleEndian.Uint32(data) {
                data = data[crcSize:]
                decrypted = true
            } else {
                atomic.AddUint64(&DefaultSnmp.InCsumErrors, 1)
            }
        } else if l.block == nil {
            decrypted = true
        }
    
        if decrypted && len(data) >= IKCP_OVERHEAD {
            l.sessionLock.RLock()
            s, ok := l.sessions[addr.String()]
            l.sessionLock.RUnlock()
    
            var conv, sn uint32
            convRecovered := false
            fecFlag := binary.LittleEndian.Uint16(data[4:])
            if fecFlag == typeData || fecFlag == typeParity { // 16bit kcp cmd [81-84] and frg [0-255] will not overlap with FEC type 0x00f1 0x00f2
                // packet with FEC
                if fecFlag == typeData && len(data) >= fecHeaderSizePlus2+IKCP_OVERHEAD {
                    conv = binary.LittleEndian.Uint32(data[fecHeaderSizePlus2:])
                    sn = binary.LittleEndian.Uint32(data[fecHeaderSizePlus2+IKCP_SN_OFFSET:])
                    convRecovered = true
                }
            } else {
                // packet without FEC
                conv = binary.LittleEndian.Uint32(data)
                sn = binary.LittleEndian.Uint32(data[IKCP_SN_OFFSET:])
                convRecovered = true
            }
    
            if ok { // existing connection
                if !convRecovered || conv == s.kcp.conv { // parity data or valid conversation
                    s.kcpInput(data)
                } else if sn == 0 { // should replace current connection
                    s.Close()
                    s = nil
                }
            }
    
            if s == nil && convRecovered { // new session
                if len(l.chAccepts) < cap(l.chAccepts) { // do not let the new sessions overwhelm accept queue
                    s := newUDPSession(conv, l.dataShards, l.parityShards, l, l.conn, false, addr, l.block)
                    s.kcpInput(data)
                    l.sessionLock.Lock()
                    l.sessions[addr.String()] = s
                    l.sessionLock.Unlock()
                    l.chAccepts <- s
                }
            }
        }
        */
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
        return false;
    }
    // Addr returns the listener's network address, The Addr returned is shared by all invocations of Addr, so do not modify it.
    Addr() {
        //  return this.conn.LocalAddr()
    }
}
exports.Listener = Listener;
class UDPSession {
    read(b) {
        let n = 0;
        while (true) {
            if (this.bufptr.byteLength > 0) {
                // copy from buffer into b
                n = Math.min(this.bufptr.byteLength, b.byteLength);
                this.bufptr.copy(b, 0, 0, n);
                this.bufptr = this.bufptr.slice(n);
                return n;
            }
            const size = this.kcp.peekSize();
            if (size > 0) {
                // peek data size from kcp
                if (b.byteLength >= size) {
                    // receive data into 'b' directly
                    this.kcp.recv(b);
                    return size;
                }
                // if necessary resize the stream buffer to guarantee a sufficient buffer space
                if (this.recvbuf.byteLength < size) {
                    this.recvbuf = Buffer.alloc(size);
                }
                // resize the length of recvbuf to correspond to data size
                this.recvbuf = this.recvbuf.slice(0, size);
                this.kcp.recv(this.recvbuf);
                // copy to 'b'
                n = Math.min(b.byteLength, this.recvbuf.byteLength);
                this.recvbuf.copy(b, 0, 0, n);
                // pointer update
                this.bufptr = this.recvbuf.slice(n);
                return n;
            }
            // deadline for current reading operation
            /*
            var timeout *time.Timer
            var c <-chan time.Time
            if !s.rd.IsZero() {
                if time.Now().After(s.rd) {
                    s.mu.Unlock()
                    return 0, errors.WithStack(errTimeout)
                }
    
                delay := time.Until(s.rd)
                timeout = time.NewTimer(delay)
                c = timeout.C
            }
            s.mu.Unlock()
            */
            // wait for read event or timeout or error
            /*
            select {
            case <-s.chReadEvent:
                if timeout != nil {
                    timeout.Stop()
                }
            case <-c:
                return 0, errors.WithStack(errTimeout)
            case <-s.chSocketReadError:
                return 0, s.socketReadError.Load().(error)
            case <-s.die:
                return 0, errors.WithStack(io.ErrClosedPipe)
            }
            */
        }
    }
    // Write implements net.Conn
    write(b) {
        return this.writeBuffers([b]);
    }
    // WriteBuffers write a vector of byte slices to the underlying connection
    writeBuffers(v) {
        let n = 0;
        while (true) {
            /*
        select {
        case <-s.chSocketWriteError:
            return 0, s.socketWriteError.Load().(error)
        case <-s.die:
            return 0, errors.WithStack(io.ErrClosedPipe)
        default:
        }

        s.mu.Lock()
        */
            // make sure write do not overflow the max sliding window on both side
            let waitsnd = this.kcp.getWaitSnd();
            if (waitsnd < this.kcp.snd_wnd && waitsnd < this.kcp.rmt_wnd) {
                for (let b of v) {
                    n += b.byteLength;
                    while (true) {
                        if (b.byteLength <= this.kcp.mss) {
                            this.kcp.send(b);
                            break;
                        }
                        else {
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
            /*
            var timeout *time.Timer
            var c <-chan time.Time
            if !s.wd.IsZero() {
                if time.Now().After(s.wd) {
                    s.mu.Unlock()
                    return 0, errors.WithStack(errTimeout)
                }
                delay := time.Until(s.wd)
                timeout = time.NewTimer(delay)
                c = timeout.C
            }
            s.mu.Unlock()
            */
            /*
            select {
            case <-s.chWriteEvent:
                if timeout != nil {
                    timeout.Stop()
                }
            case <-c:
                return 0, errors.WithStack(errTimeout)
            case <-s.chSocketWriteError:
                return 0, s.socketWriteError.Load().(error)
            case <-s.die:
                return 0, errors.WithStack(io.ErrClosedPipe)
            }
            */
        }
    }
    // uncork sends data in txqueue if there is any
    uncork() {
        if (this.txqueue.length > 0) {
            this.tx(this.txqueue);
            // recycle
            /*
            for k := range s.txqueue {
                xmitBuf.Put(s.txqueue[k].Buffers[0])
                s.txqueue[k].Buffers = nil
            }
            s.txqueue = s.txqueue[:0]
            */
            this.txqueue = [];
        }
    }
    tx(txqueue) {
        const nbytes = 0;
        const npkts = 0;
        for (let k = 0; k < txqueue.length - 1; k++) {
            // udp send
            // this.conn.WriteTo(txqueue[k].buff, txqueue[k].port, txqueue[k].address)
            // nbytes += txqueue[k].buff.byteLength;
            // npkts++
        }
    }
    // Close closes the connection.
    close() {
        let once = false;
        /*
        s.dieOnce.Do(func() {
            close(s.die)
            once = true
        })
        */
        if (this.die) {
            // close(this.die)
            once = true;
        }
        if (once) {
            // try best to send all queued messages
            this.kcp.flush(false);
            this.uncork();
            // release pending segments
            this.kcp.releaseTX();
            if (this.fecDecoder !== undefined) {
                // this.fecDecoder.release()
            }
            /*
            if s.l != nil { // belongs to listener
                s.l.closeSession(s.remote)
                return nil
            } else if s.ownConn { // client socket close
                return s.conn.Close()
            } else {
                return nil
            }
            */
        }
        else {
            // return errors.WithStack(io.ErrClosedPipe)
        }
    }
    // LocalAddr returns the local network address. The Addr returned is shared by all invocations of LocalAddr, so do not modify it.
    localAddr() {
        // return this.conn.LocalAddr()
        return {};
    }
    // RemoteAddr returns the remote network address. The Addr returned is shared by all invocations of RemoteAddr, so do not modify it.
    remoteAddr() {
        return this.remote;
    }
    // SetDeadline sets the deadline associated with the listener. A zero time value disables the deadline.
    setDeadline(t) {
        this.rd = t;
        this.wd = t;
        this.notifyReadEvent();
        this.notifyWriteEvent();
    }
    // SetReadDeadline implements the Conn SetReadDeadline method.
    setReadDeadline(t) {
        this.rd = t;
        this.notifyReadEvent();
    }
    // SetWriteDeadline implements the Conn SetWriteDeadline method.
    setWriteDeadline(t) {
        this.wd = t;
        this.notifyWriteEvent();
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
        if (mtu > mtuLimit) {
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
    // SetDSCP sets the 6bit DSCP field in IPv4 header, or 8bit Traffic Class in IPv6 header.
    //
    // if the underlying connection has implemented `func SetDSCP(int) error`, SetDSCP() will invoke
    // this function instead.
    //
    // It has no effect if it's accepted from Listener.
    setDSCP(dscp) {
        if (this.l) {
            // return errInvalidOperation
            return;
        }
        // interface enabled
        /*
        if ts, ok := s.conn.(setDSCP); ok {
            return ts.SetDSCP(dscp)
        }
    
        if nc, ok := s.conn.(net.Conn); ok {
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
    // SetReadBuffer sets the socket read buffer, no effect if it's accepted from Listener
    setReadBuffer(bytes) {
        if (!this.l) {
            /*
            if nc, ok := s.conn.(setReadBuffer); ok {
                return nc.SetReadBuffer(bytes)
            }
            */
        }
        // return errInvalidOperation
    }
    // SetWriteBuffer sets the socket write buffer, no effect if it's accepted from Listener
    setWriteBuffer(bytes) {
        if (!this.l) {
            /*
            if nc, ok := s.conn.(setWriteBuffer); ok {
                return nc.SetWriteBuffer(bytes)
            }
            */
        }
        // return errInvalidOperation
    }
    // post-processing for sending a packet from kcp core
    // steps:
    // 1. FEC packet generation
    // 2. CRC32 integrity
    // 3. Encryption
    // 4. TxQueue
    output(buf) {
        // var ecc [][]byte
        const ecc = [];
        const doOutput = () => {
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
            // 4. TxQueue
            /*
            var msg ipv4.Message
            for i := 0; i < s.dup+1; i++ {
                bts := xmitBuf.Get().([]byte)[:len(buf)]
                copy(bts, buf)
                msg.Buffers = [][]byte{bts}
                msg.Addr = s.remote
                s.txqueue = append(s.txqueue, msg)
            }
        
            for k := range ecc {
                bts := xmitBuf.Get().([]byte)[:len(ecc[k])]
                copy(bts, ecc[k])
                msg.Buffers = [][]byte{bts}
                msg.Addr = s.remote
                s.txqueue = append(s.txqueue, msg)
            }
            */
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
                    doOutput();
                }
            });
        }
        else {
            doOutput();
        }
    }
    // sess update to trigger protocol
    update() {
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
    notifyReadEvent() {
        // todo
        /*
        select {
        case s.chReadEvent <- struct{}{}:
        default:
        }
        */
    }
    notifyWriteEvent() {
        // todo
        /*
        select {
        case s.chWriteEvent <- struct{}{}:
        default:
        }
        */
    }
    notifyReadError(err) {
        // todo
        /*
        s.socketReadErrorOnce.Do(func() {
            s.socketReadError.Store(err)
            close(s.chSocketReadError)
        })
        */
    }
    notifyWriteError(err) {
        /*
       s.socketWriteErrorOnce.Do(func() {
           s.socketWriteError.Store(err)
           close(s.chSocketWriteError)
       })
       */
    }
    // packet input stage
    packetInput(data) {
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
        }
        else if (this.block == undefined) {
            decrypted = true;
        }
        if (decrypted && data.byteLength >= kcp_1.IKCP_OVERHEAD) {
            this.kcpInput(data);
        }
    }
    kcpInput(data) {
        // var kcpInErrors, fecErrs, fecRecovered, fecParityShards uint64
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
                    const { data, parity } = result;
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
            /*
            if ret := s.kcp.Input(data, true, s.ackNoDelay); ret != 0 {
                kcpInErrors++
            }
            if n := s.kcp.PeekSize(); n > 0 {
                s.notifyReadEvent()
            }
            waitsnd := s.kcp.WaitSnd()
            if waitsnd < int(s.kcp.snd_wnd) && waitsnd < int(s.kcp.rmt_wnd) {
                s.notifyWriteEvent()
            }
            s.uncork()
            */
        }
        /*
        atomic.AddUint64(&DefaultSnmp.InPkts, 1)
        atomic.AddUint64(&DefaultSnmp.InBytes, uint64(len(data)))
        if fecParityShards > 0 {
            atomic.AddUint64(&DefaultSnmp.FECParityShards, fecParityShards)
        }
        if kcpInErrors > 0 {
            atomic.AddUint64(&DefaultSnmp.KCPInErrors, kcpInErrors)
        }
        if fecErrs > 0 {
            atomic.AddUint64(&DefaultSnmp.FECErrs, fecErrs)
        }
        if fecRecovered > 0 {
            atomic.AddUint64(&DefaultSnmp.FECRecovered, fecRecovered)
        }
        */
    }
}
exports.UDPSession = UDPSession;
// newUDPSession create a new udp session for client or server
function newUDPSession(conv, dataShards, parityShards, l, conn, ownConn, remote, block) {
    const sess = new UDPSession();
    sess.die = [];
    sess.nonce = {};
    sess.nonce.Init();
    sess.chReadEvent = [];
    sess.chWriteEvent = [];
    sess.chSocketReadError = [];
    sess.chSocketWriteError = [];
    sess.remote = remote;
    sess.conn = conn;
    sess.ownConn = ownConn;
    sess.l = l;
    sess.block = block;
    sess.recvbuf = Buffer.alloc(mtuLimit);
    // cast to writebatch conn
    /*
    if _, ok := conn.(*net.UDPConn); ok {
        addr, err := net.ResolveUDPAddr("udp", conn.LocalAddr().String())
        if err == nil {
            if addr.IP.To4() != nil {
                sess.xconn = ipv4.NewPacketConn(conn)
            } else {
                sess.xconn = ipv6.NewPacketConn(conn)
            }
        }
    }
    */
    // FEC codec initialization
    sess.fecDecoder = new fecDecoder_1.FecDecoder(dataShards, parityShards);
    if (sess.block) {
        sess.fecEncoder = new fecEncoder_1.FecEncoder(dataShards, parityShards, cryptHeaderSize);
    }
    else {
        sess.fecEncoder = new fecEncoder_1.FecEncoder(dataShards, parityShards, 0);
    }
    // calculate additional header size introduced by FEC and encryption
    if (sess.block) {
        sess.headerSize += cryptHeaderSize;
    }
    if (sess.fecEncoder) {
        sess.headerSize += common_1.fecHeaderSizePlus2;
    }
    sess.kcp = new kcp_1.Kcp(conv, sess);
    sess.kcp.setReserveBytes(sess.headerSize);
    if (!sess.l) {
        // it's a client connection
        // go sess.readLoop()
        // todo
        // 执行一个异步的 readLoop()
    }
    // start per-session updater
    //SystemTimedSched.Put(sess.update, time.Now())
    // todo
    // 定时调用 sess.update()
    /*
    currestab := atomic.AddUint64(&DefaultSnmp.CurrEstab, 1)
    maxconn := atomic.LoadUint64(&DefaultSnmp.MaxConn)
    if currestab > maxconn {
        atomic.CompareAndSwapUint64(&DefaultSnmp.MaxConn, maxconn, currestab)
    }
    */
    return sess;
}
exports.newUDPSession = newUDPSession;
// Listen listens for incoming KCP packets addressed to the local address laddr on the network "udp",
function Listen(laddr) {
    return ListenWithOptions(laddr, null, 0, 0);
}
exports.Listen = Listen;
// ListenWithOptions listens for incoming KCP packets addressed to the local address laddr on the network "udp" with packet encryption.
//
// 'block' is the block encryption algorithm to encrypt packets.
//
// 'dataShards', 'parityShards' specify how many parity packets will be generated following the data packets.
//
// Check https://github.com/klauspost/reedsolomon for details
function ListenWithOptions(laddr, block, dataShards, parityShards) {
    /*
    udpaddr, err := net.ResolveUDPAddr("udp", laddr)
    if err != nil {
        return nil, errors.WithStack(err)
    }
    conn, err := net.ListenUDP("udp", udpaddr)
    if err != nil {
        return nil, errors.WithStack(err)
    }

    return serveConn(block, dataShards, parityShards, conn, true)
    */
    return undefined;
}
exports.ListenWithOptions = ListenWithOptions;
// ServeConn serves KCP protocol for a single packet connection.
function ServeConn(block, dataShards, parityShards, conn) {
    // return serveConn(block, dataShards, parityShards, conn, false)
    return undefined;
}
exports.ServeConn = ServeConn;
function serveConn(block, dataShards, parityShards, conn, ownConn) {
    /*
    l:= new (Listener)
    l.conn = conn
    l.ownConn = ownConn
    l.sessions = make(map[string] * UDPSession)
    l.chAccepts = make(chan * UDPSession, acceptBacklog)
    l.chSessionClosed = make(chan net.Addr)
    l.die = make(chan struct{})
    l.dataShards = dataShards
    l.parityShards = parityShards
    l.block = block
    l.chSocketReadError = make(chan struct{})
    go l.monitor()
    return l, nil
    */
    return undefined;
}
// Dial connects to the remote address "raddr" on the network "udp" without encryption and FEC
function Dial(raddr) {
    return DialWithOptions(raddr, null, 0, 0);
}
exports.Dial = Dial;
// DialWithOptions connects to the remote address "raddr" on the network "udp" with packet encryption
//
// 'block' is the block encryption algorithm to encrypt packets.
//
// 'dataShards', 'parityShards' specify how many parity packets will be generated following the data packets.
//
// Check https://github.com/klauspost/reedsolomon for details
function DialWithOptions(raddr, block, dataShards, parityShards) {
    /*
    // network type detection
    udpaddr, err := net.ResolveUDPAddr("udp", raddr)
    if err != nil {
        return nil, errors.WithStack(err)
    }
    network:= "udp4"
    if udpaddr.IP.To4() == nil {
        network = "udp"
    }

    conn, err := net.ListenUDP(network, nil)
    if err != nil {
        return nil, errors.WithStack(err)
    }

    var convid uint32
    binary.Read(rand.Reader, binary.LittleEndian, & convid)
    return newUDPSession(convid, dataShards, parityShards, nil, conn, true, udpaddr, block), nil
    */
    return;
}
exports.DialWithOptions = DialWithOptions;
// NewConn3 establishes a session and talks KCP protocol over a packet connection.
function NewConn3(convid, raddr, block, dataShards, parityShards, conn) {
    // return newUDPSession(convid, dataShards, parityShards, nil, conn, false, raddr, block), nil
    return;
}
exports.NewConn3 = NewConn3;
// NewConn2 establishes a session and talks KCP protocol over a packet connection.
function NewConn2(raddr, block, dataShards, parityShards, conn) {
    /*
    var convid uint32
    binary.Read(rand.Reader, binary.LittleEndian, & convid)
    return NewConn3(convid, raddr, block, dataShards, parityShards, conn)
    */
    return;
}
exports.NewConn2 = NewConn2;
// NewConn establishes a session and talks KCP protocol over a packet connection.
function NewConn(raddr, block, dataShards, parityShards, conn) {
    /*
    udpaddr, err := net.ResolveUDPAddr("udp", raddr)
    if err != nil {
        return nil, errors.WithStack(err)
    }
    return NewConn2(udpaddr, block, dataShards, parityShards, conn)
    */
    return;
}
exports.NewConn = NewConn;
