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

import CryptoJS from 'crypto-js';
import { BinaryBuffer } from './binary.ts';

type WordArray = CryptoJS.lib.WordArray;
type HasherInstance = {
  update(message: WordArray | string): HasherInstance;
  finalize(messageUpdate?: WordArray | string): WordArray;
};
type HasherFactory = {
  create(): HasherInstance;
};

const DEFAULT_ALGORITHM = 'md5';

export function hashString(str: string, algorithm: string = DEFAULT_ALGORITHM): BinaryBuffer {
  const algoName = algorithm ? algorithm.toUpperCase() : DEFAULT_ALGORITHM.toUpperCase();
  const algo = (CryptoJS.algo as unknown as Record<string, HasherFactory | undefined>)[algoName];
  if (!algo) {
    throw new Error(`Unsupported hash algorithm: ${algorithm}`);
  }
  const hasher = algo.create();
  hasher.update(CryptoJS.enc.Utf8.parse(str));
  const wordArray = hasher.finalize();
  return wordArrayToBinaryBuffer(wordArray);
}

function wordArrayToBinaryBuffer(wordArray: WordArray): BinaryBuffer {
  const { words, sigBytes } = wordArray;
  const bytes = new Uint8Array(sigBytes);
  let byteIndex = 0;
  for (let i = 0; i < words.length && byteIndex < sigBytes; i++) {
    const word = words[i];
    const remaining = Math.min(4, sigBytes - byteIndex);
    for (let j = 0; j < remaining; j++) {
      bytes[byteIndex++] = (word >> (24 - 8 * j)) & 0xff;
    }
  }
  return bytes;
}

export default {
  hashString
};
