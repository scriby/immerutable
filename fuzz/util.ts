export function getSeed() {
  if (process.env.FUZZ_SEED !== undefined) {
    const seed = Number(process.env.FUZZ_SEED);
    if (!Number.isSafeInteger(seed)) throw new Error('FUZZ_SEED must be a safe integer');
    return seed;
  }
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}
