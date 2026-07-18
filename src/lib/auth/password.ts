import bcrypt from "bcryptjs";

/*
  Password hashing helpers. bcrypt with a cost of 10 — a sensible default that
  balances security and speed. Never store or log plaintext passwords.
*/
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
