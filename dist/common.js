"use strict";
// const nonceSize = 16
// 4-bytes packet checksum
// const crcSize = 4
// overall crypto header size
// const cryptHeaderSize = nonceSize + crcSize
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCacheBlock = exports.multiple8 = exports.rxFECMulti = exports.typeParity = exports.typeData = exports.fecHeaderSizePlus2 = exports.fecHeaderSize = void 0;
// maximum packet size
// const mtuLimit = 1400
// accept backlog
// const acceptBacklog = 128
exports.fecHeaderSize = 6;
exports.fecHeaderSizePlus2 = exports.fecHeaderSize + 2; // plus 2B data size
exports.typeData = 0xf1;
exports.typeParity = 0xf2;
// const fecExpire = 60000
exports.rxFECMulti = 3; // FEC keeps rxFECMulti* (dataShard+parityShard) ordered packets in memory
function multiple8(len) {
    return Math.ceil(len / 8) * 8;
}
exports.multiple8 = multiple8;
function initCacheBlock(dataShards, parityShards) {
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
exports.initCacheBlock = initCacheBlock;
