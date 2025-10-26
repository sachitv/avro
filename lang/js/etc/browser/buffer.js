/**
 * Minimal buffer shim for browser bundles.
 *
 * Exposes the same shape as Node's `buffer` builtin: a default export with a
 * `Buffer` property and a named `Buffer` export. It relies on a `Buffer`
 * global provided by the bundler or runtime (e.g. Browserify).
 */
const BufferCtor = globalThis.Buffer;

if (typeof BufferCtor !== 'function') {
  throw new Error('Buffer global is not available; please include a Buffer polyfill.');
}

const SlowBuffer = BufferCtor.SlowBuffer || ((len) => BufferCtor.allocUnsafeSlow(len));

const buffer = {
  Buffer: BufferCtor,
  SlowBuffer
};

export { BufferCtor as Buffer, SlowBuffer };
export default buffer;
