import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { readdirSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);

export async function startDiscordBot(rootDir) {
    // Nur starten wenn Token vorhanden
    if (!process.env.DISCORD_TOKEN) {
        console.log('⚠ DISCORD_TOKEN nicht gesetzt - Bot wird nicht gestartet');
        return;
    }

    const sodium = require('libsodium-wrappers');
    await sodium.ready;
    console.log('✓ Sodium geladen');

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
        ]
    });

    client.commands = new Collection();

    // Commands laden
    const commandsPath = path.join(rootDir, 'bot', 'src', 'commands');
    try {
        const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = await import(`file://${filePath}`);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                console.log(`✓ Command geladen: ${command.data.name}`);
            }
        }
    } catch (err) {
        console.log('⚠ Bot-Commands nicht gefunden:', err.message);
        return;
    }

    // Command Handler
    client.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Fehler bei Command ${interaction.commandName}:`, error);
            try {
                const reply = { content: '❌ Fehler beim Ausführen des Commands!', flags: 64 };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            } catch (e) {
                // Interaction bereits abgelaufen
            }
        }
    });

    process.on('unhandledRejection', error => {
        console.error('Unhandled promise rejection:', error);
    });

    client.once(Events.ClientReady, c => {
        console.log(`✓ Discord Bot online als ${c.user.tag}`);
    });

    await client.login(process.env.DISCORD_TOKEN);
}
