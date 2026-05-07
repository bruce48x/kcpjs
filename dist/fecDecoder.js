"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FecDecoder = exports.FecElement = void 0;
/* eslint @typescript-eslint/no-var-requires: "off" */
const fecPacket_1 = require("./fecPacket");
const common_1 = require("./common");
const ReedSolomon = require('@ronomon/reed-solomon');
class FecElement extends fecPacket_1.FecPacket {
    constructor(buff, ts) {
        super(buff);
        this.ts = ts;
    }
}
exports.FecElement = FecElement;
class FecDecoder {
    constructor(_dataShards, _parityShards) {
        this._dataShards = _dataShards;
        this._parityShards = _parityShards;
        this._shardSize = this._dataShards + this._parityShards;
        this._rxlimit = common_1.rxFECMulti * this._shardSize;
        this._maxCacheBlocks = Math.max(1, Math.ceil(this._rxlimit / this._shardSize));
        this._context = ReedSolomon.create(this._dataShards, this._parityShards);
        this._cacheBlockMap = new Map();
        this._completedGroups = new Set();
        this._latestGroup = -1;
    }
    decodeAsync(inData) {
        return new Promise((resolve, reject) => {
            this.decode(inData, (err, result) => {
                if (err !== undefined) {
                    reject(err);
                    return;
                }
                resolve(result);
            });
        });
    }
    decode(inData, callback) {
        const seqId = inData.seqId();
        const type = inData.flag();
        const group = Math.floor(seqId / this._shardSize);
        if (!this.trackGroup(group)) {
            callback(undefined, {});
            return;
        }
        if (this._completedGroups.has(group)) {
            callback(undefined, {});
            return;
        }
        if (!this._cacheBlockMap.has(group)) {
            this._cacheBlockMap.set(group, (0, common_1.initCacheBlock)(this._dataShards, this._parityShards));
        }
        const cacheBlock = this._cacheBlockMap.get(group);
        if (type === common_1.typeData) {
            const idx = seqId % this._shardSize;
            if (undefined === cacheBlock.dataArr[idx]) {
                cacheBlock.numShards++;
                cacheBlock.dataArr[idx] = inData.buff;
                cacheBlock.numDataShards++;
                cacheBlock.sources |= 1 << idx;
                cacheBlock.targets ^= 1 << idx;
                const sz = inData.buff.byteLength - common_1.fecHeaderSize;
                if (sz > cacheBlock.maxSize) {
                    cacheBlock.maxSize = sz;
                }
            }
        }
        else {
            const idx = seqId % this._shardSize;
            const parityIdx = idx - this._dataShards;
            if (undefined === cacheBlock.parityArr[parityIdx]) {
                cacheBlock.numShards++;
                cacheBlock.parityArr[parityIdx] = inData.buff;
                cacheBlock.sources |= 1 << idx;
                cacheBlock.targets ^= 1 << idx;
                const sz = inData.buff.byteLength - common_1.fecHeaderSize;
                if (sz > cacheBlock.maxSize) {
                    cacheBlock.maxSize = sz;
                }
            }
        }
        if (cacheBlock.numDataShards < this._dataShards && cacheBlock.numShards >= this._dataShards) {
            this._decode(cacheBlock, (err, result) => {
                this.completeGroup(group);
                callback(err, result);
            });
        }
        else {
            if (type === common_1.typeData) {
                const result = { data: [inData.buff.slice(common_1.fecHeaderSize)] };
                if (cacheBlock.numDataShards === this._dataShards) {
                    this.completeGroup(group);
                }
                callback(undefined, result);
            }
            else {
                callback(undefined, {});
            }
        }
    }
    trackGroup(group) {
        if (group > this._latestGroup) {
            this._latestGroup = group;
        }
        const minGroup = this._latestGroup - this._maxCacheBlocks + 1;
        if (group < minGroup) {
            return false;
        }
        for (const cachedGroup of this._cacheBlockMap.keys()) {
            if (cachedGroup < minGroup) {
                this._cacheBlockMap.delete(cachedGroup);
            }
        }
        for (const completedGroup of this._completedGroups) {
            if (completedGroup < minGroup) {
                this._completedGroups.delete(completedGroup);
            }
        }
        return true;
    }
    completeGroup(group) {
        this._cacheBlockMap.delete(group);
        this._completedGroups.add(group);
        this.trackGroup(this._latestGroup);
    }
    _decode(cacheBlock, callback) {
        const bufferOffset = 0;
        const parityOffset = 0;
        // 把数据包补足为长度相同的 buffer
        const shardSize = (0, common_1.multiple8)(cacheBlock.maxSize);
        const encoderBuffer = Buffer.alloc(shardSize * this._dataShards);
        const missingData = [];
        for (let i = 0; i < this._dataShards; i++) {
            const buff = cacheBlock.dataArr[i]?.slice(common_1.fecHeaderSize);
            if (undefined === buff) {
                missingData.push(i);
            }
            else {
                buff.copy(encoderBuffer, i * shardSize, 0, Math.min(buff.byteLength, shardSize));
            }
        }
        const encoderParity = Buffer.alloc(shardSize * this._parityShards);
        for (let i = 0; i < this._parityShards; i++) {
            const buff = cacheBlock.parityArr[i]?.slice(common_1.fecHeaderSize);
            if (undefined !== buff) {
                buff.copy(encoderParity, i * shardSize, 0, Math.min(buff.byteLength, shardSize));
            }
        }
        const bufferSize = encoderBuffer.byteLength - bufferOffset;
        const paritySize = encoderParity.byteLength - parityOffset;
        const { sources, targets } = cacheBlock;
        ReedSolomon.encode(this._context, sources, targets, encoderBuffer, bufferOffset, bufferSize, encoderParity, parityOffset, paritySize, (error) => {
            if (error) {
                callback(error, {});
                return;
            }
            const recovered = [];
            for (const i of missingData) {
                recovered.push(encoderBuffer.slice(i * shardSize, (i + 1) * shardSize));
            }
            callback(undefined, { parity: recovered });
        });
    }
    release() {
        this._cacheBlockMap = undefined;
        this._completedGroups = undefined;
        this._context = undefined;
    }
}
exports.FecDecoder = FecDecoder;
