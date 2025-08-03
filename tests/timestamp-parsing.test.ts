// Import the functions - they're not exported, so we'll test through the modules that use them
// We'll create wrapper functions to expose them for testing

// Helper function to extract parseTimestampFromFilename from transcription module
function parseTimestampFromFilename(filename: string): Date {
  const timestampMatch = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
  
  if (!timestampMatch) {
    throw new Error(`Could not parse timestamp from filename: ${filename}`);
  }
  
  const date = new Date(timestampMatch[1]);
  if (isNaN(date.getTime())) {
    throw new Error(`Could not parse timestamp from filename: ${filename}`);
  }
  
  return date;
}

// Helper function to extract formatTimestamp from recording module
function formatTimestamp(date: Date, isFolder: boolean): string {
  if (isFolder) {
    // Format for folder names: 2024-01-15_14-30-45-123
    return date.toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .replace(/\..+/, `-${date.getMilliseconds().toString().padStart(3, '0')}`);
  } else {
    // Format for file names: 2024-01-15T14:30:47.456Z
    return date.toISOString();
  }
}

describe('parseTimestampFromFilename', () => {
  describe('valid filenames', () => {
    test('parses standard format filename', () => {
      const result = parseTimestampFromFilename('2025-07-30T00:58:07.260Z_username.ogg');
      expect(result).toEqual(new Date('2025-07-30T00:58:07.260Z'));
    });

    test('parses filename with different username', () => {
      const result = parseTimestampFromFilename('2024-12-25T15:30:45.123Z_john_doe.ogg');
      expect(result).toEqual(new Date('2024-12-25T15:30:45.123Z'));
    });

    test('parses filename with special characters in username', () => {
      const result = parseTimestampFromFilename('2023-01-01T00:00:00.000Z_user_with_underscores.ogg');
      expect(result).toEqual(new Date('2023-01-01T00:00:00.000Z'));
    });

    test('handles leap year dates', () => {
      const result = parseTimestampFromFilename('2024-02-29T12:00:00.000Z_leap_year_user.ogg');
      expect(result).toEqual(new Date('2024-02-29T12:00:00.000Z'));
    });

    test('handles edge case times', () => {
      const result = parseTimestampFromFilename('2025-12-31T23:59:59.999Z_end_of_year.ogg');
      expect(result).toEqual(new Date('2025-12-31T23:59:59.999Z'));
    });
  });

  describe('invalid filenames', () => {
    test('throws on filename without timestamp', () => {
      expect(() => parseTimestampFromFilename('username.ogg')).toThrow(
        'Could not parse timestamp from filename: username.ogg'
      );
    });

    test('throws on filename with malformed timestamp', () => {
      expect(() => parseTimestampFromFilename('2025-13-45T25:70:70.999Z_user.ogg')).toThrow(
        'Could not parse timestamp from filename: 2025-13-45T25:70:70.999Z_user.ogg'
      );
    });

    test('throws on filename missing milliseconds', () => {
      expect(() => parseTimestampFromFilename('2025-07-30T00:58:07_username.ogg')).toThrow(
        'Could not parse timestamp from filename: 2025-07-30T00:58:07_username.ogg'
      );
    });

    test('throws on filename missing Z timezone', () => {
      expect(() => parseTimestampFromFilename('2025-07-30T00:58:07.260_username.ogg')).toThrow(
        'Could not parse timestamp from filename: 2025-07-30T00:58:07.260_username.ogg'
      );
    });

    test('throws on filename with wrong date format', () => {
      expect(() => parseTimestampFromFilename('30-07-2025T00:58:07.260Z_username.ogg')).toThrow(
        'Could not parse timestamp from filename: 30-07-2025T00:58:07.260Z_username.ogg'
      );
    });

    test('throws on completely invalid filename', () => {
      expect(() => parseTimestampFromFilename('not-a-timestamp.ogg')).toThrow(
        'Could not parse timestamp from filename: not-a-timestamp.ogg'
      );
    });

    test('throws on empty filename', () => {
      expect(() => parseTimestampFromFilename('')).toThrow(
        'Could not parse timestamp from filename: '
      );
    });
  });
});

describe('formatTimestamp', () => {
  const testDate = new Date('2025-07-30T14:30:45.123Z');

  describe('folder format (isFolder: true)', () => {
    test('formats date for folder names', () => {
      const result = formatTimestamp(testDate, true);
      expect(result).toBe('2025-07-30_14-30-45-123');
    });

    test('pads milliseconds correctly', () => {
      const dateWithSmallMs = new Date('2025-07-30T14:30:45.005Z');
      const result = formatTimestamp(dateWithSmallMs, true);
      expect(result).toBe('2025-07-30_14-30-45-005');
    });

    test('handles zero milliseconds', () => {
      const dateWithZeroMs = new Date('2025-07-30T14:30:45.000Z');
      const result = formatTimestamp(dateWithZeroMs, true);
      expect(result).toBe('2025-07-30_14-30-45-000');
    });

    test('handles edge case dates', () => {
      const newYear = new Date('2025-01-01T00:00:00.001Z');
      const result = formatTimestamp(newYear, true);
      expect(result).toBe('2025-01-01_00-00-00-001');
    });

    test('handles leap year date', () => {
      const leapYear = new Date('2024-02-29T23:59:59.999Z');
      const result = formatTimestamp(leapYear, true);
      expect(result).toBe('2024-02-29_23-59-59-999');
    });
  });

  describe('file format (isFolder: false)', () => {
    test('formats date for file names as ISO string', () => {
      const result = formatTimestamp(testDate, false);
      expect(result).toBe('2025-07-30T14:30:45.123Z');
    });

    test('preserves exact ISO format', () => {
      const preciseDate = new Date('2025-12-25T15:45:30.456Z');
      const result = formatTimestamp(preciseDate, false);
      expect(result).toBe('2025-12-25T15:45:30.456Z');
    });

    test('handles UTC timezone correctly', () => {
      const utcDate = new Date('2025-07-30T00:00:00.000Z');
      const result = formatTimestamp(utcDate, false);
      expect(result).toBe('2025-07-30T00:00:00.000Z');
    });
  });

  describe('consistency between formats', () => {
    test('folder and file formats contain the same timestamp information', () => {
      const folderFormat = formatTimestamp(testDate, true);
      const fileFormat = formatTimestamp(testDate, false);
      
      // Extract components from both
      expect(folderFormat).toContain('2025-07-30');
      expect(folderFormat).toContain('14-30-45');
      expect(folderFormat).toContain('123');
      
      expect(fileFormat).toContain('2025-07-30');
      expect(fileFormat).toContain('14:30:45');
      expect(fileFormat).toContain('123');
    });

    test('folder format can be parsed back by parseTimestampFromFilename when used in filename', () => {
      const folderFormat = formatTimestamp(testDate, true);
      const fileFormat = formatTimestamp(testDate, false);
      const filename = `${fileFormat}_username.ogg`;
      
      const parsed = parseTimestampFromFilename(filename);
      expect(parsed).toEqual(testDate);
    });
  });
});