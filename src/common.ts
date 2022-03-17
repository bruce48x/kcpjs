// const nonceSize = 16
// 4-bytes packet checksum
// const crcSize = 4
// overall crypto header size
// const cryptHeaderSize = nonceSize + crcSize

// maximum packet size
// const mtuLimit = 1400

// accept backlog
// const acceptBacklog = 128

export const fecHeaderSize = 6;
export const fecHeaderSizePlus2 = fecHeaderSize + 2; // plus 2B data size
export const typeData = 0xf1;
export const typeParity = 0xf2;
// const fecExpire = 60000
export const rxFECMulti = 3; // FEC keeps rxFECMulti* (dataShard+parityShard) ordered packets in memory

export interface CacheBlock {
    dataArr: Buffer[];
    parityArr: Buffer[];
    maxSize: number; // track maximum data length in datashard
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

export function multiple8(len: number): number {
    return Math.ceil(len / 8) * 8;
}

export function initCacheBlock(dataShards: number, parityShards: number): CacheBlock {
    const shardSize = dataShards + parityShards;
    const sources = 0;
    let targets = 0;
    for (let i = 0; i < shardSize; i++) {
        targets |= 1 << i;
    }
    return {
        dataArr: [],
        parityArr: [],
        maxSize: 0,
        sources,
        targets,
        numShards: 0,
        numDataShards: 0,
    };
}
