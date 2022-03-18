"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Kcp = exports.IKCP_SN_OFFSET = exports.IKCP_PROBE_LIMIT = exports.IKCP_PROBE_INIT = exports.IKCP_THRESH_MIN = exports.IKCP_THRESH_INIT = exports.IKCP_DEADLINK = exports.IKCP_OVERHEAD = exports.IKCP_INTERVAL = exports.IKCP_ACK_FAST = exports.IKCP_MTU_DEF = exports.IKCP_WND_RCV = exports.IKCP_WND_SND = exports.IKCP_ASK_TELL = exports.IKCP_ASK_SEND = exports.IKCP_CMD_WINS = exports.IKCP_CMD_WASK = exports.IKCP_CMD_ACK = exports.IKCP_CMD_PUSH = exports.IKCP_RTO_MAX = exports.IKCP_RTO_DEF = exports.IKCP_RTO_MIN = exports.IKCP_RTO_NDL = void 0;
exports.IKCP_RTO_NDL = 30; // no delay min rto
exports.IKCP_RTO_MIN = 100; // normal min rto
exports.IKCP_RTO_DEF = 200;
exports.IKCP_RTO_MAX = 60000;
exports.IKCP_CMD_PUSH = 81; // cmd: push data
exports.IKCP_CMD_ACK = 82; // cmd: ack
exports.IKCP_CMD_WASK = 83; // cmd: window probe (ask)
exports.IKCP_CMD_WINS = 84; // cmd: window size (tell)
exports.IKCP_ASK_SEND = 1; // need to send IKCP_CMD_WASK
exports.IKCP_ASK_TELL = 2; // need to send IKCP_CMD_WINS
exports.IKCP_WND_SND = 32;
exports.IKCP_WND_RCV = 32;
exports.IKCP_MTU_DEF = 1400;
exports.IKCP_ACK_FAST = 3;
exports.IKCP_INTERVAL = 100;
exports.IKCP_OVERHEAD = 24;
exports.IKCP_DEADLINK = 20;
exports.IKCP_THRESH_INIT = 2;
exports.IKCP_THRESH_MIN = 2;
exports.IKCP_PROBE_INIT = 7000; // 7 secs to probe window size
exports.IKCP_PROBE_LIMIT = 120000; // up to 120 secs to probe window
exports.IKCP_SN_OFFSET = 12;
const refTime = Date.now();
function currentMs() {
    return Date.now() - refTime;
}
/* encode 8 bits unsigned int */
function ikcp_encode8u(p, c, offset = 0) {
    p.writeUInt8(c, offset);
}
/* decode 8 bits unsigned int */
function ikcp_decode8u(p, offset = 0) {
    return p.readUInt8(offset);
}
/* encode 16 bits unsigned int (lsb) */
function ikcp_encode16u(p, w, offset = 0) {
    p.writeUInt16LE(w, offset);
}
/* decode 16 bits unsigned int (lsb) */
function ikcp_decode16u(p, offset = 0) {
    return p.readUInt16LE(offset);
}
/* encode 32 bits unsigned int (lsb) */
function ikcp_encode32u(p, l, offset = 0) {
    p.writeUInt32LE(l, offset);
}
/* decode 32 bits unsigned int (lsb) */
function ikcp_decode32u(p, offset = 0) {
    return p.readUInt32LE(offset);
}
function _ibound_(lower, middle, upper) {
    return Math.min(Math.max(lower, middle), upper);
}
class Segment {
    constructor(size) {
        this.conv = 0;
        this.cmd = 0;
        this.frg = 0;
        this.wnd = 0;
        this.ts = 0;
        this.sn = 0;
        this.una = 0;
        this.rto = 0;
        this.xmit = 0;
        this.resendts = 0;
        this.fastack = 0;
        this.acked = 0;
        if (size) {
            this.data = Buffer.alloc(size);
        }
    }
    // encode a segment into buffer
    encode(ptr) {
        ikcp_encode32u(ptr, this.conv);
        ikcp_encode8u(ptr, this.cmd, 4);
        ikcp_encode8u(ptr, this.frg, 5);
        ikcp_encode16u(ptr, this.wnd, 6);
        ikcp_encode32u(ptr, this.ts, 8);
        ikcp_encode32u(ptr, this.sn, 12);
        ikcp_encode32u(ptr, this.una, 16);
        const len = this.data?.byteLength || 0;
        ikcp_encode32u(ptr, len, 20);
        return ptr.slice(exports.IKCP_OVERHEAD);
    }
}
class AckItem {
}
class Kcp {
    constructor(conv, user) {
        this.conv = conv;
        this.mtu = exports.IKCP_MTU_DEF;
        this.mss = this.mtu - exports.IKCP_OVERHEAD;
        this.buffer = Buffer.alloc(this.mtu);
        this.state = 0;
        this.snd_una = 0; // 发送出去未得到确认的包的序号
        this.snd_nxt = 0; // 下一个发出去的包的序号
        this.rcv_nxt = 0; // 待接收的下一个包的序号
        this.ts_recent = 0;
        this.ts_lastack = 0;
        this.ssthresh = exports.IKCP_THRESH_INIT;
        this.rx_rttvar = 0;
        this.rx_srtt = 0;
        this.rx_rto = exports.IKCP_RTO_DEF;
        this.rx_minrto = exports.IKCP_RTO_MIN;
        this.snd_wnd = exports.IKCP_WND_SND; // [发送窗口]的大小
        this.rcv_wnd = exports.IKCP_WND_RCV; // [接收窗口]的大小
        this.rmt_wnd = exports.IKCP_WND_RCV; // 远端的[接收窗口]的大小
        this.cwnd = 0;
        this.probe = 0;
        // this.current = 0;
        this.interval = exports.IKCP_INTERVAL;
        this.ts_flush = exports.IKCP_INTERVAL;
        this.xmit = 0;
        this.nodelay = 0;
        this.updated = 0;
        this.ts_probe = 0;
        this.probe_wait = 0;
        this.dead_link = exports.IKCP_DEADLINK;
        this.incr = 0;
        this.snd_queue = [];
        this.rcv_queue = [];
        this.snd_buf = [];
        this.rcv_buf = [];
        this.acklist = []; // ack 列表，收到的 ack 放在这里
        this.ackcount = 0; // ack 的个数
        this.ackblock = 0; // acklist 的大小，这个值 >= ackCount
        this.fastresend = 0; // int
        this.nocwnd = 0; // int
        this.stream = 0; // int
        this.reserved = 0;
        this.user = user;
    }
    _delSegment(seg) {
        if (seg?.data) {
            seg.data = undefined;
        }
    }
    setWndSize(sndwnd, rcvwnd) {
        if (sndwnd > 0) {
            this.snd_wnd = sndwnd;
        }
        if (rcvwnd > 0) {
            this.rcv_wnd = rcvwnd;
        }
        return 0;
    }
    setMtu(mtu) {
        if (mtu < 50 || mtu < exports.IKCP_OVERHEAD) {
            return -1;
        }
        if (this.reserved >= this.mtu - exports.IKCP_OVERHEAD || this.reserved < 0) {
            return -1;
        }
        const buffer = Buffer.alloc(mtu);
        if (!buffer) {
            return -2;
        }
        this.mtu = mtu;
        this.mss = this.mtu - exports.IKCP_OVERHEAD - this.reserved;
        this.buffer = buffer;
        return 0;
    }
    // NoDelay options
    // fastest: ikcp_nodelay(kcp, 1, 20, 2, 1)
    // nodelay: 0:disable(default), 1:enable
    // interval: internal update timer interval in millisec, default is 100ms
    // resend: 0:disable fast resend(default), 1:enable fast resend
    // nc: 0:normal congestion control(default), 1:disable congestion control
    setNoDelay(nodelay, interval, resend, nc) {
        if (nodelay >= 0) {
            this.nodelay = nodelay;
            if (nodelay != 0) {
                this.rx_minrto = exports.IKCP_RTO_NDL;
            }
            else {
                this.rx_minrto = exports.IKCP_RTO_MIN;
            }
        }
        if (interval >= 0) {
            if (interval > 5000) {
                interval = 5000;
            }
            else if (interval < 10) {
                interval = 10;
            }
            this.interval = interval;
        }
        if (resend >= 0) {
            this.fastresend = resend;
        }
        if (nc >= 0) {
            this.nocwnd = nc;
        }
        return 0;
    }
    release() {
        this.snd_buf = undefined;
        this.rcv_buf = undefined;
        this.snd_queue = undefined;
        this.rcv_queue = undefined;
        this.buffer = undefined;
        this.acklist = undefined;
        this.ackcount = 0;
    }
    context() {
        return this.user;
    }
    recv(buffer) {
        const peeksize = this.peekSize();
        if (peeksize < 0) {
            return -1;
        }
        if (peeksize > buffer.byteLength) {
            return -2;
        }
        let fast_recover = false;
        if (this.rcv_queue.length >= this.rcv_wnd) {
            fast_recover = true;
        }
        let n = 0;
        let count = 0;
        for (const seg of this.rcv_queue) {
            seg.data.copy(buffer);
            buffer = buffer.slice(seg.data.byteLength);
            n += seg.data.byteLength;
            count++;
            this._delSegment(seg);
            if (seg.frg === 0) {
                break;
            }
        }
        if (count > 0) {
            this.rcv_queue.splice(0, count);
        }
        // move available data from rcv_buf -> rcv_queue
        count = 0;
        for (const seg of this.rcv_buf) {
            if (seg.sn === this.rcv_nxt && this.rcv_queue.length + count < this.rcv_wnd) {
                this.rcv_nxt++;
                count++;
            }
            else {
                break;
            }
        }
        if (count > 0) {
            const segs = this.rcv_buf.splice(0, count);
            this.rcv_queue.push(...segs);
        }
        // fast recover
        if (this.rcv_queue.length < this.rcv_wnd && fast_recover) {
            this.probe |= exports.IKCP_ASK_TELL;
        }
        return n;
    }
    // Input a packet into kcp state machine.
    //
    // 'regular' indicates it's a real data packet from remote, and it means it's not generated from ReedSolomon
    // codecs.
    //
    // 'ackNoDelay' will trigger immediate ACK, but surely it will not be efficient in bandwidth
    input(data, regular, ackNodelay) {
        const snd_una = this.snd_una;
        if (data.byteLength < exports.IKCP_OVERHEAD) {
            return -1;
        }
        let latest = 0; // uint32 , the latest ack packet
        let flag = 0; // int
        let inSegs = 0; // uint64 统计用
        let windowSlides = false;
        while (true) {
            let ts = 0; // uint32
            let sn = 0; // uint32
            let length = 0; // uint32
            let una = 0; // uint32
            let conv = 0; // uint32
            let wnd = 0; // uint16
            let cmd = 0; // uint3
            let frg = 0; // uint8
            if (data.byteLength < exports.IKCP_OVERHEAD) {
                break;
            }
            conv = ikcp_decode32u(data);
            if (conv !== this.conv) {
                return -1;
            }
            cmd = ikcp_decode8u(data, 4);
            frg = ikcp_decode8u(data, 5);
            wnd = ikcp_decode16u(data, 6);
            ts = ikcp_decode32u(data, 8);
            sn = ikcp_decode32u(data, 12);
            una = ikcp_decode32u(data, 16);
            length = ikcp_decode32u(data, 20);
            data = data.slice(exports.IKCP_OVERHEAD);
            if (data.byteLength < length) {
                return -2;
            }
            if (cmd !== exports.IKCP_CMD_PUSH && cmd !== exports.IKCP_CMD_ACK && cmd !== exports.IKCP_CMD_WASK && cmd !== exports.IKCP_CMD_WINS) {
                return -3;
            }
            // only trust window updates from regular packates. i.e: latest update
            if (regular) {
                this.rmt_wnd = wnd;
            }
            if (this._parse_una(una) > 0) {
                windowSlides = true;
            }
            this._shrink_buf();
            if (cmd === exports.IKCP_CMD_ACK) {
                this._parse_ack(sn);
                this._parse_fastack(sn, ts);
                flag |= 1;
                latest = ts;
            }
            else if (cmd === exports.IKCP_CMD_PUSH) {
                let repeat = true;
                if (sn < this.rcv_nxt + this.rcv_wnd) {
                    this._ack_push(sn, ts);
                    if (sn >= this.rcv_nxt) {
                        const seg = new Segment();
                        seg.conv = conv;
                        seg.cmd = cmd;
                        seg.frg = frg;
                        seg.wnd = wnd;
                        seg.ts = ts;
                        seg.sn = sn;
                        seg.una = una;
                        seg.data = data.slice(0, length); // delayed data copying
                        repeat = this._parse_data(seg);
                    }
                }
                if (regular && repeat) {
                    // do nothing
                    // 统计重复的包
                }
            }
            else if (cmd === exports.IKCP_CMD_WASK) {
                // ready to send back IKCP_CMD_WINS in Ikcp_flush
                // tell remote my window size
                this.probe |= exports.IKCP_ASK_TELL;
            }
            else if (cmd === exports.IKCP_CMD_WINS) {
                // do nothing
            }
            else {
                return -3;
            }
            inSegs++;
            data = data.slice(exports.IKCP_OVERHEAD + length);
        }
        // update rtt with the latest ts
        // ignore the FEC packet
        if (flag !== 0 && regular) {
            const current = currentMs();
            if (current >= latest) {
                this._update_ack(current - latest);
            }
        }
        // cwnd update when packet arrived
        if (this.nocwnd === 0) {
            if (this.snd_una > snd_una) {
                if (this.cwnd < this.rmt_wnd) {
                    const mss = this.mss;
                    if (this.cwnd < this.ssthresh) {
                        this.cwnd++;
                        this.incr += mss;
                    }
                    else {
                        if (this.incr < mss) {
                            this.incr = mss;
                        }
                        this.incr += (mss * mss) / this.incr + mss / 16;
                        if ((this.cwnd + 1) * mss <= this.incr) {
                            if (mss > 0) {
                                this.cwnd = (this.incr + mss - 1) / mss;
                            }
                            else {
                                this.cwnd = this.incr + mss - 1;
                            }
                        }
                    }
                    if (this.cwnd > this.rmt_wnd) {
                        this.cwnd = this.rmt_wnd;
                        this.incr = this.rmt_wnd * mss;
                    }
                }
            }
        }
        if (windowSlides) {
            // if window has slided, flush
            this.flush(false);
        }
        else if (ackNodelay && this.acklist.length > 0) {
            // ack immediately
            this.flush(true);
        }
    }
    _parse_una(una) {
        let count = 0;
        for (const seg of this.snd_buf) {
            if (una > seg.sn) {
                this._delSegment(seg);
                count++;
            }
            else {
                break;
            }
        }
        if (count > 0) {
            this.snd_buf.splice(0, count);
        }
        return count;
    }
    _shrink_buf() {
        if (this.snd_buf.length > 0) {
            const seg = this.snd_buf[0];
            this.snd_una = seg.sn;
        }
        else {
            this.snd_una = this.snd_nxt;
        }
    }
    _parse_ack(sn) {
        if (sn < this.snd_una || sn >= this.snd_nxt) {
            return;
        }
        for (const seg of this.snd_buf) {
            if (sn === seg.sn) {
                // mark and free space, but leave the segment here,
                // and wait until `una` to delete this, then we don't
                // have to shift the segments behind forward,
                // which is an expensive operation for large window
                seg.acked = 1;
                this._delSegment(seg);
                break;
            }
            if (sn < seg.sn) {
                break;
            }
        }
    }
    _parse_fastack(sn, ts) {
        if (sn < this.snd_una || sn >= this.snd_nxt) {
            return;
        }
        for (const seg of this.snd_buf) {
            if (sn < seg.sn) {
                break;
            }
            else if (sn !== seg.sn && seg.ts <= ts) {
                seg.fastack++;
            }
        }
    }
    // returns true if data has repeated
    _parse_data(newseg) {
        const sn = newseg.sn;
        if (sn >= this.rcv_nxt + this.rcv_wnd || sn < this.rcv_nxt) {
            return true;
        }
        let insert_idx = 0;
        let repeat = false;
        if (this.rcv_buf.length > 0) {
            const n = this.rcv_buf.length - 1;
            for (let i = n; i >= 0; i--) {
                const seg = this.rcv_buf[i];
                if (seg.sn === sn) {
                    repeat = true;
                    break;
                }
                if (sn > seg.sn) {
                    insert_idx = i + 1;
                    break;
                }
            }
        }
        if (!repeat) {
            // replicate the content if it's new
            const dataCopy = Buffer.from(newseg.data);
            newseg.data = dataCopy;
            this.rcv_buf.splice(insert_idx, 0, newseg);
        }
        // move available data from rcv_buf -> rcv_queue
        let count = 0;
        for (const seg of this.rcv_buf) {
            if (seg.sn === this.rcv_nxt && this.rcv_queue.length + count < this.rcv_wnd) {
                this.rcv_nxt++;
                count++;
            }
            else {
                break;
            }
        }
        if (count > 0) {
            const segs = this.rcv_buf.splice(0, count);
            this.rcv_queue.push(...segs);
        }
        return repeat;
    }
    _update_ack(rtt) {
        // https://tools.ietf.org/html/rfc6298
        let rto = 0; // uint32
        if (this.rx_srtt === 0) {
            this.rx_srtt = rtt;
            this.rx_rttvar = rtt >> 1;
        }
        else {
            let delta = rtt - this.rx_srtt;
            this.rx_srtt += delta >> 3;
            if (delta < 0) {
                delta = -delta;
            }
            if (rtt < this.rx_srtt - this.rx_rttvar) {
                // if the new RTT sample is below the bottom of the range of
                // what an RTT measurement is expected to be.
                // give an 8x reduced weight versus its normal weighting
                this.rx_rttvar += (delta - this.rx_rttvar) >> 5;
            }
            else {
                this.rx_rttvar += (delta - this.rx_rttvar) >> 2;
            }
        }
        rto = this.rx_srtt + Math.max(this.interval, this.rx_rttvar << 2);
        this.rx_rto = _ibound_(this.rx_minrto, rto, exports.IKCP_RTO_MAX);
    }
    _ack_push(sn, ts) {
        this.acklist.push({ sn, ts });
    }
    send(buffer) {
        let count = 0;
        if (buffer.byteLength === 0) {
            return -1;
        }
        // append to previous segment in streaming mode (if possible)
        if (this.stream !== 0) {
            const n = this.snd_queue.length;
            if (n > 0) {
                const seg = this.snd_queue[n - 1];
                if (seg.data.byteLength < this.mss) {
                    const capacity = this.mss - seg.data.byteLength;
                    let extend = capacity;
                    if (buffer.byteLength < capacity) {
                        extend = buffer.byteLength;
                    }
                    // grow slice, the underlying cap is guaranteed to
                    // be larger than kcp.mss
                    const oldlen = seg.data.byteLength;
                    seg.data = seg.data.slice(0, oldlen + extend);
                    buffer.copy(seg.data, oldlen);
                    buffer = buffer.slice(extend);
                }
            }
        }
        if (buffer.byteLength <= this.mss) {
            count = 1;
        }
        else {
            count = Math.floor((buffer.byteLength + this.mss - 1) / this.mss);
        }
        if (count > 255) {
            return -2;
        }
        if (count === 0) {
            count = 1;
        }
        for (let i = 0; i < count; i++) {
            let size = 0;
            if (buffer.byteLength > this.mss) {
                size = this.mss;
            }
            else {
                size = buffer.byteLength;
            }
            const seg = new Segment(size);
            buffer.copy(seg.data, 0, 0, size);
            if (this.stream === 0) {
                // message mode
                seg.frg = count - i - 1; // uint8
            }
            else {
                // stream mode
                seg.frg = 0;
            }
            this.snd_queue.push(seg);
            buffer = buffer.slice(size);
        }
        return 0;
    }
    setOutput(output) {
        this.output = output;
    }
    // Update updates state (call it repeatedly, every 10ms-100ms), or you can ask
    // ikcp_check when to call it again (without ikcp_input/_send calling).
    // 'current' - current timestamp in millisec.
    update() {
        let slap = 0; // int32
        const current = currentMs();
        if (this.updated === 0) {
            this.updated = 1;
            this.ts_flush = current;
        }
        slap = current - this.ts_flush;
        if (slap >= 10000 || slap < -10000) {
            this.ts_flush = current;
            slap = 0;
        }
        if (slap >= 0) {
            this.ts_flush += this.interval;
            if (current >= this.ts_flush) {
                this.ts_flush = current + this.interval;
            }
            this.flush(false);
        }
    }
    // Check determines when should you invoke ikcp_update:
    // returns when you should invoke ikcp_update in millisec, if there
    // is no ikcp_input/_send calling. you can call ikcp_update in that
    // time, instead of call update repeatly.
    // Important to reduce unnacessary ikcp_update invoking. use it to
    // schedule ikcp_update (eg. implementing an epoll-like mechanism,
    // or optimize ikcp_update when handling massive kcp connections)
    check() {
        const current = currentMs();
        let ts_flush = this.ts_flush;
        let tm_flush = 0x7fffffff;
        let tm_packet = 0x7fffffff;
        let minimal = 0;
        if (this.updated === 0) {
            return 0;
        }
        if (current - ts_flush >= 10000 || current - ts_flush < -10000) {
            ts_flush = current;
        }
        if (current >= ts_flush) {
            return 0;
        }
        tm_flush = ts_flush - current;
        for (const seg of this.snd_buf) {
            const diff = seg.resendts - current;
            if (diff <= 0) {
                return 0;
            }
            if (diff < tm_packet) {
                tm_packet = diff;
            }
        }
        minimal = tm_packet;
        if (tm_packet >= tm_flush) {
            minimal = tm_flush;
        }
        if (minimal >= this.interval) {
            minimal = this.interval;
        }
        return minimal;
    }
    _wnd_unused() {
        if (this.rcv_queue.length < this.rcv_wnd) {
            return this.rcv_wnd - this.rcv_queue.length;
        }
        return 0;
    }
    // flush pending data
    flush(ackOnly) {
        // console.log('kcp.flush', ackOnly);
        const seg = new Segment();
        seg.conv = this.conv;
        seg.cmd = exports.IKCP_CMD_ACK;
        seg.wnd = this._wnd_unused();
        seg.una = this.rcv_nxt;
        const buffer = this.buffer;
        let ptr = buffer.slice(this.reserved); // keep n bytes untouched
        // makeSpace makes room for writing
        const makeSpace = (space) => {
            const size = buffer.byteLength - ptr.byteLength;
            if (size + space > this.mtu) {
                this.output(buffer, size, this.user);
                ptr = buffer.slice(this.reserved);
            }
        };
        // flush bytes in buffer if there is any
        const flushBuffer = () => {
            const size = buffer.byteLength - ptr.byteLength;
            if (size > this.reserved) {
                this.output(buffer, size, this.user);
            }
        };
        // flush acknowledges
        for (let i = 0; i < this.acklist.length; i++) {
            const ack = this.acklist[i];
            makeSpace(exports.IKCP_OVERHEAD);
            // filter jitters cased by bufferbloat
            if (ack.sn >= this.rcv_nxt || this.acklist.length - 1 === i) {
                seg.sn = ack.sn;
                seg.ts = ack.ts;
                ptr = seg.encode(ptr);
            }
        }
        this.acklist = [];
        if (ackOnly) {
            // flash remain ack segments
            flushBuffer();
            return this.interval;
        }
        // probe window size (if remote window size equals zero)
        if (this.rmt_wnd === 0) {
            const current = currentMs();
            if (this.probe_wait === 0) {
                this.probe_wait = exports.IKCP_PROBE_INIT;
                this.ts_probe = current + this.probe_wait;
            }
            else {
                if (current >= this.ts_probe) {
                    if (this.probe_wait < exports.IKCP_PROBE_INIT) {
                        this.probe_wait = exports.IKCP_PROBE_INIT;
                    }
                    this.probe_wait += this.probe_wait / 2;
                    if (this.probe_wait > exports.IKCP_PROBE_LIMIT) {
                        this.probe_wait = exports.IKCP_PROBE_LIMIT;
                    }
                    this.ts_probe = current + this.probe_wait;
                    this.probe |= exports.IKCP_ASK_SEND;
                }
            }
        }
        else {
            this.ts_probe = 0;
            this.probe_wait = 0;
        }
        // flush window probing commands
        if ((this.probe & exports.IKCP_ASK_SEND) != 0) {
            seg.cmd = exports.IKCP_CMD_WASK;
            makeSpace(exports.IKCP_OVERHEAD);
            ptr = seg.encode(ptr);
        }
        // flush window probing commands
        if ((this.probe & exports.IKCP_ASK_TELL) != 0) {
            seg.cmd = exports.IKCP_CMD_WINS;
            makeSpace(exports.IKCP_OVERHEAD);
            ptr = seg.encode(ptr);
        }
        this.probe = 0;
        // calculate window size
        let cwnd = Math.min(this.snd_wnd, this.rmt_wnd);
        if (this.nocwnd === 0) {
            cwnd = Math.min(this.cwnd, cwnd);
        }
        // sliding window, controlled by snd_nxt && sna_una + cwnd
        let newSegsCount = 0;
        for (let k = 0; k < this.snd_queue.length; k++) {
            if (this.snd_nxt >= this.snd_una + cwnd) {
                break;
            }
            const newseg = this.snd_queue[k];
            newseg.conv = this.conv;
            newseg.cmd = exports.IKCP_CMD_PUSH;
            newseg.sn = this.snd_nxt;
            this.snd_buf.push(newseg);
            this.snd_nxt++;
            newSegsCount++;
        }
        if (newSegsCount > 0) {
            this.snd_queue.splice(0, newSegsCount);
        }
        // calculate resent
        let resent = this.fastresend;
        if (this.fastresend <= 0) {
            resent = 0xffffffff;
        }
        // check for retransmissions
        const current = currentMs();
        let change = 0;
        let lostSegs = 0;
        let fastRetransSegs = 0;
        let earlyRetransSegs = 0;
        let minrto = this.interval;
        // const ref = this.snd_buf.slice(); // for bounds check elimination
        const ref = this.snd_buf;
        for (let k = 0; k < ref.length; k++) {
            const segment = ref[k];
            let needsend = false;
            if (segment.acked === 1) {
                continue;
            }
            if (segment.xmit === 0) {
                // initial transmit
                needsend = true;
                segment.rto = this.rx_rto;
                segment.resendts = current + segment.rto;
            }
            else if (segment.fastack >= resent) {
                // fast retransmit
                needsend = true;
                segment.fastack = 0;
                segment.rto = this.rx_rto;
                segment.resendts = current + segment.rto;
                change++;
                fastRetransSegs++;
            }
            else if (segment.fastack > 0 && newSegsCount === 0) {
                // early retransmit
                needsend = true;
                segment.fastack = 0;
                segment.rto = this.rx_rto;
                segment.resendts = current + segment.rto;
                change++;
                earlyRetransSegs++;
            }
            else if (current >= segment.resendts) {
                // RTO
                needsend = true;
                if (this.nodelay === 0) {
                    segment.rto += this.rx_rto;
                }
                else {
                    segment.rto += Math.floor(this.rx_rto / 2);
                }
                segment.fastack = 0;
                segment.resendts = current + segment.rto;
                lostSegs++;
            }
            if (needsend) {
                const current = currentMs();
                segment.xmit++;
                segment.ts = current;
                segment.wnd = seg.wnd;
                segment.una = seg.una;
                const need = exports.IKCP_OVERHEAD + segment.data.byteLength;
                makeSpace(need);
                ptr = segment.encode(ptr);
                segment.data.copy(ptr);
                ptr = ptr.slice(segment.data.byteLength);
                if (segment.xmit >= this.dead_link) {
                    this.state = 0xffffffff;
                }
            }
            // get the nearest rto
            const rto = segment.resendts - current;
            if (rto > 0 && rto < minrto) {
                minrto = rto;
            }
        }
        // flush remain segments
        flushBuffer();
        // counter updates
        let sum = lostSegs;
        if (lostSegs > 0) {
            // stat
        }
        if (fastRetransSegs > 0) {
            sum += fastRetransSegs;
        }
        if (earlyRetransSegs > 0) {
            sum += earlyRetransSegs;
        }
        if (sum > 0) {
            // stat
        }
        // cwnd update
        if (this.nocwnd === 0) {
            // update ssthresh
            // rate halving, https://tools.ietf.org/html/rfc6937
            if (change > 0) {
                const inflight = this.snd_nxt - this.snd_una;
                this.ssthresh = Math.floor(inflight / 2);
                if (this.ssthresh < exports.IKCP_THRESH_MIN) {
                    this.ssthresh = exports.IKCP_THRESH_MIN;
                }
                this.cwnd = this.ssthresh + resent;
                this.incr = this.cwnd * this.mss;
            }
            // congestion control, https://tools.ietf.org/html/rfc5681
            if (lostSegs > 0) {
                this.ssthresh = Math.floor(cwnd / 2);
                if (this.ssthresh < exports.IKCP_THRESH_MIN) {
                    this.ssthresh = exports.IKCP_THRESH_MIN;
                }
                this.cwnd = 1;
                this.incr = this.mss;
            }
            if (this.cwnd < 1) {
                this.cwnd = 1;
                this.incr = this.mss;
            }
        }
        return minrto;
    }
    peekSize() {
        if (this.rcv_queue.length === 0) {
            return -1;
        }
        const seg = this.rcv_queue[0];
        if (seg.frg === 0) {
            return seg.data.length;
        }
        if (this.rcv_queue.length < seg.frg + 1) {
            return -1;
        }
        let length = 0;
        for (const seg of this.rcv_queue) {
            length += seg.data.byteLength;
            if (seg.frg === 0) {
                break;
            }
        }
        return length;
    }
    // WaitSnd gets how many packet is waiting to be sent
    getWaitSnd() {
        return this.snd_buf.length + this.snd_queue.length;
    }
    setReserveBytes(len) {
        if (len >= this.mtu - exports.IKCP_OVERHEAD || len < 0) {
            return false;
        }
        this.reserved = len;
        this.mss = this.mtu - exports.IKCP_OVERHEAD - len;
        return true;
    }
    // Release all cached outgoing segments
    releaseTX() {
        /*
    for k := range kcp.snd_queue {
        if kcp.snd_queue[k].data != nil {
            xmitBuf.Put(kcp.snd_queue[k].data)
        }
    }
    for k := range kcp.snd_buf {
        if kcp.snd_buf[k].data != nil {
            xmitBuf.Put(kcp.snd_buf[k].data)
        }
    }
    kcp.snd_queue = nil
    kcp.snd_buf = nil
    */
        this.snd_queue = undefined;
        this.snd_buf = undefined;
    }
}
exports.Kcp = Kcp;
