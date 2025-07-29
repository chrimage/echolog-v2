import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import * as dotenv from 'dotenv';

dotenv.config();

const commands = [
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join your voice channel and start recording')
    .toJSON(),
  
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop recording and leave the voice channel')
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

async function deployCommands() {
  try {
    console.log('🔄 Started refreshing application (/) commands.');

    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!clientId) {
      throw new Error('CLIENT_ID is required in .env file');
    }

    let route: string;
    let scope: string;

    if (guildId) {
      // Deploy to specific guild (faster for development)
      route = Routes.applicationGuildCommands(clientId, guildId);
      scope = `guild ${guildId}`;
    } else {
      // Deploy globally (takes up to 1 hour to propagate)
      route = Routes.applicationCommands(clientId);
      scope = 'globally';
    }

    const data = await rest.put(route, { body: commands }) as any[];

    console.log(`✅ Successfully reloaded ${data.length} application (/) commands ${scope}.`);
    console.log('Commands registered:');
    data.forEach(cmd => console.log(`  • /${cmd.name}: ${cmd.description}`));
    
  } catch (error) {
    console.error('❌ Error deploying commands:', error);
    process.exit(1);
  }
}

deployCommands();