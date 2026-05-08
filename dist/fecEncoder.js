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
        this._cacheBlock = (0, common_1.initCacheBlock)(dataShards, parityShards);
        this._shardCount = 0;
        this._next = 0;
        this._encoderBufferInUse = false;
        this._encoderParityInUse = false;
    }
    markData(data) {
        data.writeUInt32LE(this._next, this._headerOffset);
        data.writeUInt16LE(common_1.typeData, this._headerOffset + 4);
        this._next++;
    }
    markParity(data) {
        data.writeUInt32LE(this._next, this._headerOffset);
        data.writeUInt16LE(common_1.typeParity, this._headerOffset + 4);
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
        // The header format:
        // | FEC SEQID(4B) | FEC TYPE(2B) | SIZE (2B) | PAYLOAD(SIZE-2) |
        // |<-headerOffset                |<-payloadOffset
        this.markData(buff);
        const len = buff.slice(this._headerOffset + common_1.fecHeaderSizePlus2).byteLength;
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
            this._cacheBlock = (0, common_1.initCacheBlock)(this._dataShards, this._parityShards);
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
        // const bufferOffset = this._headerOffset;
        const parityOffset = 0;
        // 把数据包补足为长度相同的 buffer
        const shardSize = (0, common_1.multiple8)(cacheBlock.maxSize);
        const bufferSize = shardSize * this._dataShards;
        const paritySize = shardSize * this._parityShards;
        const encoderBufferWork = this.acquireEncoderBuffer(bufferSize);
        const encoderParityWork = this.acquireEncoderParity(paritySize);
        const encoderBuffer = encoderBufferWork.buffer;
        const encoderParity = encoderParityWork.buffer;
        encoderBuffer.fill(0, 0, bufferSize);
        encoderParity.fill(0, 0, paritySize);
        for (let i = 0; i < cacheBlock.dataArr.length; i++) {
            const buff = cacheBlock.dataArr[i];
            const dataBuff = buff.slice(this._payloadOffset);
            dataBuff.copy(encoderBuffer, i * shardSize, 0, Math.min(dataBuff.byteLength, shardSize));
        }
        const { sources, targets } = cacheBlock;
        ReedSolomon.encode(this._context, sources, targets, encoderBuffer, bufferOffset, bufferSize, encoderParity, parityOffset, paritySize, (error) => {
            const parity = [];
            for (let i = 0; i < this._parityShards; i++) {
                const p = Buffer.alloc(common_1.fecHeaderSize + shardSize);
                encoderParity.copy(p, common_1.fecHeaderSize, i * shardSize, (i + 1) * shardSize);
                this.markParity(p);
                parity.push(p);
            }
            this.releaseEncoderBuffer(encoderBufferWork.pooled);
            this.releaseEncoderParity(encoderParityWork.pooled);
            callback(error, { data: [buff], parity });
        });
    }
    acquireEncoderBuffer(size) {
        if (!this._encoderBufferInUse) {
            if (!this._encoderBuffer || this._encoderBuffer.byteLength < size) {
                this._encoderBuffer = Buffer.allocUnsafe(size);
            }
            this._encoderBufferInUse = true;
            return { buffer: this._encoderBuffer, pooled: true };
        }
        return { buffer: Buffer.allocUnsafe(size), pooled: false };
    }
    acquireEncoderParity(size) {
        if (!this._encoderParityInUse) {
            if (!this._encoderParity || this._encoderParity.byteLength < size) {
                this._encoderParity = Buffer.allocUnsafe(size);
            }
            this._encoderParityInUse = true;
            return { buffer: this._encoderParity, pooled: true };
        }
        return { buffer: Buffer.allocUnsafe(size), pooled: false };
    }
    releaseEncoderBuffer(pooled) {
        if (pooled) {
            this._encoderBufferInUse = false;
        }
    }
    releaseEncoderParity(pooled) {
        if (pooled) {
            this._encoderParityInUse = false;
        }
    }
    release() {
        this._cacheBlock = undefined;
        this._encoderBuffer = undefined;
        this._encoderParity = undefined;
        this._encoderBufferInUse = false;
        this._encoderParityInUse = false;
        this._context = undefined;
    }
}
exports.FecEncoder = FecEncoder;
