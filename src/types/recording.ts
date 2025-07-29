import { VoiceConnection } from '@discordjs/voice';
import { Writable } from 'stream';

export interface AudioClipMetadata {
  userId: string;
  username: string;
  startTime: Date;
  filePath: string;
  duration?: number;
}

export interface RecordingSession {
  guildId: string;
  channelId: string;
  startTime: Date;
  folderPath: string;
  connection: VoiceConnection;
  userStreams: Map<string, Writable>;
  clips: AudioClipMetadata[];
}

export interface VoiceRecordingState {
  activeSessions: Map<string, RecordingSession>;
}

export interface BotConfig {
  token: string;
  clientId: string;
  guildId?: string;
}

export interface RecordingOptions {
  silenceDuration: number; // milliseconds
  outputFormat: 'ogg' | 'wav' | 'mp3';
  sampleRate: number;
  channels: number;
}

export const DEFAULT_RECORDING_OPTIONS: RecordingOptions = {
  silenceDuration: 1000,
  outputFormat: 'ogg',
  sampleRate: 48000,
  channels: 2,
};