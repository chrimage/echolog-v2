// Helper function to replicate mergeConsecutiveSegments logic from transcription module
interface TranscriptionSegment {
  speaker: string;
  text: string;
  startTime: number; // seconds
  endTime: number; // seconds
  confidence: number; // 0-1
  noSpeechProb: number; // 0-1
}

function mergeConsecutiveSegments(segments: TranscriptionSegment[]): TranscriptionSegment[] {
  if (segments.length === 0) return segments;
  
  const merged: TranscriptionSegment[] = [];
  let current = { ...segments[0] };
  
  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    
    if (current.speaker === next.speaker) {
      // Merge with current segment
      current.text += ` ${next.text}`;
      current.endTime = next.endTime;
      // Average the confidence and noSpeechProb
      current.confidence = (current.confidence + next.confidence) / 2;
      current.noSpeechProb = (current.noSpeechProb + next.noSpeechProb) / 2;
    } else {
      // Save current and start new
      merged.push(current);
      current = { ...next };
    }
  }
  
  // Don't forget the last segment
  merged.push(current);
  
  return merged;
}

describe('mergeConsecutiveSegments', () => {
  describe('basic merging', () => {
    test('merges consecutive segments from same speaker', () => {
      const segments: TranscriptionSegment[] = [
        {
          speaker: 'Alice',
          text: 'Hello',
          startTime: 0,
          endTime: 1,
          confidence: 0.9,
          noSpeechProb: 0.1
        },
        {
          speaker: 'Alice',
          text: 'world',
          startTime: 1,
          endTime: 2,
          confidence: 0.8,
          noSpeechProb: 0.2
        }
      ];

      const result = mergeConsecutiveSegments(segments);
      
      expect(result).toHaveLength(1);
      expect(result[0].speaker).toBe('Alice');
      expect(result[0].text).toBe('Hello world');
      expect(result[0].startTime).toBe(0);
      expect(result[0].endTime).toBe(2);
      expect(result[0].confidence).toBeCloseTo(0.85, 5);
      expect(result[0].noSpeechProb).toBeCloseTo(0.15, 5);
    });

    test('does not merge segments from different speakers', () => {
      const segments: TranscriptionSegment[] = [
        {
          speaker: 'Alice',
          text: 'Hello',
          startTime: 0,
          endTime: 1,
          confidence: 0.9,
          noSpeechProb: 0.1
        },
        {
          speaker: 'Bob',
          text: 'Hi there',
          startTime: 1,
          endTime: 2,
          confidence: 0.8,
          noSpeechProb: 0.2
        }
      ];

      const result = mergeConsecutiveSegments(segments);
      
      expect(result).toHaveLength(2);
      expect(result[0].speaker).toBe('Alice');
      expect(result[0].text).toBe('Hello');
      expect(result[1].speaker).toBe('Bob');
      expect(result[1].text).toBe('Hi there');
    });
  });

  describe('complex scenarios', () => {
    test('merges multiple consecutive segments from same speaker', () => {
      const segments: TranscriptionSegment[] = [
        {
          speaker: 'Alice',
          text: 'This',
          startTime: 0,
          endTime: 1,
          confidence: 0.9,
          noSpeechProb: 0.1
        },
        {
          speaker: 'Alice',
          text: 'is',
          startTime: 1,
          endTime: 2,
          confidence: 0.8,
          noSpeechProb: 0.2
        },
        {
          speaker: 'Alice',
          text: 'a',
          startTime: 2,
          endTime: 3,
          confidence: 0.7,
          noSpeechProb: 0.3
        },
        {
          speaker: 'Alice',
          text: 'test',
          startTime: 3,
          endTime: 4,
          confidence: 0.95,
          noSpeechProb: 0.05
        }
      ];

      const result = mergeConsecutiveSegments(segments);
      
      expect(result).toHaveLength(1);
      expect(result[0].speaker).toBe('Alice');
      expect(result[0].text).toBe('This is a test');
      expect(result[0].startTime).toBe(0);
      expect(result[0].endTime).toBe(4);
      // Averaging happens pairwise: 0.9 -> (0.9+0.8)/2=0.85 -> (0.85+0.7)/2=0.775 -> (0.775+0.95)/2=0.8625
      // noSpeechProb: 0.1 -> (0.1+0.2)/2=0.15 -> (0.15+0.3)/2=0.225 -> (0.225+0.05)/2=0.1375
      expect(result[0].confidence).toBeCloseTo(0.8625, 5);
      expect(result[0].noSpeechProb).toBeCloseTo(0.1375, 5);
    });

    test('handles alternating speakers', () => {
      const segments: TranscriptionSegment[] = [
        {
          speaker: 'Alice',
          text: 'Hello',
          startTime: 0,
          endTime: 1,
          confidence: 0.9,
          noSpeechProb: 0.1
        },
        {
          speaker: 'Bob',
          text: 'Hi',
          startTime: 1,
          endTime: 2,
          confidence: 0.8,
          noSpeechProb: 0.2
        },
        {
          speaker: 'Alice',
          text: 'How are you?',
          startTime: 2,
          endTime: 3,
          confidence: 0.7,
          noSpeechProb: 0.3
        },
        {
          speaker: 'Bob',
          text: 'Good thanks',
          startTime: 3,
          endTime: 4,
          confidence: 0.95,
          noSpeechProb: 0.05
        }
      ];

      const result = mergeConsecutiveSegments(segments);
      
      expect(result).toHaveLength(4);
      expect(result[0].speaker).toBe('Alice');
      expect(result[0].text).toBe('Hello');
      expect(result[1].speaker).toBe('Bob');
      expect(result[1].text).toBe('Hi');
      expect(result[2].speaker).toBe('Alice');
      expect(result[2].text).toBe('How are you?');
      expect(result[3].speaker).toBe('Bob');
      expect(result[3].text).toBe('Good thanks');
    });

    test('handles speaker returning after interruption', () => {
      const segments: TranscriptionSegment[] = [
        {
          speaker: 'Alice',
          text: 'I was thinking',
          startTime: 0,
          endTime: 1,
          confidence: 0.9,
          noSpeechProb: 0.1
        },
        {
          speaker: 'Alice',
          text: 'that we could',
          startTime: 1,
          endTime: 2,
          confidence: 0.8,
          noSpeechProb: 0.2
        },
        {
          speaker: 'Bob',
          text: 'Wait what?',
          startTime: 2,
          endTime: 3,
          confidence: 0.7,
          noSpeechProb: 0.3
        },
        {
          speaker: 'Alice',
          text: 'Never mind',
          startTime: 3,
          endTime: 4,
          confidence: 0.95,
          noSpeechProb: 0.05
        }
      ];

      const result = mergeConsecutiveSegments(segments);
      
      expect(result).toHaveLength(3);
      expect(result[0].speaker).toBe('Alice');
      expect(result[0].text).toBe('I was thinking that we could');
      expect(result[0].endTime).toBe(2);
      expect(result[1].speaker).toBe('Bob');
      expect(result[1].text).toBe('Wait what?');
      expect(result[2].speaker).toBe('Alice');
      expect(result[2].text).toBe('Never mind');
    });
  });

  describe('edge cases', () => {
    test('handles empty array', () => {
      const result = mergeConsecutiveSegments([]);
      expect(result).toEqual([]);
    });

    test('handles single segment', () => {
      const segments: TranscriptionSegment[] = [
        {
          speaker: 'Alice',
          text: 'Only segment',
          startTime: 0,
          endTime: 1,
          confidence: 0.9,
          noSpeechProb: 0.1
        }
      ];

      const result = mergeConsecutiveSegments(segments);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(segments[0]);
    });

    test('handles segments with empty text', () => {
      const segments: TranscriptionSegment[] = [
        {
          speaker: 'Alice',
          text: '',
          startTime: 0,
          endTime: 1,
          confidence: 0.9,
          noSpeechProb: 0.1
        },
        {
          speaker: 'Alice',
          text: 'hello',
          startTime: 1,
          endTime: 2,
          confidence: 0.8,
          noSpeechProb: 0.2
        }
      ];

      const result = mergeConsecutiveSegments(segments);
      
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe(' hello'); // Empty text + space + hello
    });

    test('handles segments with extreme confidence values', () => {
      const segments: TranscriptionSegment[] = [
        {
          speaker: 'Alice',
          text: 'Perfect',
          startTime: 0,
          endTime: 1,
          confidence: 1.0,
          noSpeechProb: 0.0
        },
        {
          speaker: 'Alice',
          text: 'Terrible',
          startTime: 1,
          endTime: 2,
          confidence: 0.0,
          noSpeechProb: 1.0
        }
      ];

      const result = mergeConsecutiveSegments(segments);
      
      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe(0.5);
      expect(result[0].noSpeechProb).toBe(0.5);
    });

    test('preserves original segments (immutability)', () => {
      const segments: TranscriptionSegment[] = [
        {
          speaker: 'Alice',
          text: 'Hello',
          startTime: 0,
          endTime: 1,
          confidence: 0.9,
          noSpeechProb: 0.1
        },
        {
          speaker: 'Alice',
          text: 'world',
          startTime: 1,
          endTime: 2,
          confidence: 0.8,
          noSpeechProb: 0.2
        }
      ];

      const originalSegments = JSON.parse(JSON.stringify(segments));
      mergeConsecutiveSegments(segments);
      
      expect(segments).toEqual(originalSegments);
    });
  });
});