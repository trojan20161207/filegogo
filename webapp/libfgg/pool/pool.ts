import FileHash from "./hash"
import FileDigester from "../digester"
import streamSaver from 'streamsaver'
import { DataChunk } from "./data"

interface Meta {
  file: string
  type: string
  size: number
}

interface Hash {
  file: string
  hash: string
}

export default class Pool {
  // htmlDOMfile
  sender: File | null = null

  // https://developer.mozilla.org/en-US/docs/Web/API/WritableStream/getWriter
  recver: File | FileDigester | WritableStreamDefaultWriter | null = null

  fileHash: FileHash = new FileHash()

  meta: Meta | null = null
  hash: Hash | null = null

  doneCount: number = 0
  nextCount: number = 0

  OnFinish: () => void = () => {}
  OnProgress: (c :number) => void = (_) => {}

  // [safari] max-message-size: 64 * 1024
  // [chrome, firefox] max-message-size: 256 * 1024
  chunkSize: number = 32 * 1024

  currentSize: number = 0
  pendingSize: number = 0

  setSend(file: File) {
    this.sender = file
  }

  setRecv(file: File) {
    this.recver = file
  }

  recvMeta(meta: Meta) {
    let filename = meta.file
    if (meta.file.split("/").length > 0) {
      filename = String(meta.file.split("/").pop())
    }

    if (meta.size < 1024 * 1024 * 1024) {
      this.recver = new FileDigester({
        name: meta.file,
        size: meta.size,
        mime: meta.type,
      }, ()=>{})
    } else {
      this.recver = streamSaver.createWriteStream(filename, {
        size: meta.size,
        //mitm: meta.type
      }).getWriter()
    }

    this.meta = meta
  }

  sendMeta(): Meta {
    if (!this.sender) {
      throw "Not found sender file"
    }

    return {
      file: this.sender.name,
      type: this.sender.type,
      size: this.sender.size,
    }
  }

  sendHash(): Hash {
    if (!this.sender) {
      throw "Not found sender file"
    }

    return {
      file: this.sender.name,
      hash: this.fileHash.sum(),
    }
  }

  recvHash(hash: Hash): boolean {
    return hash.hash === this.fileHash.sum()
  }

  async sendData(c: DataChunk): Promise<ArrayBuffer> {
    if (!this.sender) {
      throw "Not found sender file"
    }

    const data = await this.sender.slice(c.offset, c.length).arrayBuffer()

    this.fileHash.onData(c, data)
    this.OnProgress(this.fileHash.offset)
    return data
  }

  async recvData(c: DataChunk, data: ArrayBuffer): Promise<void> {
    if (!this.recver) {
      throw "Not found recver file"
    }

    this.currentSize += c.length
    this.fileHash.onData(c, data)
    this.OnProgress(this.fileHash.offset)

    // TODO:
    // Need implement "WriteAt"
    //_, err := p.recver.WriteAt(data, c.Offset)
    // this.recver.W
  }

  next(): DataChunk | null {
    if (!this.meta) {
      throw "Not found recver file"
    }

    if (this.currentSize >= this.meta.size) {
      this.OnFinish()
      return null
    }

    if (this.pendingSize >= this.meta.size) {
      return null
    }

    let length = this.chunkSize
    const next = this.currentSize + this.chunkSize
    if (next > this.meta.size) {
      const n = next - this.meta.size
      length = this.chunkSize - n
    }

    const offset = this.pendingSize

    this.pendingSize += this.chunkSize
    return {
      offset: offset,
      length: length,
    }
  }
}
