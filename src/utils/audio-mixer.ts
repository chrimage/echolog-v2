import * as fs from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';

export interface ClipTimelineData {
  filename: string;
  filepath: string;
  timestamp: Date;
  offsetMs: number;
}

export async function mixSessionFolder(folderPath: string): Promise<string> {
  console.log(`🎵 Starting timeline mixing for session: ${path.basename(folderPath)}`);
  
  // Find all OGG files in the session folder
  const files = fs.readdirSync(folderPath)
    .filter(file => file.endsWith('.ogg'))
    .filter(file => !file.startsWith('mixed_')); // Avoid mixing our own output
  
  if (files.length === 0) {
    throw new Error('No OGG files found to mix');
  }
  
  if (files.length === 1) {
    console.log(`📄 Only one clip found, copying as mixed output`);
    const singleFile = files[0];
    const outputPath = path.join(folderPath, 'mixed_timeline.ogg');
    fs.copyFileSync(path.join(folderPath, singleFile), outputPath);
    return outputPath;
  }
  
  // Parse timestamps and calculate timeline positions
  const clips: ClipTimelineData[] = files.map(filename => {
    const timestamp = parseTimestampFromFilename(filename);
    return {
      filename,
      filepath: path.join(folderPath, filename),
      timestamp,
      offsetMs: 0 // Will be calculated below
    };
  }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  // Calculate session start time and offsets
  const sessionStart = clips[0].timestamp;
  clips.forEach(clip => {
    clip.offsetMs = clip.timestamp.getTime() - sessionStart.getTime();
  });
  
  console.log(`📊 Timeline calculation:`);
  console.log(`   Session start: ${sessionStart.toISOString()}`);
  clips.forEach(clip => {
    console.log(`   ${clip.filename}: +${clip.offsetMs}ms`);
  });
  
  // Estimate session duration (last clip start + estimated clip duration)
  const lastClipOffset = clips[clips.length - 1].offsetMs;
  const estimatedClipDuration = 5000; // 5 seconds default
  const sessionDurationMs = lastClipOffset + estimatedClipDuration;
  const sessionDurationSeconds = Math.ceil(sessionDurationMs / 1000);
  
  console.log(`⏱️ Estimated session duration: ${sessionDurationSeconds}s`);
  
  // Create mixed output
  const outputPath = path.join(folderPath, 'mixed_timeline.ogg');
  
  return new Promise((resolve, reject) => {
    // Build FFmpeg command with multiple inputs and adelay filters
    const command = ffmpeg();
    
    // Add all clip files as inputs
    clips.forEach(clip => {
      command.input(clip.filepath);
    });
    
    // Build complex filter for mixing with delays
    let filterComplex = '';
    const delayedInputs: string[] = [];
    
    clips.forEach((clip, index) => {
      if (clip.offsetMs > 0) {
        // Add delay to clips that don't start at the beginning
        // adelay expects delay in milliseconds for each channel (stereo = 2 channels)
        filterComplex += `[${index}]adelay=${clip.offsetMs}|${clip.offsetMs}[delayed${index}];`;
        delayedInputs.push(`[delayed${index}]`);
      } else {
        // First clip starts immediately
        delayedInputs.push(`[${index}]`);
      }
    });
    
    // Mix all delayed inputs together
    filterComplex += `${delayedInputs.join('')}amix=inputs=${clips.length}:duration=longest`;
    
    command
      .complexFilter(filterComplex)
      .audioCodec('libopus')
      .audioChannels(2)
      .audioFrequency(48000)
      .output(outputPath)
      .on('start', (commandLine: string) => {
        console.log(`🔄 FFmpeg started: ${commandLine.substring(0, 100)}...`);
      })
      .on('progress', (progress: any) => {
        if (progress.percent) {
          console.log(`⏳ Mixing progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log(`✅ Timeline mixing complete: ${path.basename(outputPath)}`);
        resolve(outputPath);
      })
      .on('error', (err: Error) => {
        console.error(`❌ FFmpeg mixing error: ${err.message}`);
        reject(new Error(`Audio mixing failed: ${err.message}`));
      })
      .run();
  });
}

function parseTimestampFromFilename(filename: string): Date {
  // Extract ISO timestamp from filename format: "2025-07-30T00:58:07.260Z_username.ogg"
  const timestampMatch = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
  
  if (!timestampMatch) {
    throw new Error(`Could not parse timestamp from filename: ${filename}`);
  }
  
  return new Date(timestampMatch[1]);
}