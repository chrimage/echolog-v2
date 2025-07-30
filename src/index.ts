import { Client, GatewayIntentBits, Events, PermissionsBitField, OAuth2Scopes } from 'discord.js';
import { VoiceRecordingState } from './types/recording';
import { deployCommands } from './deploy-commands';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Global recording state
export const recordingState: VoiceRecordingState = {
  activeSessions: new Map()
};

// Create Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Ensure recordings directory exists
const recordingsDir = path.join(process.cwd(), 'recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Bot ready event
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Logged in as ${readyClient.user.tag}!`);
  console.log(`🤖 Bot ID: ${readyClient.user.id}`);
  
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
  console.log(`🎧 Ready to record voice channels!`);
});

// Interaction handling
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'join':
        const { handleJoinCommand } = await import('./commands/join');
        await handleJoinCommand(interaction, recordingState);
        break;
      
      case 'stop':
        const { handleStopCommand } = await import('./commands/stop');
        await handleStopCommand(interaction, recordingState);
        break;
      
      default:
        await interaction.reply({ 
          content: '❌ Unknown command!', 
          ephemeral: true 
        });
    }
  } catch (error) {
    console.error(`Error executing command ${commandName}:`, error);
    
    const errorMessage = '❌ There was an error executing this command!';
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
  
  await client.destroy();
  console.log('👋 Bot shut down successfully.');
  process.exit(0);
});

// Validate environment and login
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN is required in .env file!');
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error('❌ Failed to login:', error);
  process.exit(1);
});