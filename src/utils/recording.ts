import { 
  joinVoiceChannel, 
  VoiceConnection, 
  VoiceConnectionStatus, 
  entersState,
  EndBehaviorType,
  VoiceReceiver 
} from '@discordjs/voice';
import { VoiceBasedChannel, User, Client } from 'discord.js';
import { RecordingSession, AudioClipMetadata, DEFAULT_RECORDING_OPTIONS, RecordingState } from '../types/recording';
import { VOICE_CONNECTION, RECORDING, FILESYSTEM, LOG_PREFIXES, ERROR_MESSAGES } from '../config/constants';
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
    selfDeaf: VOICE_CONNECTION.SELF_DEAF,
    selfMute: VOICE_CONNECTION.SELF_MUTE,
  });

  try {
    // Wait for connection to be ready
    await entersState(connection, VoiceConnectionStatus.Ready, VOICE_CONNECTION.CONNECTION_TIMEOUT);
    console.log(`${LOG_PREFIXES.SUCCESS} Connected to voice channel: ${channel.name} in ${channel.guild.name}`);
    return connection;
  } catch (error) {
    connection.destroy();
    throw new Error(`${ERROR_MESSAGES.CONNECTION_FAILED} within ${VOICE_CONNECTION.CONNECTION_TIMEOUT / 1000} seconds: ${error}`);
  }
}

export async function createRecordingSession(
  channel: VoiceBasedChannel, 
  connection: VoiceConnection,
  client: Client
): Promise<RecordingSession> {
  const startTime = new Date();
  const folderName = formatTimestamp(startTime, true); // true for folder format
  const folderPath = path.join(process.cwd(), FILESYSTEM.RECORDINGS_DIR, folderName);
  
  // Create recording folder
  try {
    await fs.promises.access(folderPath);
  } catch {
    await fs.promises.mkdir(folderPath, { recursive: true });
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
  
  console.log(`${LOG_PREFIXES.FOLDER} Created recording session folder: ${folderPath}`);
  return session;
}

export function setupVoiceReceiver(session: RecordingSession): VoiceReceiver {
  const receiver = session.connection.receiver;
  const userRecordingStates = new Map<string, RecordingState>();
  
  receiver.speaking.on('start', async (userId) => {
    console.log(`${LOG_PREFIXES.VOICE} User ${userId} started speaking`);
    
    const currentState = userRecordingStates.get(userId) || RecordingState.IDLE;
    
    // Only start recording if user is idle
    if (currentState === RecordingState.IDLE) {
      userRecordingStates.set(userId, RecordingState.RECORDING);
      
      try {
        const user = await getUserFromSession(session, userId);
        createListeningStream(receiver, user, session, userRecordingStates);
      } catch (error) {
        console.error(`${LOG_PREFIXES.ERROR} Error starting recording for user ${userId}:`, error);
        userRecordingStates.set(userId, RecordingState.IDLE);
      }
    }
  });
  
  // Handle voice connection state changes
  session.connection.on('stateChange', (oldState, newState) => {
    console.log(`Voice connection state changed: ${oldState.status} -> ${newState.status}`);
    
    if (newState.status === 'disconnected' || newState.status === 'destroyed') {
      console.log(`🔌 Connection lost, cleaning up ${userRecordingStates.size} active recordings`);
      userRecordingStates.clear();
    }
  });
  
  // Create a specific listener for this session and store it
  const voiceStateListener = (oldState: any, newState: any) => {
    // User left the channel we're recording
    if (oldState.channelId === session.channelId && newState.channelId !== session.channelId) {
      const userId = oldState.member?.user.id;
      if (userId && userRecordingStates.has(userId)) {
        console.log(`👋 User ${oldState.member?.user.username} left voice channel, ending their recording`);
        userRecordingStates.set(userId, RecordingState.IDLE);
      }
    }
  };
  
  // Add the listener and store it on the session for later removal
  session.client.on('voiceStateUpdate', voiceStateListener);
  session.voiceStateListener = voiceStateListener;
  
  console.log(`👂 Voice receiver setup complete`);
  return receiver;
}

export function createListeningStream(
  receiver: VoiceReceiver, 
  user: any, 
  session: RecordingSession, 
  userRecordingStates: Map<string, RecordingState>
): void {
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
      maxPackets: RECORDING.MAX_PACKETS_PER_PAGE,
    },
  });

  const out = createWriteStream(filePath);

  pipeline(opusStream, oggStream, out, (err) => {
    // Set user back to idle when recording completes
    userRecordingStates.set(user.id, RecordingState.IDLE);
    
    if (err) {
      console.warn(`${LOG_PREFIXES.ERROR} Error recording file ${filename} - ${err.message}`);
    } else {
      console.log(`${LOG_PREFIXES.SUCCESS} Recorded ${filename}`);
    }
  });
}

export function stopRecordingSession(session: RecordingSession): void {
  console.log(`🛑 Stopping recording session in guild ${session.guildId}`);
  
  // Remove only our specific voice state update listener to prevent memory leaks
  if (session.voiceStateListener) {
    session.client.removeListener('voiceStateUpdate', session.voiceStateListener);
    delete session.voiceStateListener;
  }
  
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