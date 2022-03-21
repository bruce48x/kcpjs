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
    private _cacheBlockMap;
    private readonly _context;
    constructor(_dataShards: number, _parityShards: number);
    decodeAsync(inData: FecPacket): Promise<EncodeResult>;
    decode(inData: FecPacket, callback: EncodeCallback): void;
    private _decode;
}
