import { ChatInputCommandInteraction, GuildMember, VoiceBasedChannel } from 'discord.js';
import { VoiceRecordingState } from '../types/recording';
import { ERROR_MESSAGES, SUCCESS_MESSAGES, LOG_PREFIXES } from '../config/constants';
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
      await interaction.editReply(`${LOG_PREFIXES.ERROR} ${ERROR_MESSAGES.GUILD_ONLY_COMMAND}`);
      return;
    }
    
    // Check if user is in a voice channel
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel as VoiceBasedChannel;
    
    if (!voiceChannel) {
      await interaction.editReply(`${LOG_PREFIXES.ERROR} ${ERROR_MESSAGES.NOT_IN_VOICE_CHANNEL}`);
      return;
    }
    
    // Check if we're already recording in this guild
    if (recordingState.activeSessions.has(interaction.guildId!)) {
      const existingSession = recordingState.activeSessions.get(interaction.guildId!);
      await interaction.editReply(
        `${LOG_PREFIXES.WARNING} ${ERROR_MESSAGES.ALREADY_RECORDING}\n` +
        `📁 Current session: <#${existingSession?.channelId}> (started <t:${Math.floor(existingSession!.startTime.getTime() / 1000)}:R>)`
      );
      return;
    }
    
    // Check bot permissions
    const permissions = voiceChannel.permissionsFor(interaction.client.user!);
    if (!permissions?.has(['Connect', 'Speak', 'UseVAD'])) {
      const missingPerms = [];
      if (!permissions?.has('Connect')) missingPerms.push('Connect');
      if (!permissions?.has('Speak')) missingPerms.push('Speak');
      if (!permissions?.has('UseVAD')) missingPerms.push('Use Voice Activity');
      
      await interaction.editReply(
        `${LOG_PREFIXES.ERROR} ${ERROR_MESSAGES.BOT_NO_VOICE_PERMISSIONS}\n` +
        `Missing: ${missingPerms.join(', ')}`
      );
      return;
    }
    
    // Connect to voice channel
    await interaction.editReply('🔄 Connecting to voice channel...');
    
    const connection = await connectToVoiceChannel(voiceChannel);
    
    // Create recording session
    const session = await createRecordingSession(voiceChannel, connection, interaction.client);
    
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
      `${LOG_PREFIXES.SUCCESS} **${SUCCESS_MESSAGES.RECORDING_STARTED}**\n\n` +
      `📍 **Channel:** ${voiceChannel.name}\n` +
      `⏰ **Started:** <t:${startTimestamp}:F>\n` +
      `📁 **Folder:** \`${session.folderPath.split('/').pop()}\`\n\n` +
      `${LOG_PREFIXES.RECORDING} I'll record individual clips when users speak.\n` +
      `🔇 Clips end after 1 second of silence.\n` +
      `${LOG_PREFIXES.STOP} Use \`/stop\` to stop recording and leave the channel.`
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
      `${LOG_PREFIXES.ERROR} **${ERROR_MESSAGES.CONNECTION_FAILED}:** ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}