/* eslint @typescript-eslint/no-var-requires: "off" */
import { FecPacket } from './fecPacket';
import {
    rxFECMulti,
    typeData,
    CacheBlock,
    EncodeCallback,
    multiple8,
    initCacheBlock,
    EncodeResult,
    fecHeaderSize,
} from './common';
const ReedSolomon = require('@ronomon/reed-solomon');

export class FecElement extends FecPacket {
    ts: number;
    constructor(buff: Buffer, ts: number) {
        super(buff);
        this.ts = ts;
    }
}

export class FecDecoder {
    private readonly _rxlimit: number; // queue size limit

    private readonly _shardSize: number;
    private readonly _maxCacheBlocks: number;
    private _cacheBlockMap: Map<number, CacheBlock>;
    private _completedGroups: Set<number>;
    private _latestGroup: number;

    // RS decoder
    private _context: any;

    constructor(
        private readonly _dataShards: number,
        private readonly _parityShards: number,
    ) {
        this._shardSize = this._dataShards + this._parityShards;
        this._rxlimit = rxFECMulti * this._shardSize;
        this._maxCacheBlocks = Math.max(1, Math.ceil(this._rxlimit / this._shardSize));
        this._context = ReedSolomon.create(this._dataShards, this._parityShards);
        this._cacheBlockMap = new Map();
        this._completedGroups = new Set();
        this._latestGroup = -1;
    }

    decodeAsync(inData: FecPacket): Promise<EncodeResult> {
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

    decode(inData: FecPacket, callback: EncodeCallback): void {
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
            this._cacheBlockMap.set(group, initCacheBlock(this._dataShards, this._parityShards));
        }

        const cacheBlock = this._cacheBlockMap.get(group);
        if (type === typeData) {
            const idx = seqId % this._shardSize;
            if (undefined === cacheBlock.dataArr[idx]) {
                cacheBlock.numShards++;
                cacheBlock.dataArr[idx] = inData.buff;
                cacheBlock.numDataShards++;

                cacheBlock.sources |= 1 << idx;
                cacheBlock.targets ^= 1 << idx;

                const sz = inData.buff.byteLength - fecHeaderSize;
                if (sz > cacheBlock.maxSize) {
                    cacheBlock.maxSize = sz;
                }
            }
        } else {
            const idx = seqId % this._shardSize;
            const parityIdx = idx - this._dataShards;
            if (undefined === cacheBlock.parityArr[parityIdx]) {
                cacheBlock.numShards++;
                cacheBlock.parityArr[parityIdx] = inData.buff;

                cacheBlock.sources |= 1 << idx;
                cacheBlock.targets ^= 1 << idx;

                const sz = inData.buff.byteLength - fecHeaderSize;
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
        } else {
            if (type === typeData) {
                const result = { data: [inData.buff.slice(fecHeaderSize)] };
                if (cacheBlock.numDataShards === this._dataShards) {
                    this.completeGroup(group);
                }
                callback(undefined, result);
            } else {
                callback(undefined, {});
            }
        }
    }

    private trackGroup(group: number): boolean {
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

    private completeGroup(group: number): void {
        this._cacheBlockMap.delete(group);
        this._completedGroups.add(group);
        this.trackGroup(this._latestGroup);
    }

    private _decode(cacheBlock: CacheBlock, callback: EncodeCallback): void {
        const bufferOffset = 0;
        const parityOffset = 0;

        // 把数据包补足为长度相同的 buffer
        const shardSize = multiple8(cacheBlock.maxSize);
        const encoderBuffer = Buffer.alloc(shardSize * this._dataShards);
        const missingData: number[] = [];
        for (let i = 0; i < this._dataShards; i++) {
            const buff = cacheBlock.dataArr[i]?.slice(fecHeaderSize);
            if (undefined === buff) {
                missingData.push(i);
            } else {
                buff.copy(encoderBuffer, i * shardSize, 0, Math.min(buff.byteLength, shardSize));
            }
        }

        const encoderParity = Buffer.alloc(shardSize * this._parityShards);
        for (let i = 0; i < this._parityShards; i++) {
            const buff = cacheBlock.parityArr[i]?.slice(fecHeaderSize);
            if (undefined !== buff) {
                buff.copy(encoderParity, i * shardSize, 0, Math.min(buff.byteLength, shardSize));
            }
        }

        const bufferSize = encoderBuffer.byteLength - bufferOffset;
        const paritySize = encoderParity.byteLength - parityOffset;

        const { sources, targets } = cacheBlock;

        ReedSolomon.encode(
            this._context,
            sources,
            targets,
            encoderBuffer,
            bufferOffset,
            bufferSize,
            encoderParity,
            parityOffset,
            paritySize,
            (error: any) => {
                if (error) {
                    callback(error, {});
                    return;
                }
                const recovered: Buffer[] = [];
                for (const i of missingData) {
                    recovered.push(encoderBuffer.slice(i * shardSize, (i + 1) * shardSize));
                }
                callback(undefined, { parity: recovered });
            },
        );
    }

    release() {
        this._cacheBlockMap = undefined;
        this._completedGroups = undefined;
        this._context = undefined;
    }
}
