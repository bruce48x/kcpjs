/// <reference types="node" />
import { EncodeCallback, EncodeResult } from './common';
export declare class FecEncoder {
    private readonly _dataShards;
    private readonly _parityShards;
    private readonly _shardSize;
    private readonly _paws;
    private _next;
    private _shardCount;
    private readonly _headerOffset;
    private readonly _payloadOffset;
    private _cacheBlock;
    private _context;
    private _encoderBuffer;
    private _encoderParity;
    private _encoderBufferInUse;
    private _encoderParityInUse;
    constructor(dataShards: number, parityShards: number, offset: number);
    private markData;
    private markParity;
    encodeAsync(buff: Buffer): Promise<EncodeResult>;
    encode(buff: Buffer, callback: EncodeCallback): void;
    private _encode;
    private acquireEncoderBuffer;
    private acquireEncoderParity;
    private releaseEncoderBuffer;
    private releaseEncoderParity;
    release(): void;
}
