export class FecPacket {
    buff: Buffer;

    constructor(buff: Buffer) {
        this.buff = buff;
    }

    seqId(): number {
        return this.buff.readUInt32LE();
    }

    flag(): number {
        return this.buff.readUInt16LE(4);
    }

    data(): Buffer {
        return this.buff.slice(6);
    }
}
