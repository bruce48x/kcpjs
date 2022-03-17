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
        this._context = ReedSolomon.create(this._dataShards, this._parityShards);
        this._cacheBlockMap = {};
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
        // console.log('准备解码', inData);
        const seqId = inData.seqId();
        const type = inData.flag();
        const group = Math.floor(seqId / this._shardSize);
        if (undefined === this._cacheBlockMap[group]) {
            this._cacheBlockMap[group] = common_1.initCacheBlock(this._dataShards, this._parityShards);
        }
        // console.log('decode参数1', { seqId, group, type, buff: inData.buff })
        const cacheBlock = this._cacheBlockMap[group];
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
        // console.log('decode参数2', cacheBlock)
        if (cacheBlock.numDataShards < this._dataShards && cacheBlock.numShards >= this._dataShards) {
            this._decode(cacheBlock, callback);
        }
        else {
            if (type === common_1.typeData) {
                callback(undefined, { data: [inData.buff.slice(common_1.fecHeaderSize)] });
            }
            else {
                callback(undefined, {});
            }
        }
    }
    _decode(cacheBlock, callback) {
        const bufferOffset = 0;
        const parityOffset = 0;
        // 把数据包补足为长度相同的 buffer
        const shardSize = common_1.multiple8(cacheBlock.maxSize);
        const dataArr = [];
        for (let i = 0; i < this._dataShards; i++) {
            const buff = cacheBlock.dataArr[i]?.slice(common_1.fecHeaderSize);
            if (undefined === buff) {
                dataArr.push(Buffer.alloc(shardSize));
            }
            else if (buff.byteLength === shardSize) {
                dataArr.push(buff);
            }
            else {
                dataArr.push(Buffer.concat([buff, Buffer.alloc(shardSize - buff.byteLength)]));
            }
        }
        const parityArr = [];
        for (let i = 0; i < this._parityShards; i++) {
            const buff = cacheBlock.parityArr[i]?.slice(common_1.fecHeaderSize);
            if (undefined === buff) {
                parityArr.push(Buffer.alloc(shardSize));
            }
            else if (buff.byteLength === shardSize) {
                parityArr.push(buff);
            }
            else {
                parityArr.push(Buffer.concat([buff, Buffer.alloc(shardSize - buff.byteLength)]));
            }
        }
        const encoderBuffer = Buffer.concat(dataArr);
        const bufferSize = encoderBuffer.byteLength - bufferOffset;
        const encoderParity = Buffer.concat(parityArr);
        const paritySize = encoderParity.byteLength - parityOffset;
        const { sources, targets } = cacheBlock;
        // console.log('解码参数', { shardSize, encoderBuffer, bufferSize, encoderParity, paritySize, sources, targets })
        ReedSolomon.encode(this._context, sources, targets, encoderBuffer, bufferOffset, bufferSize, encoderParity, parityOffset, paritySize, (error) => {
            // Parity shards now contain parity data.
            const data = [];
            for (let i = 0; i < this._dataShards; i++) {
                const d = encoderBuffer.slice(i * shardSize, (1 + i) * shardSize);
                data.push(d);
            }
            const parity = [];
            for (let i = 0; i < this._parityShards; i++) {
                const p = encoderParity.slice(i * shardSize, (1 + i) * shardSize);
                parity.push(p);
            }
            callback(error, { data, parity });
        });
    }
}
exports.FecDecoder = FecDecoder;
