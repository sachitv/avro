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

import {
  alloc,
  compare as compareBinary,
  from as binaryFrom,
  BinaryEncoding,
  BinaryBuffer
} from '../src/binary.ts';

export function makeBuffer(value: number[] | string, encoding: BinaryEncoding = 'utf8'): BinaryBuffer {
  if (typeof value === 'string') {
    return binaryFrom(value, encoding);
  }
  return binaryFrom(value);
}

export function equalsBinary(a: BinaryBuffer, b: BinaryBuffer): boolean {
  return compareBinary(a, b) === 0;
}

export function toArray(buffer: BinaryBuffer): number[] {
  return Array.from(buffer);
}

export function allocBuffer(size: number): BinaryBuffer {
  return alloc(size);
}

export function readInt32LE(buffer: BinaryBuffer, offset = 0): number {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return view.getInt32(offset, true);
}

export function writeInt32LE(buffer: BinaryBuffer, value: number, offset = 0): void {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  view.setInt32(offset, value, true);
}

export function slice(buffer: BinaryBuffer, start?: number, end?: number): BinaryBuffer {
  return buffer.slice(start, end);
}

export function clone(buffer: BinaryBuffer): BinaryBuffer {
  return buffer.slice();
}

export function padToLength(buffer: BinaryBuffer, length: number): BinaryBuffer {
  if (buffer.length >= length) {
    return buffer;
  }
  const next = alloc(length);
  next.set(buffer);
  return next;
}
