"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FecEncoder = void 0;
/* eslint @typescript-eslint/no-var-requires: "off" */
const common_1 = require("./common");
const ReedSolomon = require('@ronomon/reed-solomon');
class FecEncoder {
    constructor(dataShards, parityShards, offset) {
        if (dataShards <= 0 || parityShards <= 0) {
            dataShards = 8;
            parityShards = 2;
        }
        this._dataShards = dataShards;
        this._parityShards = parityShards;
        this._shardSize = dataShards + parityShards;
        this._paws = Math.floor(0xffffffff / this._shardSize) * this._shardSize;
        this._headerOffset = offset;
        this._payloadOffset = this._headerOffset + common_1.fecHeaderSize;
        this._context = ReedSolomon.create(dataShards, parityShards);
        this._cacheBlock = common_1.initCacheBlock(dataShards, parityShards);
        this._shardCount = 0;
        this._next = 0;
    }
    markData(data) {
        data.writeUInt32LE(this._next);
        data.writeUInt16LE(common_1.typeData, 4);
        this._next++;
    }
    markParity(data) {
        data.writeUInt32LE(this._next);
        data.writeUInt16LE(common_1.typeParity, 4);
        // sequence wrap will only happen at parity shard
        this._next = (this._next + 1) % this._paws;
    }
    encodeAsync(buff) {
        return new Promise((resolve, reject) => {
            this.encode(buff, (err, result) => {
                if (err !== undefined) {
                    reject(err);
                    return;
                }
                resolve(result);
            });
        });
    }
    encode(buff, callback) {
        console.log('fec.encode()', buff);
        // The header format:
        // | FEC SEQID(4B) | FEC TYPE(2B) | SIZE (2B) | PAYLOAD(SIZE-2) |
        // |<-headerOffset                |<-payloadOffset
        this.markData(buff);
        const len = buff.slice(8).byteLength;
        buff.writeUInt16LE(len, this._payloadOffset);
        // copy data from payloadOffset to fec shard cache
        const sz = buff.byteLength - this._payloadOffset;
        this._cacheBlock.dataArr.push(buff);
        this._shardCount++;
        // set sources & targets
        const idx = this._cacheBlock.dataArr.length - 1;
        this._cacheBlock.sources |= 1 << idx;
        this._cacheBlock.targets ^= 1 << idx;
        // track max datashard length
        if (sz > this._cacheBlock.maxSize) {
            this._cacheBlock.maxSize = sz;
        }
        if (this._shardCount === this._dataShards) {
            // encoding
            const cacheBlock = this._cacheBlock;
            this._cacheBlock = common_1.initCacheBlock(this._dataShards, this._parityShards);
            this._encode(cacheBlock, buff, callback);
            // counters resetting
            this._shardCount = 0;
        }
        else {
            callback(undefined, { data: [buff] });
        }
    }
    _encode(cacheBlock, buff, callback) {
        const bufferOffset = 0;
        const parityOffset = 0;
        // 把数据包补足为长度相同的 buffer
        const shardSize = common_1.multiple8(cacheBlock.maxSize);
        const dataArr = [];
        for (const buff of cacheBlock.dataArr) {
            const dataBuff = buff.slice(this._payloadOffset);
            if (dataBuff.byteLength === shardSize) {
                dataArr.push(buff);
            }
            else {
                dataArr.push(Buffer.concat([dataBuff, Buffer.alloc(shardSize - dataBuff.byteLength)]));
            }
        }
        const encoderBuffer = Buffer.concat(dataArr);
        const bufferSize = encoderBuffer.byteLength;
        const paritySize = shardSize * this._parityShards;
        const encoderParity = Buffer.alloc(paritySize);
        const { sources, targets } = cacheBlock;
        // console.log('编码参数', { shardSize, encoderBuffer, bufferSize, encoderParity, paritySize, sources, targets })
        ReedSolomon.encode(this._context, sources, targets, encoderBuffer, bufferOffset, bufferSize, encoderParity, parityOffset, paritySize, (error) => {
            const parity = [];
            for (let i = 0; i < this._parityShards; i++) {
                const p = Buffer.concat([Buffer.alloc(6), encoderParity.slice(i * shardSize, (1 + i) * shardSize)]);
                this.markParity(p);
                parity.push(p);
            }
            callback(error, { data: [buff], parity });
        });
    }
}
exports.FecEncoder = FecEncoder;
