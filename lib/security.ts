const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 100_000;

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return new Uint8Array();
  return new Uint8Array(value.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
}

export function randomToken(byteLength = 32) {
  return toHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256(value: string | ArrayBuffer) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, iterationText, saltText, expectedText] = stored.split("$");
  if (algorithm !== "pbkdf2-sha256") return false;
  const iterations = Number(iterationText);
  const salt = fromHex(saltText ?? "");
  const expected = fromHex(expectedText ?? "");
  if (!Number.isSafeInteger(iterations) || iterations < 1 || salt.length === 0 || expected.length === 0) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, expected.length * 8));
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}
