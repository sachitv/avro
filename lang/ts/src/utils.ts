/**
 *  Licensed to the Apache Software Foundation (ASF) under one
 *  or more contributor license agreements.  See the NOTICE file
 *  distributed with this work for additional information
 *  regarding copyright ownership.  The ASF licenses this file
 *  to you under the Apache License, Version 2.0 (the
 *  "License"); you may not use this file except in compliance
 *  with the License.  You may obtain a copy of the License at
 *
 *  https://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

import { hashString } from './hash.ts';
import {
  BinaryBuffer,
  alloc,
  binaryWrite,
  byteLength as binaryByteLength,
  compare as compareBinary,
  copy as copyBinary,
  fill as fillBinary,
  readDoubleLE,
  readFloatLE,
  readUIntLE,
  utf8Slice,
  utf8Write,
  writeDoubleLE,
  writeFloatLE
} from './binary.ts';


/**
 * Uppercase the first letter of a string.
 *
 * @param s {String} The string.
 *
 */
function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

/**
 * Compare two numbers.
 *
 * @param n1 {Number} The first one.
 * @param n2 {Number} The second one.
 *
 */
function compare(n1: number, n2: number): number { return n1 === n2 ? 0 : (n1 < n2 ? -1 : 1); }

/**
 * Compute a string's hash.
 *
 * @param str {String} The string to hash.
 * @param algorithm {String} The algorithm used. Defaults to MD5.
 *
 */
function getHash(str: string, algorithm?: string): BinaryBuffer {
  return hashString(str, algorithm);
}

/**
 * Find index of value in array.
 *
 * @param arr {Array} Can also be a false-ish value.
 * @param v {Object} Value to find.
 *
 * Returns -1 if not found, -2 if found multiple times.
 *
 */
function singleIndexOf<T>(arr: T[] | null | undefined, v: T): number {
  var pos = -1;
  var i, l;
  if (!arr) {
    return -1;
  }
  for (i = 0, l = arr.length; i < l; i++) {
    if (arr[i] === v) {
      if (pos >= 0) {
        return -2;
      }
      pos = i;
    }
  }
  return pos;
}

/**
 * Convert array to map.
 *
 * @param arr {Array} Elements.
 * @param fn {Function} Function returning an element's key.
 *
 */
function toMap<T>(arr: T[], fn: (item: T) => string): Record<string, T> {
  var obj: Record<string, T> = {};
  var i, elem;
  for (i = 0; i < arr.length; i++) {
    elem = arr[i];
    obj[fn(elem)] = elem;
  }
  return obj;
}

/**
 * Check whether an array has duplicates.
 *
 * @param arr {Array} The array.
 * @param fn {Function} Optional function to apply to each element.
 *
 */
function hasDuplicates<T>(arr: T[], fn?: (item: T) => string | number): boolean {
  var obj: Record<string, boolean> = {};
  var i, l, elem;
  for (i = 0, l = arr.length; i < l; i++) {
    elem = arr[i];
    const key = fn ? String(fn(elem)) : String(elem);
    if (obj[key]) {
      return true;
    }
    obj[key] = true;
  }
  return false;
}

/**
 * "Abstract" function to help with "subclassing".
 *
 */
function abstractFunction(): never { throw new Error('abstract'); }

/**
 * Generator of random things.
 *
 * Inspired by: https://stackoverflow.com/a/424445/1062617
 *
 */
class Lcg {
  private readonly _max: number;
  private _state: number;

  constructor(seed?: number) {
    var a = 1103515245;
    var c = 12345;
    var m = Math.pow(2, 31);
    this._max = m;
    this._state = Math.floor(seed || Math.random() * (m - 1));
    this._advance = () => {
      this._state = (a * this._state + c) % m;
      return this._state;
    };
  }

  private readonly _advance: () => number;

  nextBoolean(): boolean {
    return !!(this._advance() % 2);
  }

  nextInt(start: number, end?: number): number {
    if (end === undefined) {
      end = start;
      start = 0;
    }
    end = end === undefined ? this._max : end;
    return start + Math.floor(this.nextFloat(0, 1) * (end - start));
  }

  nextFloat(start?: number, end?: number): number {
    if (end === undefined) {
      end = start;
      start = 0;
    }
    var upper = end === undefined ? 1 : end;
    var lower = start === undefined ? 0 : start;
    return lower + ((upper - lower) * this._advance()) / this._max;
  }

  nextString(len: number, flags?: string): string {
    len |= 0;
    flags = flags || 'aA';
    var mask = '';
    if (flags.indexOf('a') > -1) {
      mask += 'abcdefghijklmnopqrstuvwxyz';
    }
    if (flags.indexOf('A') > -1) {
      mask += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }
    if (flags.indexOf('#') > -1) {
      mask += '0123456789';
    }
    if (flags.indexOf('!') > -1) {
      mask += '~`!@#$%^&*()_+-={}[]:";\'<>?,./|\\';
    }
    if (!mask) {
      return '';
    }
    var result = [];
    for (var i = 0; i < len; i++) {
      result.push(this.choice(mask));
    }
    return result.join('');
  }

  nextBuffer(len: number): BinaryBuffer {
    var arr = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      arr[i] = this.nextInt(256);
    }
    return arr;
  }

  choice<T>(arr: ArrayLike<T>): T {
    var len = arr.length;
    if (!len) {
      throw new Error('choosing from empty array');
    }
    return arr[this.nextInt(len)] as T;
  }
}

/**
 * Ordered queue which returns items consecutively.
 *
 * This is actually a heap by index, with the added requirements that elements
 * can only be retrieved consecutively.
 *
 */
type OrderedItem = { index: number } & Record<string, unknown>;

class OrderedQueue<T extends OrderedItem = OrderedItem> {
  private _index = 0;
  private readonly _items: T[] = [];

  push(item: T): void {
    var items = this._items;
    var i = items.length | 0;
    var j;
    items.push(item);
    while (i > 0 && items[i].index < items[(j = (i - 1) >> 1)].index) {
      var current = items[i];
      items[i] = items[j];
      items[j] = current;
      i = j;
    }
  }

  pop(): T | null {
    var items = this._items;
    var len = (items.length - 1) | 0;
    var first = items[0];
    if (!first || first.index > this._index) {
      return null;
    }
    this._index++;
    if (!len) {
      items.pop();
      return first;
    }
    items[0] = items.pop() as T;
    var mid = len >> 1;
    var i = 0;
    var i1, i2, j, item, c, c1, c2;
    while (i < mid) {
      item = items[i];
      i1 = (i << 1) + 1;
      i2 = (i + 1) << 1;
      c1 = items[i1];
      c2 = items[i2];
      if (!c2 || (c1 && c1.index <= c2.index)) {
        c = c1;
        j = i1;
      } else {
        c = c2;
        j = i2;
      }
      if (!c || c.index >= item.index) {
        break;
      }
      items[j] = item;
      items[i] = c;
      i = j;
    }
    return first;
  }
}

/**
 * A tap is a buffer which remembers what has been already read.
 *
 * It is optimized for performance, at the cost of failing silently when
 * overflowing the buffer. This is a purposeful trade-off given the expected
 * rarity of this case and the large performance hit necessary to enforce
 * validity. See `isValid` below for more information.
 *
 */
function Tap(this: { buf: BinaryBuffer; pos: number }, buf: BinaryBuffer, pos?: number) {
  this.buf = buf;
  this.pos = pos | 0;
}

/**
 * Check that the tap is in a valid state.
 *
 * For efficiency reasons, none of the methods below will fail if an overflow
 * occurs (either read, skip, or write). For this reason, it is up to the
 * caller to always check that the read, skip, or write was valid by calling
 * this method.
 *
 */
Tap.prototype.isValid = function () { return this.pos <= this.buf.length; };

/**
 * Returns the contents of the tap up to the current position.
 *
 */
Tap.prototype.getValue = function () { return this.buf.slice(0, this.pos); };

// Read, skip, write methods.
//
// These should fail silently when the buffer overflows. Note this is only
// required to be true when the functions are decoding valid objects. For
// example errors will still be thrown if a bad count is read, leading to a
// negative position offset (which will typically cause a failure in
// `readFixed`).

Tap.prototype.readBoolean = function () { return !!this.buf[this.pos++]; };

Tap.prototype.skipBoolean = function () { this.pos++; };

Tap.prototype.writeBoolean = function (b) { this.buf[this.pos++] = !!b; };

Tap.prototype.readInt = Tap.prototype.readLong = function () {
  var n = 0;
  var k = 0;
  var buf = this.buf;
  var b, h, f, fk;

  do {
    b = buf[this.pos++];
    h = b & 0x80;
    n |= (b & 0x7f) << k;
    k += 7;
  } while (h && k < 28);

  if (h) {
    // Switch to float arithmetic, otherwise we might overflow.
    f = n;
    fk = 268435456; // 2 ** 28.
    do {
      b = buf[this.pos++];
      f += (b & 0x7f) * fk;
      fk *= 128;
    } while (b & 0x80);
    return (f % 2 ? -(f + 1) : f) / 2;
  }

  return (n >> 1) ^ -(n & 1);
};

Tap.prototype.skipInt = Tap.prototype.skipLong = function () {
  var buf = this.buf;
  while (buf[this.pos++] & 0x80) {}
};

Tap.prototype.writeInt = Tap.prototype.writeLong = function (n) {
  var buf = this.buf;
  var f, m;

  if (n >= -1073741824 && n < 1073741824) {
    // Won't overflow, we can use integer arithmetic.
    m = n >= 0 ? n << 1 : (~n << 1) | 1;
    do {
      buf[this.pos] = m & 0x7f;
      m >>= 7;
    } while (m && (buf[this.pos++] |= 0x80));
  } else {
    // We have to use slower floating arithmetic.
    f = n >= 0 ? n * 2 : (-n * 2) - 1;
    do {
      buf[this.pos] = f & 0x7f;
      f /= 128;
    } while (f >= 1 && (buf[this.pos++] |= 0x80));
  }
  this.pos++;
};

Tap.prototype.readFloat = function () {
  var buf = this.buf;
  var pos = this.pos;
  this.pos += 4;
  if (this.pos > buf.length) {
    return;
  }
  return readFloatLE(buf, pos);
};

Tap.prototype.skipFloat = function () { this.pos += 4; };

Tap.prototype.writeFloat = function (f) {
  var buf = this.buf;
  var pos = this.pos;
  this.pos += 4;
  if (this.pos > buf.length) {
    return;
  }
  writeFloatLE(buf, f, pos);
};

Tap.prototype.readDouble = function () {
  var buf = this.buf;
  var pos = this.pos;
  this.pos += 8;
  if (this.pos > buf.length) {
    return;
  }
  return readDoubleLE(buf, pos);
};

Tap.prototype.skipDouble = function () { this.pos += 8; };

Tap.prototype.writeDouble = function (d) {
  var buf = this.buf;
  var pos = this.pos;
  this.pos += 8;
  if (this.pos > buf.length) {
    return;
  }
  writeDoubleLE(buf, d, pos);
};

Tap.prototype.readFixed = function (len) {
  var pos = this.pos;
  this.pos += len;
  if (this.pos > this.buf.length) {
    return;
  }
  var fixed = alloc(len);
  copyBinary(this.buf, fixed, 0, pos, pos + len);
  return fixed;
};

Tap.prototype.skipFixed = function (len) { this.pos += len; };

Tap.prototype.writeFixed = function (buf, len) {
  len = len || buf.length;
  var pos = this.pos;
  this.pos += len;
  if (this.pos > this.buf.length) {
    return;
  }
  copyBinary(buf, this.buf, pos, 0, len);
};

Tap.prototype.readBytes = function () {
  return this.readFixed(this.readLong());
};

Tap.prototype.skipBytes = function () {
  var len = this.readLong();
  this.pos += len;
};

Tap.prototype.writeBytes = function (buf) {
  var len = buf.length;
  this.writeLong(len);
  this.writeFixed(buf, len);
};

Tap.prototype.readString = function () {
  var len = this.readLong();
  var pos = this.pos;
  var buf = this.buf;
  this.pos += len;
  if (this.pos > buf.length) {
    return;
  }
  return utf8Slice(buf, pos, pos + len);
};

Tap.prototype.skipString = function () {
  var len = this.readLong();
  this.pos += len;
};

Tap.prototype.writeString = function (s) {
  var len = binaryByteLength(s);
  this.writeLong(len);
  var pos = this.pos;
  this.pos += len;
  if (this.pos > this.buf.length) {
    return;
  }
  utf8Write(this.buf, s, pos, len);
};

// Helper used to speed up writing defaults.

Tap.prototype.writeBinary = function (str, len) {
  var pos = this.pos;
  this.pos += len;
  if (this.pos > this.buf.length) {
    return;
  }
  binaryWrite(this.buf, str, pos, len);
};

// Binary comparison methods.
//
// These are not guaranteed to consume the objects they are comparing when
// returning a non-zero result (allowing for performance benefits), so no other
// operations should be done on either tap after a compare returns a non-zero
// value. Also, these methods do not have the same silent failure requirement
// as read, skip, and write since they are assumed to be called on valid
// buffers.

Tap.prototype.matchBoolean = function (tap) {
  return this.buf[this.pos++] - tap.buf[tap.pos++];
};

Tap.prototype.matchInt = Tap.prototype.matchLong = function (tap) {
  var n1 = this.readLong();
  var n2 = tap.readLong();
  return n1 === n2 ? 0 : (n1 < n2 ? -1 : 1);
};

Tap.prototype.matchFloat = function (tap) {
  var n1 = this.readFloat();
  var n2 = tap.readFloat();
  return n1 === n2 ? 0 : (n1 < n2 ? -1 : 1);
};

Tap.prototype.matchDouble = function (tap) {
  var n1 = this.readDouble();
  var n2 = tap.readDouble();
  return n1 === n2 ? 0 : (n1 < n2 ? -1 : 1);
};

Tap.prototype.matchFixed = function (tap, len) {
  var b1 = this.readFixed(len);
  var b2 = tap.readFixed(len);
  if (!b1 || !b2) {
    return 0;
  }
  return compareBinary(b1, b2);
};

Tap.prototype.matchBytes = Tap.prototype.matchString = function (tap) {
  var l1 = this.readLong();
  var p1 = this.pos;
  this.pos += l1;
  var l2 = tap.readLong();
  var p2 = tap.pos;
  tap.pos += l2;
  var b1 = this.buf.slice(p1, this.pos);
  var b2 = tap.buf.slice(p2, tap.pos);
  return compareBinary(b1, b2);
};

// Functions for supporting custom long classes.
//
// The two following methods allow the long implementations to not have to
// worry about Avro's zigzag encoding, we directly expose longs as unpacked.

Tap.prototype.unpackLongBytes = function () {
  var res = alloc(8);
  var n = 0;
  var i = 0; // Byte index in target buffer.
  var j = 6; // Bit offset in current target buffer byte.
  var buf = this.buf;
  var b, neg;

  b = buf[this.pos++];
  neg = b & 1;
  fillBinary(res, 0);

  n |= (b & 0x7f) >> 1;
  while (b & 0x80) {
    b = buf[this.pos++];
    n |= (b & 0x7f) << j;
    j += 7;
    if (j >= 8) {
      // Flush byte.
      j -= 8;
      res[i++] = n;
      n >>= 8;
    }
  }
  res[i] = n;

  if (neg) {
    invert(res, 8);
  }

  return res;
};

Tap.prototype.packLongBytes = function (buf) {
  var neg = (buf[7] & 0x80) >> 7;
  var res = this.buf;
  var j = 1;
  var k = 0;
  var m = 3;
  var n;

  if (neg) {
    invert(buf, 8);
    n = 1;
  } else {
    n = 0;
  }

  var parts = [
    readUIntLE(buf, 0, 3),
    readUIntLE(buf, 3, 3),
    readUIntLE(buf, 6, 2)
  ];
  // Not reading more than 24 bits because we need to be able to combine the
  // "carry" bits from the previous part and JavaScript only supports bitwise
  // operations on 32 bit integers.
  while (m && !parts[--m]) {} // Skip trailing 0s.

  // Leading parts (if any), we never bail early here since we need the
  // continuation bit to be set.
  while (k < m) {
    n |= parts[k++] << j;
    j += 24;
    while (j > 7) {
      res[this.pos++] = (n & 0x7f) | 0x80;
      n >>= 7;
      j -= 7;
    }
  }

  // Final part, similar to normal packing aside from the initial offset.
  n |= parts[m] << j;
  do {
    res[this.pos] = n & 0x7f;
    n >>= 7;
  } while (n && (res[this.pos++] |= 0x80));
  this.pos++;

  // Restore original buffer (could make this optional?).
  if (neg) {
    invert(buf, 8);
  }
};

// Helpers.

/**
 * Invert all bits in a binary buffer.
 *
 * @param buf {BinaryBuffer} Non-empty buffer to invert.
 * @param len {Number} Buffer length (must be positive).
 *
 */
function invert(buf, len) {
  while (len--) {
    buf[len] = ~buf[len];
  }
}


export {
  abstractFunction,
  capitalize,
  compare,
  getHash,
  toMap,
  singleIndexOf,
  hasDuplicates,
  Lcg,
  OrderedQueue,
  Tap
};
