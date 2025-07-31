import { ChatInputCommandInteraction } from 'discord.js';
import { VoiceRecordingState } from '../types/recording';
import { stopRecordingSession } from '../utils/recording';
import { mixSessionFolder } from '../utils/audio-mixer';
import { transcribeSessionFolder } from '../utils/transcription';
import { ERROR_MESSAGES, SUCCESS_MESSAGES, LOG_PREFIXES, FILESYSTEM } from '../config/constants';
import * as fs from 'fs';

export async function handleStopCommand(
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
    
    // Check if we have an active recording session
    const session = recordingState.activeSessions.get(interaction.guildId!);
    if (!session) {
      await interaction.editReply(`${LOG_PREFIXES.ERROR} ${ERROR_MESSAGES.NO_ACTIVE_SESSION}`);
      return;
    }
    
    await interaction.editReply('🔄 Stopping recording and leaving voice channel...');
    
    // Calculate session duration
    const sessionDuration = new Date().getTime() - session.startTime.getTime();
    const durationMinutes = Math.floor(sessionDuration / 60000);
    const durationSeconds = Math.floor((sessionDuration % 60000) / 1000);
    
    // Get folder name for display
    const folderName = session.folderPath.split('/').pop() || 'Unknown';
    
    // Count actual recorded clips
    const files = await fs.promises.readdir(session.folderPath);
    const recordedClips = files
      .filter(file => file.endsWith(FILESYSTEM.AUDIO_EXTENSION) && !file.startsWith('mixed_'))
      .length;
    
    // Stop the recording session
    stopRecordingSession(session);
    
    // Remove from active sessions
    recordingState.activeSessions.delete(interaction.guildId!);
    
    // Attempt to mix audio timeline automatically
    let mixedFilePath: string | null = null;
    try {
      await interaction.editReply('🔄 Stopping recording and creating mixed timeline...');
      mixedFilePath = await mixSessionFolder(session.folderPath);
      console.log(`🎵 Mixed timeline created: ${mixedFilePath}`);
    } catch (mixError) {
      console.warn(`⚠️ Audio mixing failed: ${mixError instanceof Error ? mixError.message : 'Unknown error'}`);
      console.log(`📁 Individual clips are still available in: ${session.folderPath}`);
    }
    
    // Attempt to transcribe audio clips automatically
    let transcriptPath: string | null = null;
    try {
      await interaction.editReply('🔄 Creating transcript from audio clips...');
      transcriptPath = await transcribeSessionFolder(session.folderPath);
      console.log(`📝 Transcript created: ${transcriptPath}`);
    } catch (transcriptionError) {
      console.warn(`⚠️ Transcription failed: ${transcriptionError instanceof Error ? transcriptionError.message : 'Unknown error'}`);
      console.log(`📁 Audio files are still available in: ${session.folderPath}`);
    }
    
    // Success response with session summary
    const startTimestamp = Math.floor(session.startTime.getTime() / 1000);
    const endTimestamp = Math.floor(new Date().getTime() / 1000);
    
    // Build success message with mixing and transcription status
    let message = `${LOG_PREFIXES.SUCCESS} **${SUCCESS_MESSAGES.RECORDING_STOPPED}**\n\n` +
      `📊 **Session Summary:**\n` +
      `⏰ **Duration:** ${durationMinutes}m ${durationSeconds}s\n` +
      `${LOG_PREFIXES.RECORDING} **Clips recorded:** ${recordedClips}\n` +
      `${LOG_PREFIXES.FOLDER} **Saved to:** \`${folderName}\`\n\n` +
      `📍 **Timeline:**\n` +
      `🟢 Started: <t:${startTimestamp}:T>\n` +
      `🔴 Ended: <t:${endTimestamp}:T>\n\n`;
    
    // Add mixing status
    if (mixedFilePath) {
      message += `${LOG_PREFIXES.AUDIO} **Mixed timeline created:** \`${FILESYSTEM.MIXED_TIMELINE_FILENAME}\`\n`;
    } else {
      message += `${LOG_PREFIXES.WARNING} **Timeline mixing failed** - individual clips are available.\n`;
    }
    
    // Add transcription status
    if (transcriptPath) {
      message += `${LOG_PREFIXES.TRANSCRIPT} **Transcript created:** \`${FILESYSTEM.TRANSCRIPT_FILENAME}\`\n`;
    } else {
      message += `${LOG_PREFIXES.WARNING} **Transcription failed** - audio files are still available.\n`;
    }
    
    message += `\n🔍 Check the \`${FILESYSTEM.RECORDINGS_DIR}/${folderName}\` folder for all files.`;
    
    await interaction.editReply(message);
    
    // Log detailed session info
    console.log(`📝 Recording session ended:`);
    console.log(`   Guild: ${interaction.guild?.name} (${interaction.guildId})`);
    console.log(`   Duration: ${durationMinutes}m ${durationSeconds}s`);
    console.log(`   Clips: ${recordedClips}`);
    console.log(`   Folder: ${folderName}`);
    
    if (recordedClips > 0) {
      console.log(`   Individual clips saved to folder`);
    }
    
  } catch (error) {
    console.error('Error in stop command:', error);
    
    // Try to clean up any remaining session
    const session = recordingState.activeSessions.get(interaction.guildId!);
    if (session) {
      try {
        session.connection.destroy();
        recordingState.activeSessions.delete(interaction.guildId!);
        console.log(`${LOG_PREFIXES.CLEANUP} Emergency cleanup completed for guild ${interaction.guildId}`);
      } catch (cleanupError) {
        console.error('Error during emergency cleanup:', cleanupError);
      }
    }
    
    await interaction.editReply(
      `${LOG_PREFIXES.ERROR} Error stopping recording: ${error instanceof Error ? error.message : 'Unknown error'}\n` +
      `The bot has been disconnected. Check the \`${FILESYSTEM.RECORDINGS_DIR}\` folder for saved files.`
    );
  }
}