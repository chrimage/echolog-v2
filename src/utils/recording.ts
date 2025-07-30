import { 
  joinVoiceChannel, 
  VoiceConnection, 
  VoiceConnectionStatus, 
  entersState,
  EndBehaviorType,
  VoiceReceiver 
} from '@discordjs/voice';
import { VoiceBasedChannel, User, Client } from 'discord.js';
import { RecordingSession, AudioClipMetadata, DEFAULT_RECORDING_OPTIONS } from '../types/recording';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as prism from 'prism-media';

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
  connection: VoiceConnection,
  client: Client
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
    client,
    clips: []
  };
  
  console.log(`📁 Created recording session folder: ${folderPath}`);
  return session;
}

export function setupVoiceReceiver(session: RecordingSession): VoiceReceiver {
  const receiver = session.connection.receiver;
  const activeRecordings = new Set<string>();
  
  receiver.speaking.on('start', async (userId) => {
    console.log(`🎤 User ${userId} started speaking`);
    
    // Only create one recording per user
    if (!activeRecordings.has(userId)) {
      activeRecordings.add(userId);
      try {
        const user = await getUserFromSession(session, userId);
        createListeningStream(receiver, user, session, activeRecordings);
      } catch (error) {
        console.error(`❌ Error starting recording for user ${userId}:`, error);
        activeRecordings.delete(userId);
      }
    }
  });
  
  // Handle voice connection state changes
  session.connection.on('stateChange', (oldState, newState) => {
    console.log(`Voice connection state changed: ${oldState.status} -> ${newState.status}`);
    
    if (newState.status === 'disconnected' || newState.status === 'destroyed') {
      console.log(`🔌 Connection lost, cleaning up ${activeRecordings.size} active recordings`);
      activeRecordings.clear();
    }
  });
  
  // Handle users leaving the voice channel
  session.client.on('voiceStateUpdate', (oldState, newState) => {
    // User left the channel we're recording
    if (oldState.channelId === session.channelId && newState.channelId !== session.channelId) {
      const userId = oldState.member?.user.id;
      if (userId && activeRecordings.has(userId)) {
        console.log(`👋 User ${oldState.member?.user.username} left voice channel, ending their recording`);
        activeRecordings.delete(userId);
      }
    }
  });
  
  console.log(`👂 Voice receiver setup complete`);
  return receiver;
}

export function createListeningStream(receiver: VoiceReceiver, user: any, session: RecordingSession, activeRecordings: Set<string>): void {
  const opusStream = receiver.subscribe(user.id, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: DEFAULT_RECORDING_OPTIONS.silenceDuration,
    },
  });

  const filename = `${formatTimestamp(new Date(), false)}_${sanitizeUsername(user.username)}.ogg`;
  const filePath = path.join(session.folderPath, filename);

  console.log(`👂 Started recording ${filename}`);
  
  // Debug: check if we're getting any audio data
  let dataReceived = false;
  opusStream.on('data', (chunk) => {
    if (!dataReceived) {
      console.log(`📦 First audio chunk received for ${user.username}: ${chunk.length} bytes`);
      dataReceived = true;
    }
  });

  opusStream.on('end', () => {
    console.log(`🔚 Audio stream ended for ${user.username}, received data: ${dataReceived}`);
  });

  const oggStream = new prism.opus.OggLogicalBitstream({
    opusHead: new prism.opus.OpusHead({
      channelCount: DEFAULT_RECORDING_OPTIONS.channels,
      sampleRate: DEFAULT_RECORDING_OPTIONS.sampleRate,
    }),
    pageSizeControl: {
      maxPackets: 10,
    },
  });

  const out = createWriteStream(filePath);

  pipeline(opusStream, oggStream, out, (err) => {
    // Remove from active recordings when done
    activeRecordings.delete(user.id);
    
    if (err) {
      console.warn(`❌ Error recording file ${filename} - ${err.message}`);
    } else {
      console.log(`✅ Recorded ${filename}`);
    }
  });
}

export function stopRecordingSession(session: RecordingSession): void {
  console.log(`🛑 Stopping recording session in guild ${session.guildId}`);
  
  // Remove voice state update listeners to prevent memory leaks
  session.client.removeAllListeners('voiceStateUpdate');
  
  // Destroy voice connection (this will trigger stateChange cleanup)
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
  const client = session.client;
  
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