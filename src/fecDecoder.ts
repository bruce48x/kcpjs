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
    private _decoderBuffer: Buffer;
    private _decoderParity: Buffer;
    private _decoderBufferInUse: boolean;
    private _decoderParityInUse: boolean;

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
        this._decoderBufferInUse = false;
        this._decoderParityInUse = false;
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
        const bufferSize = shardSize * this._dataShards;
        const paritySize = shardSize * this._parityShards;
        const decoderBufferWork = this.acquireDecoderBuffer(bufferSize);
        const decoderParityWork = this.acquireDecoderParity(paritySize);
        const encoderBuffer = decoderBufferWork.buffer;
        const encoderParity = decoderParityWork.buffer;

        encoderBuffer.fill(0, 0, bufferSize);
        encoderParity.fill(0, 0, paritySize);
        const missingData: number[] = [];
        for (let i = 0; i < this._dataShards; i++) {
            const buff = cacheBlock.dataArr[i]?.slice(fecHeaderSize);
            if (undefined === buff) {
                missingData.push(i);
            } else {
                buff.copy(encoderBuffer, i * shardSize, 0, Math.min(buff.byteLength, shardSize));
            }
        }

        for (let i = 0; i < this._parityShards; i++) {
            const buff = cacheBlock.parityArr[i]?.slice(fecHeaderSize);
            if (undefined !== buff) {
                buff.copy(encoderParity, i * shardSize, 0, Math.min(buff.byteLength, shardSize));
            }
        }

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
                    this.releaseDecoderBuffer(decoderBufferWork.pooled);
                    this.releaseDecoderParity(decoderParityWork.pooled);
                    callback(error, {});
                    return;
                }
                const recovered: Buffer[] = [];
                for (const i of missingData) {
                    recovered.push(Buffer.from(encoderBuffer.subarray(i * shardSize, (i + 1) * shardSize)));
                }
                this.releaseDecoderBuffer(decoderBufferWork.pooled);
                this.releaseDecoderParity(decoderParityWork.pooled);
                callback(undefined, { parity: recovered });
            },
        );
    }

    private acquireDecoderBuffer(size: number): { buffer: Buffer; pooled: boolean } {
        if (!this._decoderBufferInUse) {
            if (!this._decoderBuffer || this._decoderBuffer.byteLength < size) {
                this._decoderBuffer = Buffer.allocUnsafe(size);
            }
            this._decoderBufferInUse = true;
            return { buffer: this._decoderBuffer, pooled: true };
        }
        return { buffer: Buffer.allocUnsafe(size), pooled: false };
    }

    private acquireDecoderParity(size: number): { buffer: Buffer; pooled: boolean } {
        if (!this._decoderParityInUse) {
            if (!this._decoderParity || this._decoderParity.byteLength < size) {
                this._decoderParity = Buffer.allocUnsafe(size);
            }
            this._decoderParityInUse = true;
            return { buffer: this._decoderParity, pooled: true };
        }
        return { buffer: Buffer.allocUnsafe(size), pooled: false };
    }

    private releaseDecoderBuffer(pooled: boolean): void {
        if (pooled) {
            this._decoderBufferInUse = false;
        }
    }

    private releaseDecoderParity(pooled: boolean): void {
        if (pooled) {
            this._decoderParityInUse = false;
        }
    }

    release() {
        this._cacheBlockMap = undefined;
        this._completedGroups = undefined;
        this._decoderBuffer = undefined;
        this._decoderParity = undefined;
        this._decoderBufferInUse = false;
        this._decoderParityInUse = false;
        this._context = undefined;
    }
}
