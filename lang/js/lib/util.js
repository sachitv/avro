/**
 * Minimal utilities shared across the Avro JS runtime.
 *
 * Provides `format` and `inherits` equivalents so we can avoid the Node
 * builtin `util` dependency.
 */

/**
 * Lightweight substitute for `util.format`.
 * Supports %s, %d, %j, and %% placeholders which is sufficient for current usage.
 */
export function format(fmt, ...args) {
  if (typeof fmt !== 'string') {
    return [fmt, ...args].map(stringify).join(' ');
  }

  let i = 0;
  const result = fmt.replace(/%[sdj%]/g, (token) => {
    if (token === '%%') {
      return '%';
    }
    const value = args[i++];
    switch (token) {
      case '%s':
        return String(value);
      case '%d':
        return Number(value);
      case '%j':
        try {
          return JSON.stringify(value);
        } catch (err) {
          return '[Circular]';
        }
      default:
        return token;
    }
  });

  const remaining = args.slice(i).map(stringify);
  return remaining.length ? `${result} ${remaining.join(' ')}` : result;
}

function stringify(value) {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

/**
 * Minimal replacement for `util.inherits`.
 */
export function inherits(ctor, superCtor) {
  if (typeof superCtor !== 'function') {
    throw new TypeError('Super constructor must be a function');
  }
  ctor.super_ = superCtor;
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
