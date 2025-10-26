import { inflateRaw as pakoInflateRaw, deflateRaw as pakoDeflateRaw } from 'pako';
import { Buffer } from './buffer.js';

/**
 * Browser implementation of zlib raw inflate/deflate using pako.
 */

function toUint8Array(buf) {
  if (buf instanceof Uint8Array) {
    return buf;
  }
  if (ArrayBuffer.isView(buf)) {
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  return new Uint8Array(buf);
}

export function inflateRaw(buf, cb) {
  try {
    var result = pakoInflateRaw(toUint8Array(buf));
    cb(null, Buffer.from(result));
  } catch (err) {
    cb(err);
  }
}

export function deflateRaw(buf, cb) {
  try {
    var result = pakoDeflateRaw(toUint8Array(buf));
    cb(null, Buffer.from(result));
  } catch (err) {
    cb(err);
  }
}

export default {
  inflateRaw,
  deflateRaw
};
