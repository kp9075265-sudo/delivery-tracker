import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const keyLength = 64;

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key as Buffer);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltHex, keyHex, extra] = encoded.split("$");
  if (
    algorithm !== "scrypt" ||
    !saltHex ||
    !/^[a-f0-9]{32}$/i.test(saltHex) ||
    !keyHex ||
    !/^[a-f0-9]{128}$/i.test(keyHex) ||
    extra !== undefined
  ) {
    return false;
  }

  const expected = Buffer.from(keyHex, "hex");
  const actual = await deriveKey(password, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(actual, expected);
}
