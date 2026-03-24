import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 10;

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }
  return secret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(userId: string): string {
  const secret = getJwtSecret();
  return jwt.sign({ sub: userId }, secret, {
    algorithm: "HS256",
    expiresIn: "15m",
  });
}

type AccessTokenPayload = {
  sub: string;
};

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret);

  if (typeof decoded !== "object" || decoded === null || !("sub" in decoded)) {
    throw new Error("Invalid token payload");
  }

  return decoded as AccessTokenPayload;
}
