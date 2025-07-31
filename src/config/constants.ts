/**
 * Configuration constants for the Discord voice recording bot
 */

// Voice Connection Constants
export const VOICE_CONNECTION = {
  /** Maximum time to wait for voice connection in milliseconds */
  CONNECTION_TIMEOUT: 30_000,
  /** Self mute state (we don't need to speak) */
  SELF_MUTE: true,
  /** Self deaf state (we need to hear to record) */
  SELF_DEAF: false,
} as const;

// Recording Constants
export const RECORDING = {
  /** Default silence duration before ending recording (ms) */
  DEFAULT_SILENCE_DURATION: 1000,
  /** Default audio channel count for recordings */
  DEFAULT_CHANNELS: 2,
  /** Default sample rate for recordings */
  DEFAULT_SAMPLE_RATE: 48000,
  /** Maximum OGG packets per logical bitstream page */
  MAX_PACKETS_PER_PAGE: 10,
} as const;

// Transcription Constants
export const TRANSCRIPTION = {
  /** Maximum file size for Groq API in MB (free tier limit) */
  MAX_FILE_SIZE_MB: 25,
  /** Groq Whisper model to use */
  WHISPER_MODEL: 'whisper-large-v3',
  /** Temperature setting for transcription (0 = more deterministic) */
  TEMPERATURE: 0,
  /** Maximum no-speech probability to include segments */
  MAX_NO_SPEECH_PROB: 0.3,
  /** Groq API endpoint */
  API_ENDPOINT: 'https://api.groq.com/openai/v1/audio/transcriptions',
} as const;

// Summarization Constants
export const SUMMARIZATION = {
  /** Groq model for summarization */
  MODEL: 'llama-3.3-70b-versatile',
  /** Temperature for summary generation (0 = more deterministic) */
  TEMPERATURE: 0.1,
  /** System prompt for STT-aware summarization */
  SYSTEM_PROMPT: `You are a professional meeting summarizer. The transcript you'll receive was generated using automatic speech-to-text (STT) technology, so be aware of potential transcription quirks:

- Common STT issues: homophones (there/their), run-on sentences, missing punctuation, background noise artifacts
- Speaker attribution is accurate - each username represents one Discord participant, though note that multiple people in the same room may appear as speech from one participant
- Focus on extracting key topics, decisions, action items, and important discussions
- Maintain speaker attribution where relevant and clear
- If you notice obvious transcription errors, use context to infer the intended meaning
- Organize the summary in a clear, readable format with sections

Provide a concise but comprehensive summary that captures the essence of the conversation.`,
} as const;

// VAD (Voice Activity Detection) Constants
export const VAD = {
  /** Positive speech threshold (higher = more strict) */
  POSITIVE_SPEECH_THRESHOLD: 0.6,
  /** Negative speech threshold */
  NEGATIVE_SPEECH_THRESHOLD: 0.4,
  /** Sample rate for VAD processing */
  SAMPLE_RATE: 16000,
  /** Audio channels for VAD processing */
  CHANNELS: 1,
  /** PCM format for VAD */
  PCM_FORMAT: 'pcm_s16le',
  /** WAV header size in bytes */
  WAV_HEADER_SIZE: 44,
  /** PCM sample scaling factor (16-bit to float) */
  PCM_SCALE_FACTOR: 32768.0,
  /** Fallback speech duration in milliseconds if VAD fails */
  FALLBACK_SPEECH_DURATION: 10000,
} as const;

// File System Constants
export const FILESYSTEM = {
  /** Recordings directory name */
  RECORDINGS_DIR: 'recordings',
  /** Mixed timeline filename */
  MIXED_TIMELINE_FILENAME: 'mixed_timeline.ogg',
  /** Transcript filename */
  TRANSCRIPT_FILENAME: 'transcript.md',
  /** Summary filename */
  SUMMARY_FILENAME: 'summary.md',
  /** VAD temporary file suffix */
  VAD_TEMP_SUFFIX: '_vad_temp.wav',
  /** File extension for audio recordings */
  AUDIO_EXTENSION: '.ogg',
  /** File extension for markdown transcripts */
  TRANSCRIPT_EXTENSION: '.md',
} as const;

// Discord Constants
export const DISCORD = {
  /** Required intents for the bot */
  REQUIRED_INTENTS: [
    'Guilds',
    'GuildVoiceStates',
  ] as const,
  /** Required permissions for the bot */
  REQUIRED_PERMISSIONS: [
    'Connect',
    'Speak',
    'UseVAD',
    'ViewChannel',
    'SendMessages',
  ] as const,
  /** OAuth2 scopes needed */
  OAUTH_SCOPES: ['Bot', 'ApplicationsCommands'] as const,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  DISCORD_TOKEN_MISSING: 'DISCORD_TOKEN is required in .env file!',
  GROQ_API_KEY_MISSING: 'GROQ_API_KEY environment variable is required',
  GUILD_ONLY_COMMAND: 'This command can only be used in a server!',
  NOT_IN_VOICE_CHANNEL: 'You must be in a voice channel to use this command!',
  BOT_NO_VOICE_PERMISSIONS: 'I need permission to connect to and record in voice channels!',
  ALREADY_RECORDING: 'Already recording in this server! Use `/stop` to end the current session.',
  NO_ACTIVE_SESSION: 'No active recording session! Use `/join` while in a voice channel to start recording.',
  CONNECTION_FAILED: 'Failed to connect to voice channel',
  TRANSCRIPTION_FAILED: 'Transcription failed',
  AUDIO_MIXING_FAILED: 'Audio mixing failed',
  NO_OGG_FILES: 'No OGG files found to transcribe',
  NO_TRANSCRIBABLE_SEGMENTS: 'No transcribable segments found in any audio files',
  USER_FETCH_FAILED: 'Could not access client to fetch user information',
  SUMMARIZATION_FAILED: 'Failed to generate summary',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  BOT_READY: 'Ready to record voice channels!',
  RECORDING_STARTED: 'Started recording voice channel',
  RECORDING_STOPPED: 'Recording stopped successfully',
  TRANSCRIPT_CREATED: 'Transcript created successfully',
  MIXED_TIMELINE_CREATED: 'Mixed timeline created successfully',
  SUMMARY_CREATED: 'Summary created successfully',
} as const;

// Logging Prefixes
export const LOG_PREFIXES = {
  SUCCESS: '✅',
  ERROR: '❌', 
  WARNING: '⚠️',
  INFO: '📍',
  RECORDING: '🎙️',
  AUDIO: '🎵',
  TRANSCRIPT: '📝',
  FOLDER: '📁',
  CONNECTION: '🔌',
  VOICE: '🎤',
  CLEANUP: '🧹',
  STOP: '🛑',
} as const;