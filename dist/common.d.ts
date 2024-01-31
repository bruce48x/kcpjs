/// <reference types="node" />
export declare const nonceSize = 16;
export declare const crcSize = 4;
export declare const cryptHeaderSize: number;
export declare const mtuLimit = 1400;
export declare const acceptBacklog = 128;
export declare const fecHeaderSize = 6;
export declare const fecHeaderSizePlus2: number;
export declare const typeData = 241;
export declare const typeParity = 242;
export declare const rxFECMulti = 3;
export interface CacheBlock {
    dataArr: Buffer[];
    parityArr: Buffer[];
    maxSize: number;
    sources: number;
    targets: number;
    numShards: number;
    numDataShards: number;
}
export interface EncodeResult {
    data?: Buffer[];
    parity?: Buffer[];
}
export type EncodeCallback = (err: any, result: EncodeResult) => void;
export declare function multiple8(len: number): number;
export declare function initCacheBlock(dataShards: number, parityShards: number): CacheBlock;
