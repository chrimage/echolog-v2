import { Client, GatewayIntentBits, Events, PermissionsBitField, OAuth2Scopes } from 'discord.js';
import { VoiceRecordingState } from './types/recording';
import { deployCommands } from './deploy-commands';
import { handleJoinCommand } from './commands/join';
import { handleStopCommand } from './commands/stop';
import { WebServer } from './server/web-server';
import { DISCORD, FILESYSTEM, WEB_SERVER, ERROR_MESSAGES, SUCCESS_MESSAGES, LOG_PREFIXES } from './config/constants';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Global recording state
export const recordingState: VoiceRecordingState = {
  activeSessions: new Map()
};

// Web server instance
const webServerPort = process.env[WEB_SERVER.PORT_ENV] ? parseInt(process.env[WEB_SERVER.PORT_ENV]!) : WEB_SERVER.DEFAULT_PORT;
export const webServer = new WebServer(webServerPort);

// Create Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Ensure recordings directory exists
const recordingsDir = path.join(process.cwd(), FILESYSTEM.RECORDINGS_DIR);
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Bot ready event
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`${LOG_PREFIXES.SUCCESS} Logged in as ${readyClient.user.tag}!`);
  console.log(`🤖 Bot ID: ${readyClient.user.id}`);
  
  // Start web server
  try {
    await webServer.start();
    console.log(`${LOG_PREFIXES.SUCCESS} ${SUCCESS_MESSAGES.WEB_SERVER_STARTED} on ${webServer.getBaseUrl()}`);
  } catch (error) {
    console.error(`${LOG_PREFIXES.ERROR} Failed to start web server:`, error);
    console.log('⚠️ Bot will continue running, but download links will not be available');
  }
  
  // Deploy slash commands automatically
  try {
    await deployCommands();
  } catch (error) {
    console.error('❌ Failed to deploy commands on startup:', error);
    console.log('⚠️ Bot will continue running, but slash commands may not work');
  }
  
  // Generate and display invite link
  const inviteUrl = client.generateInvite({
    scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
    permissions: [
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Speak,
      PermissionsBitField.Flags.UseVAD,
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
    ],
  });
  
  console.log(`\n🔗 Invite the bot to your server:`);
  console.log(inviteUrl);
  console.log(`\n📁 Recordings will be saved to: ${recordingsDir}`);
  console.log(`🌐 Download server: ${webServer.getBaseUrl()}`);
  console.log(`🎧 Ready to record voice channels!`);
});

// Interaction handling
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'join':
        await handleJoinCommand(interaction, recordingState);
        break;
      
      case 'stop':
        await handleStopCommand(interaction, recordingState, webServer);
        break;
      
      default:
        await interaction.reply({ 
          content: `${LOG_PREFIXES.ERROR} Unknown command!`, 
          ephemeral: true 
        });
    }
  } catch (error) {
    console.error(`Error executing command ${commandName}:`, error);
    
    const errorMessage = `${LOG_PREFIXES.ERROR} There was an error executing this command!`;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
});

// Error handling
client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  
  // Stop all active recordings
  for (const [guildId, session] of recordingState.activeSessions) {
    console.log(`🛑 Stopping recording in guild ${guildId}...`);
    session.connection.destroy();
  }
  
  // Sessions will clean up automatically when connections are destroyed
  recordingState.activeSessions.clear();
  
  // Stop web server
  try {
    await webServer.stop();
  } catch (error) {
    console.error(`${LOG_PREFIXES.ERROR} Error stopping web server:`, error);
  }
  
  await client.destroy();
  console.log('👋 Bot shut down successfully.');
  process.exit(0);
});

// Validate environment and login
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error(`${LOG_PREFIXES.ERROR} ${ERROR_MESSAGES.DISCORD_TOKEN_MISSING}`);
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error(`${LOG_PREFIXES.ERROR} Failed to login:`, error);
  process.exit(1);
});