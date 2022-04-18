/* eslint @typescript-eslint/no-var-requires: "off" */
import {
    fecHeaderSize,
    typeData,
    typeParity,
    CacheBlock,
    EncodeCallback,
    multiple8,
    initCacheBlock,
    EncodeResult,
    fecHeaderSizePlus2,
} from './common';
const ReedSolomon = require('@ronomon/reed-solomon');

export class FecEncoder {
    private readonly _dataShards: number;
    private readonly _parityShards: number;
    private readonly _shardSize: number;

    private readonly _paws: number; // Protect Against Wrapped Sequence numbers
    private _next: number; // next seqid

    private _shardCount: number; // count the number of datashards collected

    private readonly _headerOffset: number; // FEC header offset
    private readonly _payloadOffset: number; // FEC payload offset

    // caches
    private _cacheBlock: CacheBlock;

    // RS encoder
    private readonly _context: any;

    constructor(dataShards: number, parityShards: number, offset: number) {
        if (dataShards <= 0 || parityShards <= 0) {
            dataShards = 8;
            parityShards = 2;
        }
        this._dataShards = dataShards;
        this._parityShards = parityShards;
        this._shardSize = dataShards + parityShards;
        this._paws = Math.floor(0xffffffff / this._shardSize) * this._shardSize;
        this._headerOffset = offset;
        this._payloadOffset = this._headerOffset + fecHeaderSize;

        this._context = ReedSolomon.create(dataShards, parityShards);
        this._cacheBlock = initCacheBlock(dataShards, parityShards);

        this._shardCount = 0;
        this._next = 0;
    }

    private markData(data: Buffer): void {
        data.writeUInt32LE(this._next, this._headerOffset);
        data.writeUInt16LE(typeData, this._headerOffset + 4);
        this._next++;
    }

    private markParity(data: Buffer): void {
        data.writeUInt32LE(this._next, this._headerOffset);
        data.writeUInt16LE(typeParity, this._headerOffset + 4);
        // sequence wrap will only happen at parity shard
        this._next = (this._next + 1) % this._paws;
    }

    encodeAsync(buff: Buffer): Promise<EncodeResult> {
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

    encode(buff: Buffer, callback: EncodeCallback): void {
        // The header format:
        // | FEC SEQID(4B) | FEC TYPE(2B) | SIZE (2B) | PAYLOAD(SIZE-2) |
        // |<-headerOffset                |<-payloadOffset

        this.markData(buff);
        const len = buff.slice(this._headerOffset + fecHeaderSizePlus2).byteLength;
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
            this._cacheBlock = initCacheBlock(this._dataShards, this._parityShards);
            this._encode(cacheBlock, buff, callback);

            // counters resetting
            this._shardCount = 0;
        } else {
            callback(undefined, { data: [buff] });
        }
    }

    private _encode(cacheBlock: CacheBlock, buff: Buffer, callback: EncodeCallback): void {
        const bufferOffset = 0;
        // const bufferOffset = this._headerOffset;
        const parityOffset = 0;

        // 把数据包补足为长度相同的 buffer
        const shardSize = multiple8(cacheBlock.maxSize);
        const dataArr: Buffer[] = [];
        for (const buff of cacheBlock.dataArr) {
            const dataBuff = buff.slice(this._payloadOffset);
            if (dataBuff.byteLength === shardSize) {
                dataArr.push(buff);
            } else {
                dataArr.push(Buffer.concat([dataBuff, Buffer.alloc(shardSize - dataBuff.byteLength)]));
            }
        }

        const encoderBuffer: Buffer = Buffer.concat(dataArr);
        const bufferSize = encoderBuffer.byteLength;
        const paritySize = shardSize * this._parityShards;
        const encoderParity: Buffer = Buffer.alloc(paritySize);

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
                const parity: Buffer[] = [];
                for (let i = 0; i < this._parityShards; i++) {
                    const p = Buffer.concat([Buffer.alloc(6), encoderParity.slice(i * shardSize, (1 + i) * shardSize)]);
                    this.markParity(p);
                    parity.push(p);
                }
                callback(error, { data: [buff], parity });
            },
        );
    }
}
