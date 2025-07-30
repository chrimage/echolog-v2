import * as fs from 'fs';
import * as path from 'path';

export interface TranscriptionSegment {
  speaker: string;
  text: string;
  startTime: number; // seconds
  endTime: number; // seconds
  confidence: number; // 0-1
  noSpeechProb: number; // 0-1
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  sessionStart: Date;
  sessionDuration: number; // milliseconds
}

export async function transcribeSessionFolder(folderPath: string): Promise<string> {
  console.log(`📝 Starting transcription for session: ${path.basename(folderPath)}`);
  
  // Find all OGG files in the session folder
  const files = fs.readdirSync(folderPath)
    .filter(file => file.endsWith('.ogg'))
    .filter(file => !file.startsWith('mixed_')); // Avoid transcribing mixed output
  
  if (files.length === 0) {
    throw new Error('No OGG files found to transcribe');
  }
  
  console.log(`🎙️ Found ${files.length} audio files to transcribe`);
  
  const allSegments: TranscriptionSegment[] = [];
  let sessionStart: Date | null = null;
  
  // Process each audio file
  for (const filename of files) {
    try {
      console.log(`🔄 Transcribing ${filename}...`);
      
      const filePath = path.join(folderPath, filename);
      const timestamp = parseTimestampFromFilename(filename);
      const speaker = extractUsernameFromFilename(filename);
      
      if (!sessionStart || timestamp < sessionStart) {
        sessionStart = timestamp;
      }
      
      const transcription = await transcribeAudioFile(filePath);
      
      // Process segments from this file
      if (transcription.segments && transcription.segments.length > 0) {
        for (const segment of transcription.segments) {
          // Filter out segments with high no_speech_prob
          if (segment.no_speech_prob <= 0.5) {
            // Calculate absolute timestamp by adding file timestamp offset
            const fileOffsetMs = timestamp.getTime() - sessionStart!.getTime();
            const absoluteStartTime = (fileOffsetMs / 1000) + segment.start;
            const absoluteEndTime = (fileOffsetMs / 1000) + segment.end;
            
            allSegments.push({
              speaker,
              text: segment.text.trim(),
              startTime: absoluteStartTime,
              endTime: absoluteEndTime,
              confidence: Math.exp(segment.avg_logprob), // Convert log prob to confidence
              noSpeechProb: segment.no_speech_prob
            });
          }
        }
      }
      
      console.log(`✅ Transcribed ${filename} - ${transcription.segments?.length || 0} segments`);
      
    } catch (error) {
      console.warn(`⚠️ Failed to transcribe ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Continue with other files even if one fails
    }
  }
  
  if (allSegments.length === 0) {
    throw new Error('No transcribable segments found in any audio files');
  }
  
  // Sort segments by start time
  allSegments.sort((a, b) => a.startTime - b.startTime);
  
  // Calculate session duration (use current time as session end)
  const sessionEnd = new Date();
  const sessionDuration = sessionEnd.getTime() - sessionStart!.getTime();
  
  // Generate markdown transcript
  const transcriptPath = path.join(folderPath, 'transcript.md');
  const transcriptContent = generateMarkdownTranscript({
    segments: allSegments,
    sessionStart: sessionStart!,
    sessionDuration
  }, path.basename(folderPath));
  
  fs.writeFileSync(transcriptPath, transcriptContent, 'utf-8');
  
  console.log(`📄 Transcript saved: ${transcriptPath}`);
  console.log(`📊 Transcription summary: ${allSegments.length} segments from ${files.length} files`);
  
  return transcriptPath;
}

async function transcribeAudioFile(filePath: string): Promise<any> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY environment variable is required');
  }
  
  // Check file size (25MB limit for free tier)
  const stats = fs.statSync(filePath);
  const fileSizeMB = stats.size / (1024 * 1024);
  if (fileSizeMB > 25) {
    console.warn(`⚠️ File ${path.basename(filePath)} is ${fileSizeMB.toFixed(1)}MB, may exceed API limits`);
  }
  
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'audio/ogg' });
  
  formData.append('file', blob, path.basename(filePath));
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0');
  
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }
  
  return await response.json();
}

function parseTimestampFromFilename(filename: string): Date {
  // Extract ISO timestamp from filename format: "2025-07-30T00:58:07.260Z_username.ogg"
  const timestampMatch = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
  
  if (!timestampMatch) {
    throw new Error(`Could not parse timestamp from filename: ${filename}`);
  }
  
  return new Date(timestampMatch[1]);
}

function extractUsernameFromFilename(filename: string): string {
  // Extract username from filename format: "2025-07-30T00:58:07.260Z_username.ogg"
  const usernameMatch = filename.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_(.+)\.ogg$/);
  
  if (!usernameMatch) {
    return 'Unknown_Speaker';
  }
  
  return usernameMatch[1];
}

function generateMarkdownTranscript(result: TranscriptionResult, sessionFolderName: string): string {
  const { segments, sessionStart, sessionDuration } = result;
  
  const durationMinutes = Math.floor(sessionDuration / 60000);
  const durationSeconds = Math.floor((sessionDuration % 60000) / 1000);
  
  let markdown = `# Recording Transcript\n\n`;
  markdown += `**Session:** ${sessionFolderName}\n`;
  markdown += `**Started:** ${sessionStart.toISOString()}\n`;
  markdown += `**Duration:** ${durationMinutes}m ${durationSeconds}s\n`;
  markdown += `**Segments:** ${segments.length}\n\n`;
  markdown += `---\n\n`;
  markdown += `## Transcript\n\n`;
  
  for (const segment of segments) {
    const timestamp = formatTimestamp(segment.startTime);
    const confidence = Math.round(segment.confidence * 100);
    
    markdown += `**[${timestamp}] ${segment.speaker} (${confidence}% confidence):** ${segment.text}\n\n`;
  }
  
  markdown += `---\n\n`;
  markdown += `*Transcript generated automatically using Groq Whisper API*\n`;
  markdown += `*Segments with >50% no-speech probability were filtered out*\n`;
  
  return markdown;
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}