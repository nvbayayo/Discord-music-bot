import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import { LavalinkManager } from "lavalink-client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const required = ["DISCORD_TOKEN", "CLIENT_ID", "GUILD_ID"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key} in .env`);
}

const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  node: {
    id: "main",
    host: process.env.LAVALINK_HOST || "127.0.0.1",
    port: Number(process.env.LAVALINK_PORT || 2333),
    authorization: process.env.LAVALINK_PASSWORD || "change-this-password",
    secure: process.env.LAVALINK_SECURE === "true"
  }
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.lavalink = new LavalinkManager({
  nodes: [config.node],
  sendToShard: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    guild?.shard?.send(payload);
  },
  autoSkip: true,
  client: {
    id: config.clientId,
    username: "Limplimp Music"
  },
  playerOptions: {
    defaultSearchPlatform: "ytmsearch",
    volumeDecrementer: 1,
    onDisconnect: {
      autoReconnect: true,
      destroyPlayer: false
    },
    onEmptyQueue: {
      destroyAfterMs: 30_000
    }
  }
});

const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show the Limplimp Music menu"),
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Search YouTube Music and play a song")
    .addStringOption(o => o.setName("song").setDescription("Song name or YouTube URL").setRequired(true)),
  new SlashCommandBuilder().setName("pause").setDescription("Pause playback"),
  new SlashCommandBuilder().setName("resume").setDescription("Resume playback"),
  new SlashCommandBuilder().setName("skip").setDescription("Skip the current song"),
  new SlashCommandBuilder().setName("stop").setDescription("Stop playback and clear the queue"),
  new SlashCommandBuilder().setName("queue").setDescription("Show the music queue"),
  new SlashCommandBuilder().setName("nowplaying").setDescription("Show the current song"),
  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Set player volume")
    .addIntegerOption(o => o.setName("amount").setDescription("1–100").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle upcoming songs"),
  new SlashCommandBuilder().setName("join").setDescription("Join your voice channel"),
  new SlashCommandBuilder().setName("leave").setDescription("Leave the voice channel")
].map(c => c.toJSON());

const loopModes = new Map(); // guildId -> "off" | "track"
const menuPath = path.join(__dirname, "assets", "menu.png");

function musicEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x9b59ff)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "Limplimp Music • YouTube Music" });
}

function playerButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("music_pause").setEmoji("⏸️").setLabel("Pause").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music_resume").setEmoji("▶️").setLabel("Resume").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("music_skip").setEmoji("⏭️").setLabel("Skip").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("music_stop").setEmoji("⏹️").setLabel("Stop").setStyle(ButtonStyle.Danger)
  );
}

function getPlayer(guildId) {
  return client.lavalink.players.get(guildId);
}

async function ensurePlayer(interaction) {
  const voice = interaction.member?.voice?.channel;
  if (!voice) throw new Error("Join a voice channel first.");
  let player = getPlayer(interaction.guildId);

  if (player && player.voiceChannelId !== voice.id) {
    throw new Error("Join the voice channel I'm already using.");
  }

  if (!player) {
    player = client.lavalink.createPlayer({
      guildId: interaction.guildId,
      voiceChannelId: voice.id,
      textChannelId: interaction.channelId,
      selfDeaf: true,
      volume: 80
    });
    await player.connect();
  }
  return player;
}

async function replyError(interaction, error) {
  const content = `❌ ${error?.message || "Something went wrong."}`;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content }).catch(() => {});
  } else {
    await interaction.reply({ content, ephemeral: true }).catch(() => {});
  }
}

client.on("raw", packet => client.lavalink.sendRawData(packet));

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await client.lavalink.init({ id: client.user.id, username: client.user.username });
  console.log("Lavalink manager initialized.");
});

client.lavalink.on("trackStart", async (player, track) => {
  const channel = client.channels.cache.get(player.textChannelId);
  if (!channel) return;
  const title = track.info.title || "Unknown title";
  const author = track.info.author || "Unknown artist";
  await channel.send({
    embeds: [musicEmbed("🎶 Now Playing", `**[${title}](${track.info.uri || "https://music.youtube.com/"})**\n👤 ${author}`)],
    components: [playerButtons()]
  }).catch(() => {});
});

client.lavalink.on("trackEnd", async (player, track, payload) => {
  if (loopModes.get(player.guildId) === "track" && track) {
    try {
      player.queue.add(track, 0);
      if (!player.playing) await player.play();
    } catch (error) {
      console.error("Loop error:", error);
    }
  }
});

client.lavalink.on("nodeError", (node, error) => {
  console.error(`Lavalink node ${node.id} error:`, error);
});
client.lavalink.nodeManager.on("error", (node, error) => {
  console.error(`Lavalink node ${node.id} error:`, error);
});

client.on("interactionCreate", async interaction => {
  if (interaction.isButton()) {
    if (!interaction.customId.startsWith("music_")) return;
    const player = getPlayer(interaction.guildId);
    if (!player) return interaction.reply({ content: "No active music player.", ephemeral: true });

    try {
      const voice = interaction.member?.voice?.channel;
      if (voice && player.voiceChannelId !== voice.id) {
        return interaction.reply({ content: "Join my voice channel to control the music.", ephemeral: true });
      }

      switch (interaction.customId) {
        case "music_pause":
          await player.pause();
          return interaction.reply({ content: "⏸️ Paused.", ephemeral: true });
        case "music_resume":
          await player.resume();
          return interaction.reply({ content: "▶️ Resumed.", ephemeral: true });
        case "music_skip":
          await player.skip();
          return interaction.reply({ content: "⏭️ Skipped.", ephemeral: true });
        case "music_stop":
          loopModes.set(interaction.guildId, "off");
          await player.queue.clear();
          await player.destroy();
          return interaction.reply({ content: "⏹️ Stopped and left the voice channel.", ephemeral: true });
      }
    } catch (error) {
      return replyError(interaction, error);
    }
  }

  if (!interaction.isChatInputCommand()) return;

  try {
    const name = interaction.commandName;

    if (name === "help") {
      const attachment = new AttachmentBuilder(menuPath, { name: "menu.png" });
      const embed = musicEmbed("🌙 Limplimp Music Bot", "Anime vibes, YouTube Music, and music controls.\n\nUse **/play** to start listening.");
      embed.setImage("attachment://menu.png");
      return interaction.reply({ embeds: [embed], files: [attachment] });
    }

    if (name === "play") {
      const query = interaction.options.getString("song", true);
      await interaction.deferReply();
      const player = await ensurePlayer(interaction);
      const result = await player.search({ query }, interaction.user);

      if (!result?.tracks?.length) {
        return interaction.editReply("❌ No results found. Try another song or a YouTube URL.");
      }

      const tracks = result.tracks;
      if (result.loadType === "playlist") {
        await player.queue.add(tracks);
        if (!player.playing && !player.paused) await player.play();
        return interaction.editReply(`📃 Added **${tracks.length}** tracks from **${result.playlistInfo?.name || "playlist"}**.`);
      }

      const track = tracks[0];
      await player.queue.add(track);
      if (!player.playing && !player.paused) await player.play();

      return interaction.editReply({
        embeds: [musicEmbed("➕ Added to Queue", `**[${track.info.title}](${track.info.uri || "https://music.youtube.com/"})**\n👤 ${track.info.author || "Unknown artist"}\n\nRequested by ${interaction.user}`)]
      });
    }

    if (name === "join") {
      await ensurePlayer(interaction);
      return interaction.reply("🔊 Joined your voice channel.");
    }

    const player = getPlayer(interaction.guildId);

    if (name === "leave" || name === "stop") {
      if (!player) return interaction.reply({ content: "There is no active player.", ephemeral: true });
      loopModes.set(interaction.guildId, "off");
      await player.queue.clear();
      await player.destroy();
      return interaction.reply("⏹️ Stopped and left the voice channel.");
    }

    if (!player) return interaction.reply({ content: "Nothing is playing right now.", ephemeral: true });

    if (name === "pause") {
      await player.pause();
      return interaction.reply("⏸️ Music paused.");
    }
    if (name === "resume") {
      await player.resume();
      return interaction.reply("▶️ Music resumed.");
    }
    if (name === "skip") {
      await player.skip();
      return interaction.reply("⏭️ Skipped the current song.");
    }
    if (name === "volume") {
      const amount = interaction.options.getInteger("amount", true);
      await player.setVolume(amount);
      return interaction.reply(`🔊 Volume set to **${amount}%**.`);
    }
    if (name === "shuffle") {
      const tracks = player.queue.tracks;
      if (!tracks || tracks.length < 2) return interaction.reply("Add at least two upcoming songs to shuffle.");
      for (let i = tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
      }
      return interaction.reply("🔀 Queue shuffled.");
    }
    if (name === "queue") {
      const current = player.queue.current;
      const upcoming = player.queue.tracks || [];
      const lines = upcoming.slice(0, 10).map((t, i) => `**${i + 1}.** ${t.info.title}`);
      const description = [
        current ? `**Now:** ${current.info.title}` : "**Now:** Nothing",
        "",
        lines.length ? lines.join("\n") : "No upcoming songs."
      ].join("\n");
      return interaction.reply({ embeds: [musicEmbed("🎼 Music Queue", description)] });
    }
    if (name === "nowplaying") {
      const track = player.queue.current;
      if (!track) return interaction.reply("Nothing is playing right now.");
      return interaction.reply({
        embeds: [musicEmbed("🎧 Now Playing", `**[${track.info.title}](${track.info.uri || "https://music.youtube.com/"})**\n👤 ${track.info.author || "Unknown artist"}`)],
        components: [playerButtons()]
      });
    }
  } catch (error) {
    console.error("Interaction error:", error);
    await replyError(interaction, error);
  }
});

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands }
  );
  console.log("Slash commands registered.");
}

await registerCommands();
await client.login(config.token);
