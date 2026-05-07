const assert = require('assert');

const { FecDecoder } = require('../dist/fecDecoder');
const { FecEncoder } = require('../dist/fecEncoder');
const { FecPacket } = require('../dist/fecPacket');
const { typeData, fecHeaderSize } = require('../dist/common');
const { Dial, ListenWithOptions } = require('../dist/session');

function makeFecPacket(seqId, payloadSize = 12) {
    const payload = Buffer.alloc(2 + payloadSize, seqId & 0xff);
    payload.writeUInt16LE(payloadSize, 0);

    const packet = Buffer.alloc(fecHeaderSize + payload.byteLength);
    packet.writeUInt32LE(seqId, 0);
    packet.writeUInt16LE(typeData, 4);
    payload.copy(packet, fecHeaderSize);
    return new FecPacket(packet);
}

function makeKcpPushPacket(conv, sn = 0) {
    const packet = Buffer.alloc(24);
    packet.writeUInt32LE(conv, 0);
    packet.writeUInt8(81, 4);
    packet.writeUInt8(0, 5);
    packet.writeUInt16LE(32, 6);
    packet.writeUInt32LE(0, 8);
    packet.writeUInt32LE(sn, 12);
    packet.writeUInt32LE(0, 16);
    packet.writeUInt32LE(0, 20);
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

async function main() {
    await testFecIncompleteGroupsAreBounded();
    await testFecCompletedGroupsAreReleased();
    await testFecRecoveryReleasesGroupAndOnlyReturnsRecoveredShard();
    await testSessionCloseClearsTimerSocketListenerAndKcp();
    await testListenerEnforcesSessionLimit();
}

main()
    .then(() => {
        console.log('memory lifecycle tests passed');
    })
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
