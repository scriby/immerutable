/*
  MIT License

  Copyright (c) 2014-present, Facebook, Inc.

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
*/

export function hash(key: number | string) {
  if (key == null) {
    return 0;
  }

  if (typeof key === 'number') {
    if (key !== key || key === Infinity) {
      return 0;
    }
    let h = key | 0;
    if (h !== key) {
      h ^= key * 0xffffffff;
    }
    while (key > 0xffffffff) {
      key /= 0xffffffff;
      h ^= key;
    }
    return smi(h);
  }

  if (typeof key === 'string') {
    return hashString(key);
  }

  throw new Error('Cannot hash key');
}

// http://jsperf.com/hashing-strings
function hashString(str: string): number {
  // This is the hash from JVM
  // The hash code for a string is computed as
  // s[0] * 31 ^ (n - 1) + s[1] * 31 ^ (n - 2) + ... + s[n - 1],
  // where s[i] is the ith character of the string and n is the length of
  // the string. We "mod" the result to make it between 0 (inclusive) and 2^31
  // (exclusive) by dropping high bits.
  let hashed = 0;
  for (let ii = 0; ii < str.length; ii++) {
    hashed = (31 * hashed + str.charCodeAt(ii)) | 0;
  }
  return smi(hashed);
}

// v8 has an optimization for storing 31-bit signed numbers.
// Values which have either 00 or 11 as the high order bits qualify.
// This function drops the highest order bit in a signed number, maintaining
// the sign bit.
function smi(i32: number): number {
  return ((i32 >>> 1) & 0x40000000) | (i32 & 0xbfffffff);
}