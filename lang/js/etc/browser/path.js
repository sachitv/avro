/**
 * Minimal path shim for browser builds.
 *
 * Only exposes the members required by Avro's JS runtime today.
 */
const sep = '/';

function hasExt(pathname) {
  return /\.[^/\\]+$/.test(pathname);
}

function extname(pathname = '') {
  const match = /(\.[^/\\]*)$/.exec(pathname);
  return match ? match[1] : '';
}

function basename(pathname = '', ext) {
  let base = pathname.replace(/^.*[\\/]/, '');
  if (ext && hasExt(base) && base.endsWith(ext)) {
    base = base.slice(0, -ext.length);
  }
  return base;
}

export { sep, basename, extname };

export default {
  sep,
  basename,
  extname
};
