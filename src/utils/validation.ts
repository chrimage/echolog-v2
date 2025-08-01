import * as path from 'path';

/**
 * Validates and sanitizes a session ID to prevent path traversal attacks
 * @param sessionId The session ID to validate
 * @returns The sanitized session ID or null if invalid
 */
export function validateSessionId(sessionId: string): string | null {
  if (!sessionId || typeof sessionId !== 'string') {
    return null;
  }

  // Remove any leading/trailing whitespace
  sessionId = sessionId.trim();

  // Check length constraints (reasonable session ID length)
  if (sessionId.length < 1 || sessionId.length > 100) {
    return null;
  }

  // Only allow alphanumeric characters, hyphens, and underscores
  // This prevents path traversal attempts like ../../../etc/passwd
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(sessionId)) {
    return null;
  }

  // Additional check: ensure no path traversal components
  const normalized = path.normalize(sessionId);
  if (normalized !== sessionId || normalized.includes('..') || normalized.includes('/') || normalized.includes('\\')) {
    return null;
  }

  return sessionId;
}

/**
 * Validates a viewer token format
 * @param token The token to validate
 * @returns True if the token format is valid
 */
export function validateToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  // UUID v4 format validation
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(token);
}

/**
 * Validates artifact type
 * @param type The artifact type to validate
 * @returns True if the type is valid
 */
export function validateArtifactType(type: string): type is 'transcript' | 'summary' | 'audio' {
  return ['transcript', 'summary', 'audio'].includes(type);
}