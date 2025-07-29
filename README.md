# EchoLog v2 🎧

A Discord bot that records voice channels with precise timestamps for each user's speech segments. Built with TypeScript, Discord.js v14, and @discordjs/voice.

## Features ✨

- **Individual User Recording**: Records each user's speech as separate audio clips
- **Automatic Silence Detection**: Uses `EndBehaviorType.AfterSilence` (1 second) to split clips
- **Precise Timestamps**: Subsecond precision for chronological reconstruction
- **Organized Output**: Timestamp-based folders with structured file naming
- **Clean Commands**: Simple `/join` and `/stop` slash commands
- **TypeScript**: Full type safety and excellent developer experience

## Setup 🚀

### Prerequisites

- Node.js 18.0.0 or higher
- A Discord Application with bot permissions

### 1. Clone and Install

```bash
git clone <repository-url>
cd echolog-v2
npm install
```

### 2. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token
5. Copy the application ID (Client ID)

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here  # Optional: for faster command deployment during development
```

### 4. Deploy Commands

```bash
npm run deploy
```

### 5. Run the Bot

For development:
```bash
npm run dev
```

For production:
```bash
npm run build
npm start
```

## Usage 🎙️

### Commands

- **`/join`**: Join your voice channel and start recording
- **`/stop`**: Stop recording and leave the voice channel

### Recording Process

1. Join a voice channel
2. Run `/join` - the bot will connect and start listening
3. When users speak, individual clips are automatically created
4. Each clip ends after 1 second of silence
5. Use `/stop` to end the session and get a summary

### File Organization

```
recordings/
└── 2024-01-15_14-30-45-123/           # Session folder (timestamp)
    ├── 2024-01-15T14:30:47.456Z_username1.ogg
    ├── 2024-01-15T14:30:52.123Z_username2.ogg
    ├── 2024-01-15T14:30:55.789Z_username1.ogg
    └── ...
```

## Technical Details 🔧

### Audio Format
- **Container**: Ogg
- **Codec**: Opus
- **Sample Rate**: 48kHz
- **Channels**: Stereo (2)

### Timestamps
- **Folder**: `YYYY-MM-DD_HH-MM-SS-mmm` format
- **Files**: ISO 8601 format (`2024-01-15T14:30:47.456Z`)
- **Precision**: Millisecond accuracy for reconstruction

### Recording Behavior
- Records only when users are speaking (voice activity detection)
- Automatically splits on silence (1 second threshold)
- Handles user disconnect/reconnect gracefully
- No cross-talk or mixing - pure per-user isolation

## Future Features 🔮

This bot is designed as the foundation for:
- **Transcription Pipeline**: Convert audio clips to text
- **Speaker Diarization**: "Who said what and when"
- **Chronological Assembly**: Reconstruct conversations from timestamps
- **Search and Analysis**: Full-text search across recordings

## Development 💻

### Project Structure

```
src/
├── index.ts                    # Main bot file
├── deploy-commands.ts          # Command registration
├── types/
│   └── recording.ts           # TypeScript interfaces
├── commands/
│   ├── join.ts               # /join command
│   └── stop.ts               # /stop command
└── utils/
    └── recording.ts          # Core recording logic
```

### Scripts

- `npm run dev` - Development with hot reload
- `npm run build` - Compile TypeScript
- `npm start` - Run compiled JavaScript
- `npm run deploy` - Deploy slash commands
- `npm run lint` - Type check without compilation

### Key Technologies

- **Discord.js v14**: Discord API wrapper
- **@discordjs/voice**: Voice channel functionality
- **prism-media**: Audio stream processing
- **TypeScript**: Type safety and developer experience

## Troubleshooting 🔧

### Bot Won't Connect
- Check bot permissions (Connect, Speak, Use Voice Activity)
- Verify the bot is in the server
- Ensure voice channel isn't full or restricted

### No Audio Clips
- Check if users have microphones enabled
- Verify voice activity detection is working
- Look for permission issues in console logs

### File Issues
- Ensure write permissions for `recordings/` directory
- Check available disk space
- Verify FFmpeg is installed (for some audio processing)

## License 📄

MIT License - see LICENSE file for details.

## Contributing 🤝

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

---

Built with ❤️ for the Discord community