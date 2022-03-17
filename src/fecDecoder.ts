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
    private _cacheBlockMap: { [group: string]: CacheBlock };

    // RS decoder
    private readonly _context: any;

    constructor(private readonly _dataShards: number, private readonly _parityShards: number) {
        this._shardSize = this._dataShards + this._parityShards;
        this._rxlimit = rxFECMulti * this._shardSize;
        this._context = ReedSolomon.create(this._dataShards, this._parityShards);
        this._cacheBlockMap = {};
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
        // console.log('准备解码', inData);
        const seqId = inData.seqId();
        const type = inData.flag();
        const group = Math.floor(seqId / this._shardSize);
        if (undefined === this._cacheBlockMap[group]) {
            this._cacheBlockMap[group] = initCacheBlock(this._dataShards, this._parityShards);
        }

        // console.log('decode参数1', { seqId, group, type, buff: inData.buff })

        const cacheBlock = this._cacheBlockMap[group];
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

        // console.log('decode参数2', cacheBlock)
        if (cacheBlock.numDataShards < this._dataShards && cacheBlock.numShards >= this._dataShards) {
            this._decode(cacheBlock, callback);
        } else {
            if (type === typeData) {
                callback(undefined, { data: [inData.buff.slice(fecHeaderSize)] });
            } else {
                callback(undefined, {});
            }
        }
    }

    private _decode(cacheBlock: CacheBlock, callback: EncodeCallback): void {
        const bufferOffset = 0;
        const parityOffset = 0;

        // 把数据包补足为长度相同的 buffer
        const shardSize = multiple8(cacheBlock.maxSize);
        const dataArr: Buffer[] = [];
        for (let i = 0; i < this._dataShards; i++) {
            const buff = cacheBlock.dataArr[i]?.slice(fecHeaderSize);
            if (undefined === buff) {
                dataArr.push(Buffer.alloc(shardSize));
            } else if (buff.byteLength === shardSize) {
                dataArr.push(buff);
            } else {
                dataArr.push(Buffer.concat([buff, Buffer.alloc(shardSize - buff.byteLength)]));
            }
        }

        const parityArr: Buffer[] = [];
        for (let i = 0; i < this._parityShards; i++) {
            const buff = cacheBlock.parityArr[i]?.slice(fecHeaderSize);
            if (undefined === buff) {
                parityArr.push(Buffer.alloc(shardSize));
            } else if (buff.byteLength === shardSize) {
                parityArr.push(buff);
            } else {
                parityArr.push(Buffer.concat([buff, Buffer.alloc(shardSize - buff.byteLength)]));
            }
        }

        const encoderBuffer: Buffer = Buffer.concat(dataArr);
        const bufferSize = encoderBuffer.byteLength - bufferOffset;
        const encoderParity: Buffer = Buffer.concat(parityArr);
        const paritySize = encoderParity.byteLength - parityOffset;

        const { sources, targets } = cacheBlock;
        // console.log('解码参数', { shardSize, encoderBuffer, bufferSize, encoderParity, paritySize, sources, targets })

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
                // Parity shards now contain parity data.
                const data: Buffer[] = [];
                for (let i = 0; i < this._dataShards; i++) {
                    const d = encoderBuffer.slice(i * shardSize, (1 + i) * shardSize);
                    data.push(d);
                }
                const parity: Buffer[] = [];
                for (let i = 0; i < this._parityShards; i++) {
                    const p = encoderParity.slice(i * shardSize, (1 + i) * shardSize);
                    parity.push(p);
                }
                callback(error, { data, parity });
            },
        );
    }
}
