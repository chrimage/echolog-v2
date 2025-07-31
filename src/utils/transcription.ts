import * as fs from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import Groq from 'groq-sdk';
import { TRANSCRIPTION, FILESYSTEM, SUMMARIZATION, ERROR_MESSAGES, SUCCESS_MESSAGES, LOG_PREFIXES } from '../config/constants';

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
    .filter(file => file.endsWith(FILESYSTEM.AUDIO_EXTENSION))
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
      
      // Skip VAD - rely on Whisper's built-in speech detection
      
      const transcription = await transcribeAudioFile(filePath);
      
      // Process segments from this file
      if (transcription.segments && transcription.segments.length > 0) {
        for (const segment of transcription.segments) {
          // Enhanced filtering without VAD
          if (segment.no_speech_prob <= TRANSCRIPTION.MAX_NO_SPEECH_PROB && 
              segment.text.trim().length > 3 && 
              segment.end - segment.start > 0.5) {
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
  
  // Merge consecutive segments from the same speaker
  const mergedSegments = mergeConsecutiveSegments(allSegments);
  
  // Generate markdown transcript
  const transcriptPath = path.join(folderPath, FILESYSTEM.TRANSCRIPT_FILENAME);
  const transcriptContent = generateMarkdownTranscript({
    segments: mergedSegments,
    sessionStart: sessionStart!,
    sessionDuration
  }, path.basename(folderPath));
  
  fs.writeFileSync(transcriptPath, transcriptContent, 'utf-8');
  
  console.log(`📄 Transcript saved: ${transcriptPath}`);
  console.log(`📊 Transcription summary: ${allSegments.length} segments → ${mergedSegments.length} merged segments from ${files.length} files`);
  
  // Generate summary
  try {
    console.log(`🤖 Generating summary...`);
    const summaryContent = await generateSummary(transcriptContent, path.basename(folderPath));
    const summaryPath = path.join(folderPath, FILESYSTEM.SUMMARY_FILENAME);
    fs.writeFileSync(summaryPath, summaryContent, 'utf-8');
    console.log(`${LOG_PREFIXES.SUCCESS} ${SUCCESS_MESSAGES.SUMMARY_CREATED}: ${summaryPath}`);
  } catch (error) {
    console.warn(`${LOG_PREFIXES.WARNING} ${ERROR_MESSAGES.SUMMARIZATION_FAILED}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    // Continue execution - summarization failure shouldn't block transcript generation
  }
  
  return transcriptPath;
}

async function transcribeAudioFile(filePath: string): Promise<any> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY environment variable is required');
  }
  
  // Check file size (Groq API limit)
  const stats = fs.statSync(filePath);
  const fileSizeMB = stats.size / (1024 * 1024);
  if (fileSizeMB > TRANSCRIPTION.MAX_FILE_SIZE_MB) {
    console.warn(`⚠️ File ${path.basename(filePath)} is ${fileSizeMB.toFixed(1)}MB, may exceed API limits`);
  }
  
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'audio/ogg' });
  
  formData.append('file', blob, path.basename(filePath));
  formData.append('model', TRANSCRIPTION.WHISPER_MODEL);
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', TRANSCRIPTION.TEMPERATURE.toString());
  
  const response = await fetch(TRANSCRIPTION.API_ENDPOINT, {
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

async function generateSummary(transcriptContent: string, sessionFolderName: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(ERROR_MESSAGES.GROQ_API_KEY_MISSING);
  }

  const groq = new Groq({ apiKey });

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: SUMMARIZATION.SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Please summarize the following Discord voice channel transcript:\n\n${transcriptContent}`,
        },
      ],
      model: SUMMARIZATION.MODEL,
      temperature: SUMMARIZATION.TEMPERATURE,
    });

    const summaryText = completion.choices[0]?.message?.content || 'No summary generated.';
    
    // Format the summary as markdown
    let summary = `# Recording Summary\n\n`;
    summary += `**Session:** ${sessionFolderName}\n`;
    summary += `**Generated:** ${new Date().toISOString()}\n\n`;
    summary += `---\n\n`;
    summary += summaryText;
    summary += `\n\n---\n\n`;
    summary += `*Summary generated automatically using ${SUMMARIZATION.MODEL}*\n`;
    
    return summary;
  } catch (error) {
    throw new Error(`${ERROR_MESSAGES.SUMMARIZATION_FAILED}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
  markdown += `*Segments with >${Math.round(TRANSCRIPTION.MAX_NO_SPEECH_PROB * 100)}% no-speech probability were filtered out*\n`;
  
  return markdown;
}


function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}