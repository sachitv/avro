/*
 *  Licensed to the Apache Software Foundation (ASF) under one or more
 *  contributor license agreements.  See the NOTICE file distributed with
 *  this work for additional information regarding copyright ownership.
 *  The ASF licenses this file to you under the Apache License, Version 2.0
 *  (the "License"); you may not use this file except in compliance with
 *  the License.  You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type BinaryBuffer = Uint8Array;

export function alloc(size: number): BinaryBuffer {
  return new Uint8Array(size);
}

export function allocUnsafeSlow(size: number): BinaryBuffer {
  // Uint8Array is zero-filled by default; this mirrors Buffer's semantics closely enough
  return new Uint8Array(size);
}

export type BinaryEncoding = 'utf8' | 'binary' | 'base64';

export function from(
  input:
    | string
    | ArrayBuffer
    | ArrayLike<number>
    | BinaryBuffer
    | { data: ArrayLike<number>; type?: string },
  encoding: BinaryEncoding = 'utf8'
): BinaryBuffer {
  if (input instanceof Uint8Array) {
    return new Uint8Array(input);
  }
  if (typeof input === 'string') {
    switch (encoding) {
      case 'utf8':
        return textEncoder.encode(input);
      case 'binary':
        return fromBinaryString(input);
      case 'base64':
        return fromBase64(input);
      default:
        throw new TypeError(`Unsupported encoding: ${encoding}`);
    }
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input.slice(0));
  }
  if (Array.isArray(input)) {
    return new Uint8Array(input);
  }
  if (isArrayLike<number>(input)) {
    return new Uint8Array(input as ArrayLike<number>);
  }
  if (input && typeof input === 'object' && 'data' in input) {
    const data = (input as { data: ArrayLike<number> }).data;
    return new Uint8Array(Array.from(data));
  }
  throw new TypeError('Unsupported input type for binary buffer creation');
}

export function isBinary(value: unknown): value is BinaryBuffer {
  return value instanceof Uint8Array;
}

export function compare(a: BinaryBuffer, b: BinaryBuffer): number {
  if (a === b) {
    return 0;
  }
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = a[i] - b[i];
    if (diff !== 0) {
      return diff < 0 ? -1 : 1;
    }
  }
  if (a.length === b.length) {
    return 0;
  }
  return a.length < b.length ? -1 : 1;
}

export function copy(
  source: BinaryBuffer,
  target: BinaryBuffer,
  targetStart = 0,
  sourceStart = 0,
  sourceEnd = source.length
): void {
  const slice = source.subarray(sourceStart, sourceEnd);
  target.set(slice, targetStart);
}

export function byteLength(str: string): number {
  return textEncoder.encode(str).length;
}

export function utf8Slice(buffer: BinaryBuffer, start: number, end: number): string {
  return textDecoder.decode(buffer.slice(start, end));
}

export function utf8Write(buffer: BinaryBuffer, value: string, offset: number, length: number): void {
  const encoded = textEncoder.encode(value);
  buffer.set(encoded.subarray(0, length), offset);
}

export function binarySlice(buffer: BinaryBuffer, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) {
    out += String.fromCharCode(buffer[i] ?? 0);
  }
  return out;
}

export function binaryWrite(buffer: BinaryBuffer, value: string, offset: number, length: number): void {
  for (let i = 0; i < length; i++) {
    buffer[offset + i] = value.charCodeAt(i) & 0xff;
  }
}

export function toBinaryString(buffer: BinaryBuffer): string {
  return binarySlice(buffer, 0, buffer.length);
}

export function readFloatLE(buffer: BinaryBuffer, offset: number): number {
  const view = createDataView(buffer);
  return view.getFloat32(offset, true);
}

export function writeFloatLE(buffer: BinaryBuffer, value: number, offset: number): void {
  const view = createDataView(buffer);
  view.setFloat32(offset, value, true);
}

export function readDoubleLE(buffer: BinaryBuffer, offset: number): number {
  const view = createDataView(buffer);
  return view.getFloat64(offset, true);
}

export function writeDoubleLE(buffer: BinaryBuffer, value: number, offset: number): void {
  const view = createDataView(buffer);
  view.setFloat64(offset, value, true);
}

export function readUIntLE(buffer: BinaryBuffer, offset: number, byteLength: number): number {
  const view = createDataView(buffer);
  let value = 0;
  for (let i = 0; i < byteLength; i++) {
    value |= view.getUint8(offset + i) << (8 * i);
  }
  return value;
}

export function fill(buffer: BinaryBuffer, value: number): void {
  buffer.fill(value);
}

function createDataView(buffer: BinaryBuffer): DataView {
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function fromBinaryString(value: string): BinaryBuffer {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    out[i] = value.charCodeAt(i) & 0xff;
  }
  return out;
}

function fromBase64(value: string): BinaryBuffer {
  if (typeof atob === 'function') {
    const binary = atob(value);
    return fromBinaryString(binary);
  }
  throw new Error('Base64 decoding not available in this environment');
}

function isArrayLike<T>(value: unknown): value is ArrayLike<T> {
  return !!value && typeof value === 'object' && Number.isInteger((value as { length?: unknown }).length);
}

export function toArrayBuffer(buffer: BinaryBuffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export function fromArrayBuffer(buffer: ArrayBuffer): BinaryBuffer {
  return new Uint8Array(buffer.slice(0));
}
