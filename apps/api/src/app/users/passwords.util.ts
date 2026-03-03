import * as bcrypt from 'bcrypt';

export async function hashInternalPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyStoredPassword(
  storedHash: string | null | undefined,
  password: string
) {
  const normalizedHash = String(storedHash ?? '').trim();
  if (!normalizedHash) return false;

  try {
    if (normalizedHash.startsWith('PLAIN:')) {
      return normalizedHash.slice('PLAIN:'.length) === password;
    }

    if (
      normalizedHash.startsWith('$2a$') ||
      normalizedHash.startsWith('$2b$') ||
      normalizedHash.startsWith('$2y$')
    ) {
      return bcrypt.compare(password, normalizedHash);
    }

    return normalizedHash === password;
  } catch {
    return false;
  }
}
