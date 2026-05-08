/// <reference types="node" />
import { FecPacket } from './fecPacket';
import { EncodeCallback, EncodeResult } from './common';
export declare class FecElement extends FecPacket {
    ts: number;
    constructor(buff: Buffer, ts: number);
}
export declare class FecDecoder {
    private readonly _dataShards;
    private readonly _parityShards;
    private readonly _rxlimit;
    private readonly _shardSize;
    private readonly _maxCacheBlocks;
    private _cacheBlockMap;
    private _completedGroups;
    private _latestGroup;
    private _context;
    private _decoderBuffer;
    private _decoderParity;
    private _decoderBufferInUse;
    private _decoderParityInUse;
    constructor(_dataShards: number, _parityShards: number);
    decodeAsync(inData: FecPacket): Promise<EncodeResult>;
    decode(inData: FecPacket, callback: EncodeCallback): void;
    private trackGroup;
    private completeGroup;
    private _decode;
    private acquireDecoderBuffer;
    private acquireDecoderParity;
    private releaseDecoderBuffer;
    private releaseDecoderParity;
    release(): void;
}
