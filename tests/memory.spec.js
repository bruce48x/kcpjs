const assert = require('assert');
const crypto = require('crypto');
const crc32 = require('crc-32');

const { FecDecoder } = require('../dist/fecDecoder');
const { FecEncoder } = require('../dist/fecEncoder');
const { FecPacket } = require('../dist/fecPacket');
const { typeData, fecHeaderSize, cryptHeaderSize, nonceSize } = require('../dist/common');
const { AesBlock } = require('../dist/crypt');
const { Kcp, IKCP_WND_SND_MAX, IKCP_WND_RCV_MAX } = require('../dist/kcp');
const { Dial, DialWithOptions, ListenWithOptions } = require('../dist/session');

function makeFecPacket(seqId, payloadSize = 12) {
    const payload = Buffer.alloc(2 + payloadSize, seqId & 0xff);
    payload.writeUInt16LE(payloadSize, 0);

    const packet = Buffer.alloc(fecHeaderSize + payload.byteLength);
    packet.writeUInt32LE(seqId, 0);
    packet.writeUInt16LE(typeData, 4);
    payload.copy(packet, fecHeaderSize);
    return new FecPacket(packet);
}

function makeKcpPushPacket(conv, sn = 0, payload = Buffer.alloc(0)) {
    const packet = Buffer.alloc(24 + payload.byteLength);
    packet.writeUInt32LE(conv, 0);
    packet.writeUInt8(81, 4);
    packet.writeUInt8(0, 5);
    packet.writeUInt16LE(32, 6);
    packet.writeUInt32LE(0, 8);
    packet.writeUInt32LE(sn, 12);
    packet.writeUInt32LE(0, 16);
    packet.writeUInt32LE(payload.byteLength, 20);
    payload.copy(packet, 24);
    return packet;
}

function makeKcpAckPacket(conv, sn, una) {
    const packet = Buffer.alloc(24);
    packet.writeUInt32LE(conv, 0);
    packet.writeUInt8(82, 4);
    packet.writeUInt8(0, 5);
    packet.writeUInt16LE(32, 6);
    packet.writeUInt32LE(0, 8);
    packet.writeUInt32LE(sn, 12);
    packet.writeUInt32LE(una, 16);
    packet.writeUInt32LE(0, 20);
    return packet;
}

function makeFecDataFrame(kcpPacket) {
    const packet = Buffer.alloc(fecHeaderSize + 2 + kcpPacket.byteLength);
    kcpPacket.copy(packet, fecHeaderSize + 2);
    return packet;
}

function encodeAsync(encoder, buff) {
    return new Promise((resolve, reject) => {
        encoder.encode(buff, (err, result) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(result);
        });
    });
}

function decodeAsync(decoder, buff) {
    return new Promise((resolve, reject) => {
        decoder.decode(new FecPacket(buff), (err, result) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(result);
        });
    });
}

async function testFecIncompleteGroupsAreBounded() {
    const decoder = new FecDecoder(4, 1);

    for (let group = 0; group < 50; group++) {
        decoder.decode(makeFecPacket(group * 5), () => {});
        assert(decoder._cacheBlockMap.size <= 3);
    }

    decoder.release();
}

async function testMemoryUsageSnapshotIsAvailable() {
    const usage = process.memoryUsage();

    assert(Number.isFinite(usage.heapUsed));
    assert(Number.isFinite(usage.external));
    assert(Number.isFinite(usage.arrayBuffers));
}

async function testKcpWindowSizeIsClamped() {
    const kcp = new Kcp(3001, {});

    kcp.setWndSize(IKCP_WND_SND_MAX + 1000, IKCP_WND_RCV_MAX + 1000);
    assert.strictEqual(kcp.snd_wnd, IKCP_WND_SND_MAX);
    assert.strictEqual(kcp.rcv_wnd, IKCP_WND_RCV_MAX);

    kcp.setWndSize(12.8, 15.9);
    assert.strictEqual(kcp.snd_wnd, 12);
    assert.strictEqual(kcp.rcv_wnd, 15);

    kcp.release();
}

async function testKcpSendQueueIsStructurallyBounded() {
    const session = Dial(3002, 9, '127.0.0.1');

    session.setWindowSize(IKCP_WND_SND_MAX + 1000, IKCP_WND_RCV_MAX + 1000);
    assert.strictEqual(session.kcp.snd_wnd, IKCP_WND_SND_MAX);
    assert.strictEqual(session.kcp.rcv_wnd, IKCP_WND_RCV_MAX);

    session.setWriteBufferLimit(3);
    for (let i = 0; i < 3; i++) {
        assert.strictEqual(session.write(Buffer.alloc(session.kcp.mss)), session.kcp.mss);
    }
    assert.strictEqual(session.write(Buffer.alloc(session.kcp.mss)), -1);
    assert(session.kcp.getWaitSnd() <= 3);

    session.close();
}

async function testKcpSendQueueCompactionPreservesOrder() {
    const kcp = new Kcp(3101, {});
    kcp.setOutput(() => {});
    kcp.setNoDelay(0, 100, 0, 1);
    kcp.setWndSize(4, 32);

    assert.strictEqual(kcp.send(Buffer.alloc(kcp.mss * 4, 1)), 0);
    assert.strictEqual(kcp.snd_queue.length, 4);

    kcp.flush(false);

    assert.strictEqual(kcp.snd_queue.length, 0);
    assert.strictEqual(kcp.snd_buf.length, 4);
    assert.deepStrictEqual(
        kcp.snd_buf.map((seg) => seg.sn),
        [0, 1, 2, 3],
    );

    kcp.input(makeKcpAckPacket(kcp.conv, 0, 2), true, false);

    assert.strictEqual(kcp.snd_buf.length, 2);
    assert.deepStrictEqual(
        kcp.snd_buf.map((seg) => seg.sn),
        [2, 3],
    );

    kcp.release();
}

async function testKcpReceiveQueueCompactionPreservesOrder() {
    const kcp = new Kcp(3102, {});
    const payloads = [Buffer.from('one'), Buffer.from('two'), Buffer.from('three')];

    for (let i = 0; i < payloads.length; i++) {
        kcp.input(makeKcpPushPacket(kcp.conv, i, payloads[i]), true, false);
    }

    assert.strictEqual(kcp.rcv_queue.length, 3);

    const recvbuf = Buffer.alloc(payloads[0].byteLength);
    assert.strictEqual(kcp.recv(recvbuf), payloads[0].byteLength);
    assert(recvbuf.equals(payloads[0]));

    assert.strictEqual(kcp.rcv_queue.length, 2);
    assert.deepStrictEqual(
        kcp.rcv_queue.map((seg) => seg.data.toString()),
        ['two', 'three'],
    );

    kcp.release();
}

async function testFecCompletedGroupsAreReleased() {
    const decoder = new FecDecoder(4, 1);

    for (let group = 0; group < 50; group++) {
        for (let shard = 0; shard < 4; shard++) {
            decoder.decode(makeFecPacket(group * 5 + shard), () => {});
        }
        assert.strictEqual(decoder._cacheBlockMap.size, 0);
        assert(decoder._completedGroups.size <= 3);
    }

    decoder.decode(makeFecPacket(49 * 5), (err, result) => {
        assert.ifError(err);
        assert.deepStrictEqual(result, {});
    });
    assert.strictEqual(decoder._cacheBlockMap.size, 0);

    decoder.release();
}

async function testFecRecoveryReleasesGroupAndOnlyReturnsRecoveredShard() {
    const encoder = new FecEncoder(4, 1, 0);
    const encodedData = [];
    let parityPacket;

    for (let i = 0; i < 4; i++) {
        const buff = Buffer.alloc(fecHeaderSize + 2 + 12, i);
        buff.writeUInt16LE(12, fecHeaderSize);
        const result = await encodeAsync(encoder, buff);
        encodedData.push(...(result.data || []));
        if (result.parity && result.parity.length) {
            parityPacket = result.parity[0];
        }
    }

    const decoder = new FecDecoder(4, 1);
    await decodeAsync(decoder, encodedData[0]);
    await decodeAsync(decoder, encodedData[1]);
    await decodeAsync(decoder, encodedData[3]);
    const recovered = await decodeAsync(decoder, parityPacket);

    assert.strictEqual((recovered.data || []).length, 0);
    assert.strictEqual((recovered.parity || []).length, 1);
    assert.strictEqual(recovered.parity[0].readUInt16LE(0), 12);
    assert.strictEqual(decoder._cacheBlockMap.size, 0);

    encoder.release();
    decoder.release();
}

async function testFecEncoderReusesWorkBuffers() {
    const encoder = new FecEncoder(4, 1, 0);

    for (let i = 0; i < 4; i++) {
        const buff = Buffer.alloc(fecHeaderSize + 2 + 12, i);
        buff.writeUInt16LE(12, fecHeaderSize);
        await encodeAsync(encoder, buff);
    }

    const firstBuffer = encoder._encoderBuffer;
    const firstParity = encoder._encoderParity;
    assert(firstBuffer);
    assert(firstParity);

    for (let i = 0; i < 4; i++) {
        const buff = Buffer.alloc(fecHeaderSize + 2 + 8, i + 10);
        buff.writeUInt16LE(8, fecHeaderSize);
        await encodeAsync(encoder, buff);
    }

    assert.strictEqual(encoder._encoderBuffer, firstBuffer);
    assert.strictEqual(encoder._encoderParity, firstParity);

    for (let i = 0; i < 4; i++) {
        const buff = Buffer.alloc(fecHeaderSize + 2 + 256, i + 20);
        buff.writeUInt16LE(256, fecHeaderSize);
        await encodeAsync(encoder, buff);
    }

    assert(encoder._encoderBuffer.byteLength >= 4 * 264);
    assert(encoder._encoderParity.byteLength >= 264);

    encoder.release();
}

async function testFecDecoderReusesWorkBuffersAndReturnsOwnedRecoveredData() {
    const encoder = new FecEncoder(4, 1, 0);
    const decoder = new FecDecoder(4, 1);
    const encodedGroups = [];

    for (let group = 0; group < 2; group++) {
        const encodedData = [];
        let parityPacket;
        for (let shard = 0; shard < 4; shard++) {
            const buff = Buffer.alloc(fecHeaderSize + 2 + 12, group * 10 + shard);
            buff.writeUInt16LE(12, fecHeaderSize);
            const result = await encodeAsync(encoder, buff);
            encodedData.push(...(result.data || []));
            if (result.parity && result.parity.length) {
                parityPacket = result.parity[0];
            }
        }
        encodedGroups.push({ encodedData, parityPacket });
    }

    await decodeAsync(decoder, encodedGroups[0].encodedData[0]);
    await decodeAsync(decoder, encodedGroups[0].encodedData[1]);
    await decodeAsync(decoder, encodedGroups[0].encodedData[3]);
    const firstRecovered = await decodeAsync(decoder, encodedGroups[0].parityPacket);
    const firstRecoveredPayload = firstRecovered.parity[0];
    const firstRecoveredSnapshot = Buffer.from(firstRecoveredPayload);
    const firstBuffer = decoder._decoderBuffer;
    const firstParity = decoder._decoderParity;

    assert(firstBuffer);
    assert(firstParity);

    await decodeAsync(decoder, encodedGroups[1].encodedData[0]);
    await decodeAsync(decoder, encodedGroups[1].encodedData[2]);
    await decodeAsync(decoder, encodedGroups[1].encodedData[3]);
    const secondRecovered = await decodeAsync(decoder, encodedGroups[1].parityPacket);

    assert.strictEqual(decoder._decoderBuffer, firstBuffer);
    assert.strictEqual(decoder._decoderParity, firstParity);
    assert(firstRecoveredPayload.equals(firstRecoveredSnapshot));
    assert.strictEqual(secondRecovered.parity[0].readUInt16LE(0), 12);

    encoder.release();
    decoder.release();
}

async function testSessionReceiveBufferIsReusedAndPayloadIsOwned() {
    const session = Dial(5001, 9, '127.0.0.1');
    const received = [];
    session.on('recv', (data) => {
        received.push(data);
    });

    const initialRecvbuf = session.recvbuf;
    const smallPayload = Buffer.from('small payload');
    session.kcpInput(makeKcpPushPacket(session.getConv(), 0, smallPayload));

    assert.strictEqual(session.recvbuf, initialRecvbuf);
    assert.strictEqual(received.length, 1);
    assert(received[0].equals(smallPayload));

    session.recvbuf.fill(0);
    assert(received[0].equals(smallPayload));

    const largePayload = Buffer.alloc(2048, 7);
    session.kcpInput(makeKcpPushPacket(session.getConv(), 1, largePayload));

    assert(session.recvbuf.byteLength >= largePayload.byteLength);
    assert.strictEqual(received.length, 2);
    assert(received[1].equals(largePayload));

    session.close();
}

async function testSessionReceiveBufferIsUsedForFecPayloads() {
    const session = DialWithOptions({
        conv: 5002,
        port: 9,
        host: '127.0.0.1',
        dataShards: 1,
        parityShards: 1,
    });
    const encoder = new FecEncoder(1, 1, 0);
    const received = [];
    session.on('recv', (data) => {
        received.push(data);
    });

    const initialRecvbuf = session.recvbuf;
    const payload = Buffer.from('fec payload');
    const result = await encodeAsync(encoder, makeFecDataFrame(makeKcpPushPacket(session.getConv(), 0, payload)));

    session.kcpInput(result.data[0]);

    assert.strictEqual(session.recvbuf, initialRecvbuf);
    assert.strictEqual(received.length, 1);
    assert(received[0].equals(payload));

    encoder.release();
    session.close();
}

async function testKcpOutputBufferPoolReusesSafeCopies() {
    const session = Dial(5003, 9, '127.0.0.1');
    const sent = [];
    session.setNoDelay(0, 100, 0, 1);
    session.conn.send = (buff, port, host, callback) => {
        sent.push(Buffer.from(buff));
        if (callback) {
            callback(null, buff.byteLength);
        }
    };

    assert.strictEqual(session.write(Buffer.from('pool')), 4);
    assert.strictEqual(session.outputBufferPool.length, 1);
    const pooled = session.outputBufferPool[0];

    assert.strictEqual(session.write(Buffer.from('pool')), 4);
    assert.strictEqual(session.outputBufferPool.length, 1);
    assert.strictEqual(session.outputBufferPool[0], pooled);
    assert.strictEqual(sent.length, 2);

    session.close();
}

async function testKcpOutputBufferPoolWorksWithEncryption() {
    const block = {
        encrypt(data) {
            return Buffer.from(data);
        },
        decrypt(data) {
            return Buffer.from(data);
        },
    };
    const session = DialWithOptions({
        conv: 5004,
        port: 9,
        host: '127.0.0.1',
        block,
    });
    const sent = [];
    session.setNoDelay(0, 100, 0, 1);
    session.conn.send = (buff, port, host, callback) => {
        sent.push(Buffer.from(buff));
        if (callback) {
            callback(null, buff.byteLength);
        }
    };

    assert.strictEqual(session.write(Buffer.from('encrypted')), 9);
    assert.strictEqual(session.outputBufferPool.length, 1);
    assert.strictEqual(sent.length, 1);

    session.close();
}

async function testAesBlockRoundTripAndTamperFailure() {
    const block = new AesBlock('aes-128-gcm', crypto.randomBytes(16), crypto.randomBytes(12));
    const payload = Buffer.from('aes payload');
    const encrypted = block.encrypt(payload);

    assert.strictEqual(encrypted.byteLength, payload.byteLength + block.authTagLength);
    assert(block.decrypt(encrypted).equals(payload));

    encrypted[0] ^= 0xff;
    assert.throws(() => block.decrypt(encrypted));
}

async function testSessionOutputUsesRealAesBlock() {
    const block = new AesBlock('aes-128-gcm', crypto.randomBytes(16), crypto.randomBytes(12));
    const session = DialWithOptions({
        conv: 5005,
        port: 9,
        host: '127.0.0.1',
        block,
    });
    const sent = [];
    session.setNoDelay(0, 100, 0, 1);
    session.conn.send = (buff, port, host, callback) => {
        sent.push(Buffer.from(buff));
        if (callback) {
            callback(null, buff.byteLength);
        }
    };

    assert.strictEqual(session.write(Buffer.from('real aes')), 8);
    assert.strictEqual(session.outputBufferPool.length, 1);
    assert.strictEqual(sent.length, 1);

    const decrypted = block.decrypt(sent[0]);
    const checksum = crc32.buf(decrypted.slice(cryptHeaderSize)) >>> 0;
    assert.strictEqual(checksum, decrypted.readUInt32LE(nonceSize));
    assert.strictEqual(decrypted.readUInt32LE(cryptHeaderSize), session.getConv());

    session.close();
}

async function testSessionCloseClearsTimerSocketListenerAndKcp() {
    const session = Dial(1001, 9, '127.0.0.1');
    const socket = session.conn;

    assert.strictEqual(socket.listenerCount('message'), 1);
    session.setWriteBufferLimit(1);
    assert.strictEqual(session.write(Buffer.alloc(session.kcp.mss)), session.kcp.mss);
    assert.strictEqual(session.write(Buffer.alloc(session.kcp.mss)), -1);

    session.close();

    assert.strictEqual(session.closed, true);
    assert.strictEqual(session.kcp, undefined);
    assert.strictEqual(socket.listenerCount('message'), 0);
}

async function testListenerEnforcesSessionLimit() {
    const listener = ListenWithOptions({
        port: 0,
        maxSessions: 1,
        callback: () => {},
    });

    listener.packetInput(makeKcpPushPacket(2001), { address: '127.0.0.1', port: 11001 });
    listener.packetInput(makeKcpPushPacket(2002), { address: '127.0.0.1', port: 11002 });

    assert.strictEqual(listener.sessionCount, 1);
    assert.strictEqual(Object.keys(listener.sessions).length, 1);

    listener.close();
}

async function testListenerSessionStressIsBoundedAndReleased() {
    const maxSessions = 16;
    const listener = ListenWithOptions({
        port: 0,
        maxSessions,
        callback: () => {},
    });

    for (let i = 0; i < maxSessions * 4; i++) {
        listener.packetInput(makeKcpPushPacket(4000 + i), { address: '127.0.0.1', port: 12000 + i });
    }

    assert.strictEqual(listener.sessionCount, maxSessions);
    assert.strictEqual(Object.keys(listener.sessions).length, maxSessions);

    listener.close();

    assert.strictEqual(listener.sessionCount, 0);
    assert.strictEqual(Object.keys(listener.sessions).length, 0);
}

async function main() {
    await testMemoryUsageSnapshotIsAvailable();
    await testFecIncompleteGroupsAreBounded();
    await testFecCompletedGroupsAreReleased();
    await testFecRecoveryReleasesGroupAndOnlyReturnsRecoveredShard();
    await testFecEncoderReusesWorkBuffers();
    await testFecDecoderReusesWorkBuffersAndReturnsOwnedRecoveredData();
    await testSessionReceiveBufferIsReusedAndPayloadIsOwned();
    await testSessionReceiveBufferIsUsedForFecPayloads();
    await testKcpOutputBufferPoolReusesSafeCopies();
    await testKcpOutputBufferPoolWorksWithEncryption();
    await testAesBlockRoundTripAndTamperFailure();
    await testSessionOutputUsesRealAesBlock();
    await testKcpWindowSizeIsClamped();
    await testKcpSendQueueIsStructurallyBounded();
    await testKcpSendQueueCompactionPreservesOrder();
    await testKcpReceiveQueueCompactionPreservesOrder();
    await testSessionCloseClearsTimerSocketListenerAndKcp();
    await testListenerEnforcesSessionLimit();
    await testListenerSessionStressIsBoundedAndReleased();
}

main()
    .then(() => {
        console.log('memory lifecycle tests passed');
    })
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
