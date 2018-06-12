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

// This code is adapted from Facebook's ImmutableJS.

export function hash(key: number|string): number {
  if (key == null) {
    return 0;
  }

  if (typeof key === 'number') {
    return hashNumber(key);
  } else if (typeof key === 'string') {
    return hashString(key);
  } else {
    throw new Error('Can only get hash code of numbers or strings');
  }
}

function hashNumber(num: number): number {
  if (num !== num || num === Infinity) {
    return 0;
  }

  let h = num | 0;
  if (h !== num) {
    h ^= num * 0xffffffff;
  }
  while (num > 0xffffffff) {
    num /= 0xffffffff;
    h ^= num;
  }

  return h;
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
  return hashed;
}
