/* jshint node: true */

/**
 *  Licensed to the Apache Software Foundation (ASF) under one
 *  or more contributor license agreements.  See the NOTICE file distributed
 *  with this work for additional information regarding copyright ownership.
 *  The ASF licenses this file to you under the Apache License, Version 2.0
 *  (the "License"); you may not use this file except in compliance with the
 *  License.  You may obtain a copy of the License at
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

import * as protocols from './protocols.js';
import * as schemas from './schemas.js';
import * as utils from './utils.js';
import stream from 'stream';
import { format, inherits } from './util.js';
import { deflateRaw, inflateRaw } from './zlib.js';

// Type of Avro header.
var HEADER_TYPE = schemas.createType({
  type: 'record',
  name: 'org.apache.avro.file.Header',
  fields : [
    {name: 'magic', type: {type: 'fixed', name: 'Magic', size: 4}},
    {name: 'meta', type: {type: 'map', values: 'bytes'}},
    {name: 'sync', type: {type: 'fixed', name: 'Sync', size: 16}}
  ]
});

// Type of each block.
var BLOCK_TYPE = schemas.createType({
  type: 'record',
  name: 'org.apache.avro.file.Block',
  fields : [
    {name: 'count', type: 'long'},
    {name: 'data', type: 'bytes'},
    {name: 'sync', type: {type: 'fixed', name: 'Sync', size: 16}}
  ]
});

// Used to toBuffer each block, without having to copy all its data.
var LONG_TYPE = schemas.createType('long');

// First 4 bytes of an Avro object container file.
var MAGIC_BYTES = Buffer.from('Obj\x01');

// Convenience.
var f = format;
var Tap = utils.Tap;

function isReadableStream(val) {
  return val && typeof val.pipe === 'function' && typeof val.on === 'function';
}

function isWebReadableStream(val) {
  return val && typeof val.getReader === 'function';
}

function toNodeReadable(val) {
  if (isReadableStream(val)) {
    return val;
  }
  if (isWebReadableStream(val) && typeof stream.Readable.fromWeb === 'function') {
    return stream.Readable.fromWeb(val);
  }
  return null;
}

function bufferFromView(view) {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}

function materializeBuffer(source) {
  if (Buffer.isBuffer(source)) {
    return Promise.resolve(source);
  }
  if (source instanceof Uint8Array) {
    return Promise.resolve(bufferFromView(source));
  }
  if (ArrayBuffer.isView(source)) {
    return Promise.resolve(bufferFromView(source));
  }
  if (source instanceof ArrayBuffer) {
    return Promise.resolve(Buffer.from(source));
  }
  if (source && typeof source.arrayBuffer === 'function') {
    return Promise.resolve(source.arrayBuffer()).then(function (ab) {
      return Buffer.from(ab);
    });
  }
  if (source && typeof source.then === 'function') {
    return Promise.resolve(source).then(materializeBuffer);
  }
  return Promise.reject(new TypeError('unsupported data source'));
}

function defer(fn) {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn);
  } else {
    setTimeout(fn, 0);
  }
}


/**
 * Parse a schema and return the corresponding type.
 *
 */
function parse(schema, opts) {
  var attrs = loadSchema(schema, opts);
  return attrs.protocol ?
    protocols.createProtocol(attrs, opts) :
    schemas.createType(attrs, opts);
}


/**
 * Duplex stream for decoding fragments.
 *
 */
function RawDecoder(schema, opts) {
  opts = opts || {};

  var decode = opts.decode === undefined ? true : !!opts.decode;
  stream.Duplex.call(this, {
    readableObjectMode: decode,
    allowHalfOpen: false
  });
  // Somehow setting this to false only closes the writable side after the
  // readable side ends, while we need the other way. So we do it manually.

  this._type = parse(schema);
  this._tap = new Tap(Buffer.alloc(0));
  this._needPush = false;
  this._readValue = createReader(decode, this._type);
  this._finished = false;

  this.on('finish', function () {
    this._finished = true;
    this._read();
  });
}
inherits(RawDecoder, stream.Duplex);

RawDecoder.prototype._write = function (chunk, encoding, cb) {
  var tap = this._tap;
  tap.buf = Buffer.concat([tap.buf.slice(tap.pos), chunk]);
  tap.pos = 0;
  if (this._needPush) {
    this._needPush = false;
    this._read();
  }
  cb();
};

RawDecoder.prototype._read = function () {
  var tap = this._tap;
  var pos = tap.pos;
  var val = this._readValue(tap);
  if (tap.isValid()) {
    this.push(val);
  } else if (!this._finished) {
    tap.pos = pos;
    this._needPush = true;
  } else {
    this.push(null);
  }
};


/**
 * Duplex stream for decoding object container files.
 *
 */
function BlockDecoder(opts) {
  opts = opts || {};

  var decode = opts.decode === undefined ? true : !!opts.decode;
  stream.Duplex.call(this, {
    allowHalfOpen: true, // For async decompressors.
    readableObjectMode: decode
  });

  this._type = null;
  this._codecs = opts.codecs;
  this._parseOpts = opts.parseOpts || {};
  this._tap = new Tap(Buffer.alloc(0));
  this._blockTap = new Tap(Buffer.alloc(0));
  this._syncMarker = null;
  this._readValue = null;
  this._decode = decode;
  this._queue = new utils.OrderedQueue();
  this._decompress = null; // Decompression function.
  this._index = 0; // Next block index.
  this._pending = 0; // Number of blocks undergoing decompression.
  this._needPush = false;
  this._finished = false;

  this.on('finish', function () {
    this._finished = true;
    if (!this._pending) {
      this.push(null);
    }
  });
}
inherits(BlockDecoder, stream.Duplex);

BlockDecoder.getDefaultCodecs = function () {
  return {
    'null': function (buf, cb) { cb(null, buf); },
    'deflate': inflateRaw
  };
};

BlockDecoder.prototype._decodeHeader = function () {
  var tap = this._tap;
  var header = HEADER_TYPE._read(tap);
  if (!tap.isValid()) {
    // Wait until more data arrives.
    return false;
  }

  if (!MAGIC_BYTES.equals(header.magic)) {
    this.emit('error', new Error('invalid magic bytes'));
    return;
  }

  var codec = (header.meta['avro.codec'] || 'null').toString();
  this._decompress = (this._codecs || BlockDecoder.getDefaultCodecs())[codec];
  if (!this._decompress) {
    this.emit('error', new Error(f('unknown codec: %s', codec)));
    return;
  }

  try {
    var schema = JSON.parse(header.meta['avro.schema'].toString());
    this._type = parse(schema, this._parseOpts);
  } catch (err) {
    this.emit('error', err);
    return;
  }

  this._readValue = createReader(this._decode, this._type);
  this._syncMarker = header.sync;
  this.emit('metadata', this._type, codec, header);
  return true;
};

BlockDecoder.prototype._write = function (chunk, encoding, cb) {
  var tap = this._tap;
  tap.buf = Buffer.concat([tap.buf, chunk]);
  tap.pos = 0;

  if (!this._decodeHeader()) {
    process.nextTick(cb);
    return;
  }

  // We got the header, switch to block decoding mode. Also, call it directly
  // in case we already have all the data (in which case `_write` wouldn't get
  // called anymore).
  this._write = this._writeChunk;
  this._write(Buffer.alloc(0), encoding, cb);
};

BlockDecoder.prototype._writeChunk = function (chunk, encoding, cb) {
  var tap = this._tap;
  tap.buf = Buffer.concat([tap.buf.slice(tap.pos), chunk]);
  tap.pos = 0;

  var block;
  while ((block = tryReadBlock(tap))) {
    if (!this._syncMarker.equals(block.sync)) {
      cb(new Error('invalid sync marker'));
      return;
    }
    this._decompress(block.data, this._createBlockCallback());
  }

  cb();
};

BlockDecoder.prototype._createBlockCallback = function () {
  var self = this;
  var index = this._index++;
  this._pending++;

  return function (err, data) {
    if (err) {
      self.emit('error', err);
      return;
    }
    self._pending--;
    self._queue.push(new BlockData(index, data));
    if (self._needPush) {
      self._needPush = false;
      self._read();
    }
  };
};

BlockDecoder.prototype._read = function () {
  var tap = this._blockTap;
  if (tap.pos >= tap.buf.length) {
    var data = this._queue.pop();
    if (!data) {
      if (this._finished && !this._pending) {
        this.push(null);
      } else {
        this._needPush = true;
      }
      return; // Wait for more data.
    }
    tap.buf = data.buf;
    tap.pos = 0;
  }

  this.push(this._readValue(tap)); // The read is guaranteed valid.
};


/**
 * Duplex stream for encoding.
 *
 */
function RawEncoder(schema, opts) {
  opts = opts || {};

  stream.Transform.call(this, {
    writableObjectMode: true,
    allowHalfOpen: false
  });

  this._type = parse(schema);
  this._writeValue = function (tap, val) {
    try {
      this._type._write(tap, val);
    } catch (err) {
      this.emit('error', err);
    }
  };
  this._tap = new Tap(Buffer.alloc(opts.batchSize || 65536));
}
inherits(RawEncoder, stream.Transform);

RawEncoder.prototype._transform = function (val, encoding, cb) {
  var tap = this._tap;
  var buf = tap.buf;
  var pos = tap.pos;

  this._writeValue(tap, val);
  if (!tap.isValid()) {
    if (pos) {
      // Emit any valid data.
      this.push(copyBuffer(tap.buf, 0, pos));
    }
    var len = tap.pos - pos;
    if (len > buf.length) {
      // Not enough space for last written object, need to resize.
      tap.buf = Buffer.alloc(2 * len);
    }
    tap.pos = 0;
    this._writeValue(tap, val); // Rewrite last failed write.
  }

  cb();
};

RawEncoder.prototype._flush = function (cb) {
  var tap = this._tap;
  var pos = tap.pos;
  if (pos) {
    // This should only ever be false if nothing is written to the stream.
    this.push(tap.buf.slice(0, pos));
  }
  cb();
};


/**
 * Duplex stream to write object container files.
 *
 * @param schema
 * @param opts {Object}
 *
 *  + `blockSize`, uncompressed.
 *  + `codec`
 *  + `codecs`
 *  + `noCheck`
 *  + `omitHeader`, useful to append to an existing block file.
 *
 */
function BlockEncoder(schema, opts) {
  opts = opts || {};

  stream.Duplex.call(this, {
    allowHalfOpen: true, // To support async compressors.
    writableObjectMode: true
  });

  var obj, type;
  if (schema instanceof schemas.types.Type) {
    type = schema;
    schema = undefined;
  } else {
    // Keep full schema to be able to write it to the header later.
    obj = loadSchema(schema, opts);
    type = schemas.createType(obj);
    schema = JSON.stringify(obj);
  }

  this._schema = schema;
  this._type = type;
  this._writeValue = function (tap, val) {
    try {
      this._type._write(tap, val);
    } catch (err) {
      this.emit('error', err);
    }
  };
  this._blockSize = opts.blockSize || 65536;
  this._tap = new Tap(Buffer.alloc(this._blockSize));
  this._codecs = opts.codecs;
  this._codec = opts.codec || 'null';
  this._compress = null;
  this._omitHeader = opts.omitHeader || false;
  this._blockCount = 0;
  this._syncMarker = opts.syncMarker || new utils.Lcg().nextBuffer(16);
  this._queue = new utils.OrderedQueue();
  this._pending = 0;
  this._finished = false;
  this._needPush = false;
  this._downstream = null;

  this.on('finish', function () {
    this._finished = true;
    if (this._blockCount) {
      this._flushChunk();
    }
  });
}
inherits(BlockEncoder, stream.Duplex);

BlockEncoder.getDefaultCodecs = function () {
  return {
    'null': function (buf, cb) { cb(null, buf); },
    'deflate': deflateRaw
  };
};

BlockEncoder.prototype.getDownstream = function () {
  return this._downstream;
};

BlockEncoder.prototype._write = function (val, encoding, cb) {
  var codec = this._codec;
  this._compress = (this._codecs || BlockEncoder.getDefaultCodecs())[codec];
  if (!this._compress) {
    this.emit('error', new Error(f('unsupported codec: %s', codec)));
    return;
  }

  if (!this._omitHeader) {
    var meta = {
      'avro.schema': Buffer.from(this._schema || this._type.getSchema()),
      'avro.codec': Buffer.from(this._codec)
    };
    var Header = HEADER_TYPE.getRecordConstructor();
    var header = new Header(MAGIC_BYTES, meta, this._syncMarker);
    this.push(header.$toBuffer());
  }

  this._write = this._writeChunk;
  this._write(val, encoding, cb);
};

BlockEncoder.prototype._writeChunk = function (val, encoding, cb) {
  var tap = this._tap;
  var pos = tap.pos;

  this._writeValue(tap, val);
  if (!tap.isValid()) {
    if (pos) {
      this._flushChunk(pos);
    }
    var len = tap.pos - pos;
    if (len > this._blockSize) {
      // Not enough space for last written object, need to resize.
      this._blockSize = len * 2;
    }
    tap.buf = Buffer.alloc(this._blockSize);
    tap.pos = 0;
    this._writeValue(tap, val); // Rewrite last failed write.
  }
  this._blockCount++;

  cb();
};

BlockEncoder.prototype._flushChunk = function (pos) {
  var tap = this._tap;
  pos = pos || tap.pos;
  this._compress(tap.buf.slice(0, pos), this._createBlockCallback());
  this._blockCount = 0;
};

BlockEncoder.prototype._read = function () {
  var self = this;
  var data = this._queue.pop();
  if (!data) {
    if (this._finished && !this._pending) {
      process.nextTick(function () { self.push(null); });
    } else {
      this._needPush = true;
    }
    return;
  }

  this.push(LONG_TYPE.toBuffer(data.count, true));
  this.push(LONG_TYPE.toBuffer(data.buf.length, true));
  this.push(data.buf);
  this.push(this._syncMarker);
};

BlockEncoder.prototype._createBlockCallback = function () {
  var self = this;
  var index = this._index++;
  var count = this._blockCount;
  this._pending++;

  return function (err, data) {
    if (err) {
      self.emit('error', err);
      return;
    }
    self._pending--;
    self._queue.push(new BlockData(index, data, count));
    if (self._needPush) {
      self._needPush = false;
      self._read();
    }
  };
};


/**
 * Extract a container file's header from an in-memory payload.
 *
 */
async function extractFileHeader(source, opts) {
  opts = opts || {};

  var decode = opts.decode === undefined ? true : !!opts.decode;
  var buf = await materializeBuffer(source);
  if (buf.length < 4 || !MAGIC_BYTES.equals(buf.slice(0, 4))) {
    return null;
  }

  var tap = new Tap(buf);
  var header = HEADER_TYPE._read(tap);
  if (!tap.isValid()) {
    return null;
  }

  if (decode !== false) {
    var meta = header.meta;
    meta['avro.schema'] = JSON.parse(meta['avro.schema'].toString());
    if (meta['avro.codec'] !== undefined) {
      meta['avro.codec'] = meta['avro.codec'].toString();
    }
  }

  return header;
}


/**
 * Readable stream of records from a local Avro file.
 *
 */
function createFileDecoder(source, opts) {
  var readable = toNodeReadable(source);
  if (readable) {
    return readable.pipe(new BlockDecoder(opts));
  }

  var decoder = new BlockDecoder(opts);
  Promise.resolve().then(function () {
    return materializeBuffer(source);
  }).then(function (buf) {
    decoder.end(buf);
  }, function (err) {
    defer(function () {
      decoder.emit('error', err);
    });
  });
  return decoder;
}


/**
 * Writable stream of records to an in-memory buffer.
 *
 * Returns a `BlockEncoder`. Call `encoder.collect()` (or `encoder.toArrayBuffer()`/
 * `encoder.toBlob()`) once the stream has finished to retrieve the encoded
 * container as a `Buffer`, `ArrayBuffer`, or `Blob` respectively. Pass a
 * `writable` option to pipe the encoded data elsewhere.
 */
function createFileEncoder(schema, opts) {
  opts = opts || {};
  var encoder = new BlockEncoder(schema, opts);

  if (opts.writable) {
    encoder.pipe(opts.writable);
  }

  if (opts.collect !== false && !opts.writable) {
    attachCollector(encoder, opts);
  }

  return encoder;
}


// Helpers.

/**
 * An indexed block.
 *
 * This can be used to preserve block order since compression and decompression
 * can cause some some blocks to be returned out of order. The count is only
 * used when encoding.
 *
 */
function BlockData(index, buf, count) {
  this.index = index;
  this.buf = buf;
  this.count = count | 0;
}

/**
 * Maybe get a block.
 *
 */
function tryReadBlock(tap) {
  var pos = tap.pos;
  var block = BLOCK_TYPE._read(tap);
  if (!tap.isValid()) {
    tap.pos = pos;
    return null;
  }
  return block;
}

/**
 * Create bytes consumer, either reading or skipping records.
 *
 */
function createReader(decode, type) {
  if (decode) {
    return function (tap) { return type._read(tap); };
  } else {
    return (function (skipper) {
      return function (tap) {
        var pos = tap.pos;
        skipper(tap);
        return tap.buf.slice(pos, tap.pos);
      };
    })(type._skip);
  }
}

/**
 * Copy a buffer.
 *
 * This avoids having to create a slice of the original buffer.
 *
 */
function copyBuffer(buf, pos, len) {
  var copy = Buffer.alloc(len);
  buf.copy(copy, 0, pos, pos + len);
  return copy;
}

function bufferToArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function attachCollector(encoder, opts) {
  var chunks = [];
  var resolved = false;
  var onData = function (chunk) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  };
  var resolveBuffer;
  var rejectBuffer;
  var bufferPromise = new Promise(function (resolve, reject) {
    resolveBuffer = resolve;
    rejectBuffer = reject;
  });

  encoder.on('data', onData);
  encoder.once('end', function () {
    if (resolved) {
      return;
    }
    resolved = true;
    encoder.removeListener('data', onData);
    resolveBuffer(Buffer.concat(chunks));
  });
  encoder.once('error', function (err) {
    if (resolved) {
      return;
    }
    resolved = true;
    encoder.removeListener('data', onData);
    rejectBuffer(err);
  });

  encoder.collect = function () {
    return bufferPromise;
  };

  encoder.toArrayBuffer = function () {
    return bufferPromise.then(bufferToArrayBuffer);
  };

  encoder.toBlob = function (type) {
    if (typeof Blob === 'undefined') {
      throw new Error('Blob constructor is not available in this environment');
    }
    var blobType = type || opts.blobType;
    return bufferPromise.then(function (buffer) {
      return new Blob([buffer], blobType ? {type: blobType} : undefined);
    });
  };
}

/**
 * Try to load a schema.
 *
 * String inputs are parsed as JSON when possible; otherwise an optional
 * `schemaResolver` hook can return the associated schema definition.
 */
function loadSchema(schema, opts) {
  var obj;
  if (typeof schema == 'string') {
    try {
      obj = JSON.parse(schema);
    } catch (err) {
      if (opts && typeof opts.schemaResolver === 'function') {
        obj = opts.schemaResolver(schema);
        if (typeof obj == 'string') {
          obj = JSON.parse(obj);
        }
      }
    }
  }
  if (obj === undefined) {
    obj = schema;
  }
  return obj;
}


const streamsNamespace = {
  RawDecoder,
  BlockDecoder,
  RawEncoder,
  BlockEncoder
};

const exported = {
  HEADER_TYPE, // For tests.
  MAGIC_BYTES, // Idem.
  parse,
  createFileDecoder,
  createFileEncoder,
  extractFileHeader,
  streams: streamsNamespace
};

export {
  HEADER_TYPE,
  MAGIC_BYTES,
  parse,
  createFileDecoder,
  createFileEncoder,
  extractFileHeader,
  streamsNamespace as streams
};

export default exported;
