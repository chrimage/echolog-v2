import { 
  joinVoiceChannel, 
  VoiceConnection, 
  VoiceConnectionStatus, 
  entersState,
  EndBehaviorType,
  VoiceReceiver 
} from '@discordjs/voice';
import { VoiceBasedChannel, User } from 'discord.js';
import { RecordingSession, AudioClipMetadata, DEFAULT_RECORDING_OPTIONS } from '../types/recording';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import * as prism from 'prism-media';
import * as fs from 'fs';
import * as path from 'path';

export async function connectToVoiceChannel(channel: VoiceBasedChannel): Promise<VoiceConnection> {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,  // We need to hear to record
    selfMute: true,   // We don't need to speak
  });

  try {
    // Wait for connection to be ready
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log(`✅ Connected to voice channel: ${channel.name} in ${channel.guild.name}`);
    return connection;
  } catch (error) {
    connection.destroy();
    throw new Error(`Failed to connect to voice channel within 30 seconds: ${error}`);
  }
}

export function createRecordingSession(
  channel: VoiceBasedChannel, 
  connection: VoiceConnection
): RecordingSession {
  const startTime = new Date();
  const folderName = formatTimestamp(startTime, true); // true for folder format
  const folderPath = path.join(process.cwd(), 'recordings', folderName);
  
  // Create recording folder
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  
  const session: RecordingSession = {
    guildId: channel.guild.id,
    channelId: channel.id,
    startTime,
    folderPath,
    connection,
    userStreams: new Map(),
    clips: []
  };
  
  console.log(`📁 Created recording session folder: ${folderPath}`);
  return session;
}

export function setupVoiceReceiver(session: RecordingSession): VoiceReceiver {
  const receiver = session.connection.receiver;
  
  receiver.speaking.on('start', async (userId) => {
    try {
      console.log(`🎤 User ${userId} started speaking`);
      await createUserRecordingStream(session, userId);
    } catch (error) {
      console.error(`❌ Error starting recording for user ${userId}:`, error);
    }
  });
  
  receiver.speaking.on('end', (userId) => {
    console.log(`🔇 User ${userId} stopped speaking`);
  });
  
  console.log(`👂 Voice receiver setup complete`);
  return receiver;
}

export async function createUserRecordingStream(session: RecordingSession, userId: string): Promise<void> {
  const receiver = session.connection.receiver;
  
  // Don't create duplicate streams for the same user
  if (session.userStreams.has(userId)) {
    console.log(`⚠️ Stream already exists for user ${userId}, skipping`);
    return;
  }
  
  try {
    // Get user info for filename
    const user = await getUserFromSession(session, userId);
    const startTime = new Date();
    const filename = `${formatTimestamp(startTime, false)}_${sanitizeUsername(user.username)}.ogg`;
    const filePath = path.join(session.folderPath, filename);
    
    console.log(`🎙️ Starting recording: ${filename}`);
    
    // Subscribe to user's audio stream with silence detection
    const audioStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: DEFAULT_RECORDING_OPTIONS.silenceDuration,
      },
    });
    
    // Create Ogg stream for output
    const oggStream = new prism.opus.OggLogicalBitstream({
      opusHead: new prism.opus.OpusHead({
        channelCount: DEFAULT_RECORDING_OPTIONS.channels,
        sampleRate: DEFAULT_RECORDING_OPTIONS.sampleRate,
      }),
      pageSizeControl: {
        maxPackets: 10,
      },
    });
    
    // Create file write stream
    const fileStream = createWriteStream(filePath);
    session.userStreams.set(userId, fileStream);
    
    // Create metadata entry
    const clipMetadata: AudioClipMetadata = {
      userId,
      username: user.username,
      startTime,
      filePath,
    };
    session.clips.push(clipMetadata);
    
    // Pipeline audio stream to file
    await pipeline(audioStream, oggStream, fileStream);
    
    // Calculate duration
    const endTime = new Date();
    clipMetadata.duration = endTime.getTime() - startTime.getTime();
    
    console.log(`✅ Finished recording: ${filename} (${clipMetadata.duration}ms)`);
    
    // Clean up
    session.userStreams.delete(userId);
    
  } catch (error) {
    console.error(`❌ Error in recording stream for user ${userId}:`, error);
    
    // Clean up on error
    session.userStreams.delete(userId);
  }
}

export function stopRecordingSession(session: RecordingSession): void {
  console.log(`🛑 Stopping recording session in guild ${session.guildId}`);
  
  // Close all user streams
  for (const [userId, stream] of session.userStreams) {
    try {
      stream.end();
      console.log(`🔚 Closed stream for user ${userId}`);
    } catch (error) {
      console.error(`❌ Error closing stream for user ${userId}:`, error);
    }
  }
  
  // Clear the streams map
  session.userStreams.clear();
  
  // Destroy voice connection
  session.connection.destroy();
  console.log(`🔌 Disconnected from voice channel`);
  
  // Log session summary
  const duration = new Date().getTime() - session.startTime.getTime();
  console.log(`📊 Session summary:`);
  console.log(`   Duration: ${Math.round(duration / 1000)}s`);
  console.log(`   Clips recorded: ${session.clips.length}`);
  console.log(`   Saved to: ${session.folderPath}`);
}

// Helper functions
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

function sanitizeUsername(username: string): string {
  // Remove characters that aren't safe for filenames
  return username.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function getUserFromSession(session: RecordingSession, userId: string): Promise<User> {
  // Try to get user from the guild first
  const guild = session.connection.joinConfig.guildId;
  const client = session.connection.voice?.client;
  
  if (client) {
    try {
      return await client.users.fetch(userId);
    } catch (error) {
      console.warn(`Could not fetch user ${userId}, using fallback`);
      // Return a fallback user object
      return {
        id: userId,
        username: `User_${userId.slice(-4)}`,
        discriminator: '0000',
        tag: `User_${userId.slice(-4)}#0000`
      } as User;
    }
  }
  
  throw new Error('Could not access client to fetch user information');
}