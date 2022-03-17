"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FecPacket = void 0;
class FecPacket {
    constructor(buff) {
        this.buff = buff;
    }
    seqId() {
        return this.buff.readUInt32LE();
    }
    flag() {
        return this.buff.readUInt16LE(4);
    }
    data() {
        return this.buff.slice(6);
    }
}
exports.FecPacket = FecPacket;
