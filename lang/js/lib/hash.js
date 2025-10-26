import { createHash as nodeCreateHash } from 'crypto';

/**
 * Compute a hash digest for the provided UTF-8 string.
 *
 * @param {string} str
 * @param {string} [algorithm='md5']
 * @returns {Buffer}
 */
export function hashString(str, algorithm = 'md5') {
  const hash = nodeCreateHash(algorithm || 'md5');
  hash.update(str, 'utf8');
  return hash.digest();
}

export default {
  hashString
};
