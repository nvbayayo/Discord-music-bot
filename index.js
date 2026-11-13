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
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ==============================
// CONFIGURATION
// ==============================

const required = [
  "DISCORD_TOKEN",
  "CLIENT_ID",
  "GUILD_ID",
  "LAVALINK_HOST",
  "LAVALINK_PORT",
  "LAVALINK_PASSWORD"
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing ${key} in environment variables.`);
  }
}

const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,

  node: {
    id: "main",
    host: process.env.LAVALINK_HOST,
    port: Number(process.env.LAVALINK_PORT),
    authorization: process.env.LAVALINK_PASSWORD,
    secure: process.env.LAVALINK_SECURE === "true"
  }
};

// ==============================
// RENDER HEALTH CHECK SERVER
// ==============================

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, {
      "Content-Type": "application/json"
    });

    return res.end(
      JSON.stringify({
        status: "online",
        bot: "Limplimp Music Bot"
      })
    );
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server running on port ${PORT}`);
});

// ==============================
// DISCORD CLIENT
// ==============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ==============================
// LAVALINK MANAGER
// ==============================

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
      destroyAfterMs: 180000
    }
  }
});

// ==============================
// SLASH COMMANDS
// ==============================

const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show the Limplimp Music menu"),

  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a YouTube Music song")
    .addStringOption(option =>
      option
        .setName("song")
        .setDescription("Song name or YouTube URL")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pause playback"),

  new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resume playback"),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip current song"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop music and clear queue"),

  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Show the music queue"),

  new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Show currently playing song"),

  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Change music volume")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Volume from 1 to 100")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Shuffle upcoming songs"),

  new SlashCommandBuilder()
    .setName("join")
    .setDescription("Join your voice channel"),

  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Leave the voice channel")
].map(command => command.toJSON());

// ==============================
// FILES
// ==============================

const menuPath = path.join(__dirname, "assets", "menu.png");

// ==============================
// EMBEDS
// ==============================

function musicEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x9b59ff)
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: "Limplimp Music • YouTube Music"
    });
}

// ==============================
// MUSIC BUTTONS
// ==============================

function playerButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("music_pause")
      .setEmoji("⏸️")
      .setLabel("Pause")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("music_resume")
      .setEmoji("▶️")
      .setLabel("Resume")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("music_skip")
      .setEmoji("⏭️")
      .setLabel("Skip")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("music_stop")
      .setEmoji("⏹️")
      .setLabel("Stop")
      .setStyle(ButtonStyle.Danger)
  );
}

// ==============================
// PLAYER FUNCTIONS
// ==============================

function getPlayer(guildId) {
  return client.lavalink.players.get(guildId);
}

async function ensurePlayer(interaction) {
  const voice = interaction.member?.voice?.channel;

  if (!voice) {
    throw new Error("Join a voice channel first.");
  }

  let player = getPlayer(interaction.guildId);

  if (player && player.voiceChannelId !== voice.id) {
    throw new Error("I'm already playing in another voice channel.");
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

// ==============================
// ERROR HANDLER
// ==============================

async function replyError(interaction, error) {
  console.error("Command error:", error);

  const content = `❌ ${error?.message || "Something went wrong."}`;

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content,
        embeds: [],
        components: []
      });
    } else {
      await interaction.reply({
        content,
        ephemeral: true
      });
    }
  } catch (replyError) {
    console.error("Could not send error message:", replyError);
  }
}

// ==============================
// LAVALINK RAW EVENTS
// ==============================

client.on("raw", packet => {
  client.lavalink.sendRawData(packet);
});

// ==============================
// BOT READY
// ==============================

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    await client.lavalink.init({
      id: client.user.id,
      username: client.user.username
    });

    console.log("✅ Lavalink manager initialized.");
  } catch (error) {
    console.error("Lavalink initialization error:", error);
  }
});

// ==============================
// NODE EVENTS
// ==============================

client.lavalink.nodeManager.on("connect", node => {
  console.log(`✅ Lavalink node connected: ${node.id}`);
});

client.lavalink.nodeManager.on("error", (node, error) => {
  console.error(`❌ Lavalink node ${node.id} error:`, error);
});

client.lavalink.nodeManager.on("disconnect", (node, reason) => {
  console.log(`⚠️ Lavalink disconnected: ${node.id}`, reason);
});

// ==============================
// TRACK START
// ==============================

client.lavalink.on("trackStart", async (player, track) => {
  const channel = client.channels.cache.get(player.textChannelId);

  if (!channel) return;

  const title = track.info.title || "Unknown title";
  const author = track.info.author || "Unknown artist";
  const url = track.info.uri || "https://music.youtube.com/";

  const embed = musicEmbed(
    "🎶 Now Playing",
    `**[${title}](${url})**\n\n👤 **Artist:** ${author}`
  );

  await channel.send({
    embeds: [embed],
    components: [playerButtons()]
  }).catch(console.error);
});

// ==============================
// TRACK END / ERRORS
// ==============================

client.lavalink.on("trackEnd", (player, track, payload) => {
  console.log(
    `Track ended: ${track?.info?.title || "Unknown"} (${payload?.reason || "unknown reason"})`
  );
});

client.lavalink.on("trackError", (player, track, payload) => {
  console.error(
    "Track playback error:",
    track?.info?.title,
    payload
  );
});

client.lavalink.on("trackStuck", (player, track, payload) => {
  console.error(
    "Track stuck:",
    track?.info?.title,
    payload
  );
});

// ==============================
// INTERACTIONS
// ==============================

client.on("interactionCreate", async interaction => {
  // --------------------------
  // MUSIC BUTTONS
  // --------------------------

  if (interaction.isButton()) {
    if (!interaction.customId.startsWith("music_")) return;

    const player = getPlayer(interaction.guildId);

    if (!player) {
      return interaction.reply({
        content: "❌ No active music player.",
        ephemeral: true
      });
    }

    const voice = interaction.member?.voice?.channel;

    if (!voice || voice.id !== player.voiceChannelId) {
      return interaction.reply({
        content: "Join my voice channel to control the music.",
        ephemeral: true
      });
    }

    try {
      switch (interaction.customId) {
        case "music_pause":
          await player.pause();

          return interaction.reply({
            content: "⏸️ Music paused.",
            ephemeral: true
          });

        case "music_resume":
          await player.resume();

          return interaction.reply({
            content: "▶️ Music resumed.",
            ephemeral: true
          });

        case "music_skip":
          await player.skip();

          return interaction.reply({
            content: "⏭️ Song skipped.",
            ephemeral: true
          });

        case "music_stop":
          await player.queue.clear();
          await player.destroy();

          return interaction.reply({
            content: "⏹️ Music stopped and bot left.",
            ephemeral: true
          });
      }
    } catch (error) {
      return replyError(interaction, error);
    }
  }

  // --------------------------
  // SLASH COMMANDS
  // --------------------------

  if (!interaction.isChatInputCommand()) return;

  try {
    const name = interaction.commandName;

    // HELP

    if (name === "help") {
      const embed = musicEmbed(
        "🌙 Limplimp Music Bot",
        [
          "Anime vibes and YouTube Music playback.",
          "",
          "**🎵 Music Commands**",
          "`/play` - Play a song",
          "`/pause` - Pause music",
          "`/resume` - Resume music",
          "`/skip` - Skip current song",
          "`/stop` - Stop music",
          "`/queue` - Show queue",
          "`/nowplaying` - Current song",
          "`/volume` - Set volume",
          "`/shuffle` - Shuffle queue",
          "`/join` - Join voice channel",
          "`/leave` - Leave voice channel"
        ].join("\n")
      );

      if (fs.existsSync(menuPath)) {
        const attachment = new AttachmentBuilder(menuPath, {
          name: "menu.png"
        });

        embed.setImage("attachment://menu.png");

        return interaction.reply({
          embeds: [embed],
          files: [attachment]
        });
      }

      return interaction.reply({
        embeds: [embed]
      });
    }

    // PLAY

    if (name === "play") {
      const query = interaction.options.getString("song", true);

      await interaction.deferReply();

      const player = await ensurePlayer(interaction);

      const result = await player.search(
        { query },
        interaction.user
      );

      if (!result?.tracks?.length) {
        return interaction.editReply(
          "❌ No results found. Try another song or URL."
        );
      }

      const tracks = result.tracks;

      if (result.loadType === "playlist") {
        await player.queue.add(tracks);

        if (!player.playing && !player.paused) {
          await player.play();
        }

        return interaction.editReply(
          `📃 Added **${tracks.length}** songs from **${result.playlistInfo?.name || "playlist"}**.`
        );
      }

      const track = tracks[0];

      await player.queue.add(track);

      if (!player.playing && !player.paused) {
        await player.play();
      }

      const url = track.info.uri || "https://music.youtube.com/";

      return interaction.editReply({
        embeds: [
          musicEmbed(
            "➕ Added to Queue",
            `**[${track.info.title}](${url})**\n` +
            `👤 **Artist:** ${track.info.author || "Unknown artist"}\n\n` +
            `🙋 **Requested by:** ${interaction.user}`
          )
        ]
      });
    }

    // JOIN

    if (name === "join") {
      await ensurePlayer(interaction);

      return interaction.reply(
        "🔊 Joined your voice channel."
      );
    }

    // LEAVE / STOP

    const player = getPlayer(interaction.guildId);

    if (name === "leave" || name === "stop") {
      if (!player) {
        return interaction.reply({
          content: "There is no active music player.",
          ephemeral: true
        });
      }

      await player.queue.clear();
      await player.destroy();

      return interaction.reply(
        "⏹️ Music stopped and bot left the voice channel."
      );
    }

    // CHECK PLAYER

    if (!player) {
      return interaction.reply({
        content: "❌ Nothing is playing right now.",
        ephemeral: true
      });
    }

    // PAUSE

    if (name === "pause") {
      await player.pause();

      return interaction.reply("⏸️ Music paused.");
    }

    // RESUME

    if (name === "resume") {
      await player.resume();

      return interaction.reply("▶️ Music resumed.");
    }

    // SKIP

    if (name === "skip") {
      await player.skip();

      return interaction.reply("⏭️ Skipped the current song.");
    }

    // VOLUME

    if (name === "volume") {
      const amount = interaction.options.getInteger("amount", true);

      await player.setVolume(amount);

      return interaction.reply(
        `🔊 Volume set to **${amount}%**.`
      );
    }

    // SHUFFLE

    if (name === "shuffle") {
      const tracks = player.queue.tracks;

      if (!tracks || tracks.length < 2) {
        return interaction.reply(
          "Add at least two upcoming songs to shuffle."
        );
      }

      for (let i = tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
      }

      return interaction.reply("🔀 Queue shuffled.");
    }

    // QUEUE

    if (name === "queue") {
      const current = player.queue.current;
      const upcoming = player.queue.tracks || [];

      const lines = upcoming
        .slice(0, 10)
        .map((track, index) => {
          return `**${index + 1}.** ${track.info.title}`;
        });

      const description = [
        current
          ? `🎶 **Now Playing:** ${current.info.title}`
          : "🎶 **Now Playing:** Nothing",

        "",

        lines.length
          ? lines.join("\n")
          : "No upcoming songs."
      ].join("\n");

      return interaction.reply({
        embeds: [
          musicEmbed("🎼 Music Queue", description)
        ]
      });
    }

    // NOW PLAYING

    if (name === "nowplaying") {
      const track = player.queue.current;

      if (!track) {
        return interaction.reply(
          "Nothing is playing right now."
        );
      }

      const url = track.info.uri || "https://music.youtube.com/";

      return interaction.reply({
        embeds: [
          musicEmbed(
            "🎧 Now Playing",
            `**[${track.info.title}](${url})**\n\n` +
            `👤 **Artist:** ${track.info.author || "Unknown artist"}`
          )
        ],
        components: [playerButtons()]
      });
    }

  } catch (error) {
    await replyError(interaction, error);
  }
});

// ==============================
// REGISTER SLASH COMMANDS
// ==============================

async function registerCommands() {
  const rest = new REST({
    version: "10"
  }).setToken(config.token);

  await rest.put(
    Routes.applicationGuildCommands(
      config.clientId,
      config.guildId
    ),
    {
      body: commands
    }
  );

  console.log("✅ Slash commands registered.");
}

// ==============================
// START BOT
// ==============================

async function startBot() {
  try {
    await registerCommands();

    await client.login(config.token);

  } catch (error) {
    console.error("❌ Bot startup failed:", error);
    process.exit(1);
  }
}

startBot();
