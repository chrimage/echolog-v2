import { validateSessionId, validateToken, validateArtifactType } from '../src/utils/validation';

describe('validateSessionId', () => {
  describe('valid session IDs', () => {
    test('accepts alphanumeric with hyphens and underscores', () => {
      expect(validateSessionId('abc123')).toBe('abc123');
      expect(validateSessionId('session-123')).toBe('session-123');
      expect(validateSessionId('session_123')).toBe('session_123');
      expect(validateSessionId('2025-07-30_14-30-45-123')).toBe('2025-07-30_14-30-45-123');
    });

    test('trims whitespace', () => {
      expect(validateSessionId('  valid-id  ')).toBe('valid-id');
    });
  });

  describe('invalid session IDs - security tests', () => {
    test('rejects path traversal attempts', () => {
      expect(validateSessionId('../')).toBeNull();
      expect(validateSessionId('../../etc/passwd')).toBeNull();
      expect(validateSessionId('../../../')).toBeNull();
      expect(validateSessionId('valid/../invalid')).toBeNull();
    });

    test('rejects paths with slashes', () => {
      expect(validateSessionId('path/to/file')).toBeNull();
      expect(validateSessionId('/absolute/path')).toBeNull();
      expect(validateSessionId('relative/path')).toBeNull();
    });

    test('rejects paths with backslashes', () => {
      expect(validateSessionId('path\\to\\file')).toBeNull();
      expect(validateSessionId('C:\\Windows\\System32')).toBeNull();
    });

    test('rejects special characters', () => {
      expect(validateSessionId('session@123')).toBeNull();
      expect(validateSessionId('session#123')).toBeNull();
      expect(validateSessionId('session$123')).toBeNull();
      expect(validateSessionId('session%123')).toBeNull();
      expect(validateSessionId('session&123')).toBeNull();
      expect(validateSessionId('session*123')).toBeNull();
      expect(validateSessionId('session(123)')).toBeNull();
      expect(validateSessionId('session[123]')).toBeNull();
      expect(validateSessionId('session{123}')).toBeNull();
    });

    test('rejects null, undefined, and empty strings', () => {
      expect(validateSessionId('')).toBeNull();
      expect(validateSessionId('   ')).toBeNull();
      expect(validateSessionId(null as any)).toBeNull();
      expect(validateSessionId(undefined as any)).toBeNull();
    });

    test('rejects non-string input', () => {
      expect(validateSessionId(123 as any)).toBeNull();
      expect(validateSessionId({} as any)).toBeNull();
      expect(validateSessionId([] as any)).toBeNull();
    });

    test('rejects strings that are too long', () => {
      const longString = 'a'.repeat(101);
      expect(validateSessionId(longString)).toBeNull();
    });
  });
});

describe('validateToken', () => {
  describe('valid tokens', () => {
    test('accepts valid UUID v4 format', () => {
      expect(validateToken('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(validateToken('6ba7b810-9dad-41d1-80b4-00c04fd430c8')).toBe(true);
      expect(validateToken('01234567-89ab-4def-8123-456789abcdef')).toBe(true);
    });

    test('accepts UUID v4 with version bit set correctly', () => {
      expect(validateToken('12345678-1234-4234-a234-123456789abc')).toBe(true);
      expect(validateToken('87654321-4321-4321-b321-cba987654321')).toBe(true);
    });
  });

  describe('invalid tokens', () => {
    test('rejects malformed UUIDs', () => {
      expect(validateToken('not-a-uuid')).toBe(false);
      expect(validateToken('550e8400-e29b-41d4-a716')).toBe(false);
      expect(validateToken('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false);
    });

    test('rejects UUIDs with wrong version', () => {
      expect(validateToken('550e8400-e29b-11d4-a716-446655440000')).toBe(false); // v1
      expect(validateToken('550e8400-e29b-21d4-a716-446655440000')).toBe(false); // v2
      expect(validateToken('550e8400-e29b-31d4-a716-446655440000')).toBe(false); // v3
      expect(validateToken('550e8400-e29b-51d4-a716-446655440000')).toBe(false); // v5
    });

    test('rejects UUIDs with wrong variant bits', () => {
      expect(validateToken('550e8400-e29b-41d4-0716-446655440000')).toBe(false); // variant 0
      expect(validateToken('550e8400-e29b-41d4-1716-446655440000')).toBe(false); // variant 0
      expect(validateToken('550e8400-e29b-41d4-c716-446655440000')).toBe(false); // variant 3
      expect(validateToken('550e8400-e29b-41d4-d716-446655440000')).toBe(false); // variant 3
    });

    test('rejects null, undefined, and empty strings', () => {
      expect(validateToken('')).toBe(false);
      expect(validateToken(null as any)).toBe(false);
      expect(validateToken(undefined as any)).toBe(false);
    });

    test('rejects non-string input', () => {
      expect(validateToken(123 as any)).toBe(false);
      expect(validateToken({} as any)).toBe(false);
      expect(validateToken([] as any)).toBe(false);
    });

    test('is case insensitive', () => {
      expect(validateToken('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
      expect(validateToken('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
    });
  });
});

describe('validateArtifactType', () => {
  describe('valid artifact types', () => {
    test('accepts transcript', () => {
      expect(validateArtifactType('transcript')).toBe(true);
    });

    test('accepts summary', () => {
      expect(validateArtifactType('summary')).toBe(true);
    });

    test('accepts audio', () => {
      expect(validateArtifactType('audio')).toBe(true);
    });
  });

  describe('invalid artifact types', () => {
    test('rejects unknown types', () => {
      expect(validateArtifactType('video')).toBe(false);
      expect(validateArtifactType('image')).toBe(false);
      expect(validateArtifactType('document')).toBe(false);
      expect(validateArtifactType('file')).toBe(false);
    });

    test('rejects case variations', () => {
      expect(validateArtifactType('Transcript')).toBe(false);
      expect(validateArtifactType('SUMMARY')).toBe(false);
      expect(validateArtifactType('Audio')).toBe(false);
    });

    test('rejects empty and null values', () => {
      expect(validateArtifactType('')).toBe(false);
      expect(validateArtifactType(null as any)).toBe(false);
      expect(validateArtifactType(undefined as any)).toBe(false);
    });

    test('prevents path traversal through artifact type', () => {
      expect(validateArtifactType('../transcript')).toBe(false);
      expect(validateArtifactType('../../etc/passwd')).toBe(false);
      expect(validateArtifactType('transcript/../summary')).toBe(false);
    });
  });
});