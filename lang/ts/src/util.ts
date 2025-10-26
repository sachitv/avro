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

export function format(fmt: unknown, ...args: unknown[]): string {
  if (typeof fmt !== 'string') {
    return [fmt, ...args].map(stringify).join(' ');
  }

  let index = 0;
  const formatted = fmt.replace(/%[sdj%]/g, (token) => {
    if (token === '%%') {
      return '%';
    }
    const value = args[index++];
    switch (token) {
      case '%s':
        return String(value);
      case '%d':
        return Number(value).toString();
      case '%j':
        try {
          return JSON.stringify(value);
        } catch {
          return '[Circular]';
        }
      default:
        return token;
    }
  });

  const remaining = args.slice(index).map(stringify);
  return remaining.length ? `${formatted} ${remaining.join(' ')}` : formatted;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function inherits(ctor: CallableFunction, superCtor: CallableFunction): void {
  if (typeof superCtor !== 'function') {
    throw new TypeError('Super constructor must be a function');
  }
  (ctor as CallableFunction & { super_?: CallableFunction }).super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
}

export default {
  format,
  inherits
};
