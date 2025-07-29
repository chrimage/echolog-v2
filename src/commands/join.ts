import { ChatInputCommandInteraction, GuildMember, VoiceBasedChannel } from 'discord.js';
import { VoiceRecordingState } from '../types/recording';
import { 
  connectToVoiceChannel, 
  createRecordingSession, 
  setupVoiceReceiver 
} from '../utils/recording';

export async function handleJoinCommand(
  interaction: ChatInputCommandInteraction, 
  recordingState: VoiceRecordingState
): Promise<void> {
  // Defer reply to give us more time
  await interaction.deferReply();
  
  try {
    // Check if user is in a guild
    if (!interaction.inGuild()) {
      await interaction.editReply('❌ This command can only be used in a server!');
      return;
    }
    
    // Check if user is in a voice channel
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel as VoiceBasedChannel;
    
    if (!voiceChannel) {
      await interaction.editReply('❌ You need to be in a voice channel first!');
      return;
    }
    
    // Check if we're already recording in this guild
    if (recordingState.activeSessions.has(interaction.guildId!)) {
      const existingSession = recordingState.activeSessions.get(interaction.guildId!);
      await interaction.editReply(
        `⚠️ Already recording in this server!\n` +
        `📁 Current session: <#${existingSession?.channelId}>\n` +
        `⏰ Started: <t:${Math.floor(existingSession!.startTime.getTime() / 1000)}:R>`
      );
      return;
    }
    
    // Check bot permissions
    const permissions = voiceChannel.permissionsFor(interaction.client.user!);
    if (!permissions?.has(['Connect', 'Speak', 'UseVAD'])) {
      await interaction.editReply(
        '❌ I need the following permissions in that voice channel:\n' +
        '• Connect\n' +
        '• Speak\n' +
        '• Use Voice Activity'
      );
      return;
    }
    
    // Connect to voice channel
    await interaction.editReply('🔄 Connecting to voice channel...');
    
    const connection = await connectToVoiceChannel(voiceChannel);
    
    // Create recording session
    const session = createRecordingSession(voiceChannel, connection);
    
    // Setup voice receiver for recording
    setupVoiceReceiver(session);
    
    // Store the session
    recordingState.activeSessions.set(interaction.guildId!, session);
    
    // Handle connection state changes
    connection.on('stateChange', (oldState, newState) => {
      console.log(`Voice connection state changed: ${oldState.status} -> ${newState.status}`);
      
      if (newState.status === 'destroyed') {
        // Clean up session if connection is destroyed
        recordingState.activeSessions.delete(interaction.guildId!);
        console.log(`🧹 Cleaned up session for guild ${interaction.guildId}`);
      }
    });
    
    // Success response
    const startTimestamp = Math.floor(session.startTime.getTime() / 1000);
    await interaction.editReply(
      `✅ **Recording started!**\n\n` +
      `📍 **Channel:** ${voiceChannel.name}\n` +
      `⏰ **Started:** <t:${startTimestamp}:F>\n` +
      `📁 **Folder:** \`${session.folderPath.split('/').pop()}\`\n\n` +
      `🎙️ I'll record individual clips when users speak.\n` +
      `🔇 Clips end after 1 second of silence.\n` +
      `🛑 Use \`/stop\` to stop recording and leave the channel.`
    );
    
    console.log(`🎬 Started recording in ${voiceChannel.guild.name}#${voiceChannel.name}`);
    
  } catch (error) {
    console.error('Error in join command:', error);
    
    // Clean up any partial session
    if (recordingState.activeSessions.has(interaction.guildId!)) {
      const session = recordingState.activeSessions.get(interaction.guildId!);
      session?.connection.destroy();
      recordingState.activeSessions.delete(interaction.guildId!);
    }
    
    await interaction.editReply(
      `❌ **Failed to start recording!**\n\n` +
      `**Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
      `**Troubleshooting:**\n` +
      `• Make sure I have permission to join your voice channel\n` +
      `• Try leaving and rejoining the voice channel\n` +
      `• Check if another bot is already connected`
    );
  }
}