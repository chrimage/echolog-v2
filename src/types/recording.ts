import { VoiceConnection } from '@discordjs/voice';
import { Client } from 'discord.js';
import { RECORDING } from '../config/constants';

export enum RecordingState {
  IDLE = 'idle',
  RECORDING = 'recording',
  STOPPING = 'stopping'
}

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
  client: Client;
  clips: AudioClipMetadata[];
  voiceStateListener?: (oldState: any, newState: any) => void;
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
  silenceDuration: RECORDING.DEFAULT_SILENCE_DURATION,
  outputFormat: 'ogg',
  sampleRate: RECORDING.DEFAULT_SAMPLE_RATE,
  channels: RECORDING.DEFAULT_CHANNELS,
};