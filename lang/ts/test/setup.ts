// @ts-nocheck
import { compare as compareBinary } from '../src/binary.ts';

const originalIsBuffer = Buffer.isBuffer;
Buffer.isBuffer = function (value) {
  return originalIsBuffer(value) || value instanceof Uint8Array;
};

const originalBufferEquals = Buffer.prototype.equals;
Buffer.prototype.equals = function (other) {
  if (other instanceof Uint8Array && !Buffer.isBuffer(other)) {
    return originalBufferEquals.call(this, Buffer.from(other));
  }
  return originalBufferEquals.call(this, other);
};

const originalBufferCompare = Buffer.compare;
Buffer.compare = function (a, b) {
  var bufA = a instanceof Uint8Array && !Buffer.isBuffer(a) ? Buffer.from(a) : a;
  var bufB = b instanceof Uint8Array && !Buffer.isBuffer(b) ? Buffer.from(b) : b;
  return originalBufferCompare(bufA, bufB);
};

if (!(Uint8Array.prototype).equals) {
  Object.defineProperty(Uint8Array.prototype, 'equals', {
    value: function (other) {
      if (!(other instanceof Uint8Array)) {
        other = Buffer.from(other);
      }
      return compareBinary(this, other) === 0;
    },
    configurable: true
  });
}

if (!(Uint8Array.prototype).compare) {
  Object.defineProperty(Uint8Array.prototype, 'compare', {
    value: function (other) {
      if (!(other instanceof Uint8Array)) {
        other = Buffer.from(other);
      }
      return compareBinary(this, other);
    },
    configurable: true
  });
}

if (!(Uint8Array.prototype).readInt32LE) {
  Object.defineProperty(Uint8Array.prototype, 'readInt32LE', {
    value: function (offset = 0) {
      return new DataView(this.buffer, this.byteOffset, this.byteLength).getInt32(offset, true);
    },
    configurable: true
  });
}

if (!(Uint8Array.prototype).writeInt32LE) {
  Object.defineProperty(Uint8Array.prototype, 'writeInt32LE', {
    value: function (value, offset = 0) {
      new DataView(this.buffer, this.byteOffset, this.byteLength).setInt32(offset, value, true);
    },
    configurable: true
  });
}

if (!(Uint8Array.prototype).toStringWithEncoding) {
  Object.defineProperty(Uint8Array.prototype, 'toString', {
    value: function (encoding) {
      if (!encoding || encoding === 'utf8') {
        return new TextDecoder().decode(this);
      }
      if (encoding === 'binary') {
        return Array.from(this, (byte) => String.fromCharCode(byte & 0xff)).join('');
      }
      if (encoding === 'hex') {
        return Array.from(this, (byte) => byte.toString(16).padStart(2, '0')).join('');
      }
      if (encoding === 'base64') {
        if (typeof btoa === 'function') {
          let binary = Array.from(this, (byte) => String.fromCharCode(byte)).join('');
          return btoa(binary);
        }
        return Buffer.from(this).toString('base64');
      }
      return Array.prototype.toString.call(this);
    },
    configurable: true
  });
}

if (!(Uint8Array.prototype).toJSON) {
  Object.defineProperty(Uint8Array.prototype, 'toJSON', {
    value: function () {
      return { type: 'Buffer', data: Array.from(this) };
    },
    configurable: true
  });
}
