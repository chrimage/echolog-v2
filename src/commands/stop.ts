import { ChatInputCommandInteraction } from 'discord.js';
import { VoiceRecordingState } from '../types/recording';
import { stopRecordingSession } from '../utils/recording';

export async function handleStopCommand(
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
    
    // Check if we have an active recording session
    const session = recordingState.activeSessions.get(interaction.guildId!);
    if (!session) {
      await interaction.editReply(
        '❌ **No active recording session!**\n\n' +
        'Use `/join` while in a voice channel to start recording.'
      );
      return;
    }
    
    await interaction.editReply('🔄 Stopping recording and leaving voice channel...');
    
    // Calculate session duration
    const sessionDuration = new Date().getTime() - session.startTime.getTime();
    const durationMinutes = Math.floor(sessionDuration / 60000);
    const durationSeconds = Math.floor((sessionDuration % 60000) / 1000);
    
    // Get folder name for display
    const folderName = session.folderPath.split('/').pop() || 'Unknown';
    
    // Stop the recording session
    stopRecordingSession(session);
    
    // Remove from active sessions
    recordingState.activeSessions.delete(interaction.guildId!);
    
    // Success response with session summary
    const startTimestamp = Math.floor(session.startTime.getTime() / 1000);
    const endTimestamp = Math.floor(new Date().getTime() / 1000);
    
    await interaction.editReply(
      `✅ **Recording stopped!**\n\n` +
      `📊 **Session Summary:**\n` +
      `⏰ **Duration:** ${durationMinutes}m ${durationSeconds}s\n` +
      `🎙️ **Clips recorded:** ${session.clips.length}\n` +
      `📁 **Saved to:** \`${folderName}\`\n\n` +
      `📍 **Timeline:**\n` +
      `🟢 Started: <t:${startTimestamp}:T>\n` +
      `🔴 Ended: <t:${endTimestamp}:T>\n\n` +
      `🔍 Check the \`recordings/${folderName}\` folder for individual audio clips.`
    );
    
    // Log detailed session info
    console.log(`📝 Recording session ended:`);
    console.log(`   Guild: ${interaction.guild?.name} (${interaction.guildId})`);
    console.log(`   Duration: ${durationMinutes}m ${durationSeconds}s`);
    console.log(`   Clips: ${session.clips.length}`);
    console.log(`   Folder: ${folderName}`);
    
    if (session.clips.length > 0) {
      console.log(`   Clip details:`);
      session.clips.forEach((clip, index) => {
        const clipDuration = clip.duration ? `${Math.round(clip.duration / 1000)}s` : 'unknown';
        console.log(`     ${index + 1}. ${clip.username} - ${clipDuration}`);
      });
    }
    
  } catch (error) {
    console.error('Error in stop command:', error);
    
    // Try to clean up any remaining session
    const session = recordingState.activeSessions.get(interaction.guildId!);
    if (session) {
      try {
        session.connection.destroy();
        recordingState.activeSessions.delete(interaction.guildId!);
        console.log(`🧹 Emergency cleanup completed for guild ${interaction.guildId}`);
      } catch (cleanupError) {
        console.error('Error during emergency cleanup:', cleanupError);
      }
    }
    
    await interaction.editReply(
      `❌ **Error stopping recording!**\n\n` +
      `**Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
      `The bot has been disconnected, but some recordings may have been saved.\n` +
      `Check the \`recordings\` folder for any available files.`
    );
  }
}