import zlib from 'zlib';

export function inflateRaw(buf, cb) {
  return zlib.inflateRaw(buf, cb);
}

export function deflateRaw(buf, cb) {
  return zlib.deflateRaw(buf, cb);
}

export default {
  inflateRaw,
  deflateRaw
};
