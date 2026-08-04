(() => {
  const config = {
    GUILD_ID: "1340193447360987156",
    INVITE_URL: "https://discord.gg/rustvalley",
    OAUTH_SCOPES: "guilds.members.read",
    EDGE_FUNCTION_NAME: "sync-discord-vip",
    PROVIDER_TOKEN_STORAGE_KEY: "discord_oauth_provider_token",
    ALLOWED_SITE_ORIGINS: [
      "https://heisengod.github.io",
      "http://localhost:3000",
      "http://localhost:5500",
      "http://127.0.0.1:5500"
    ],
    ROLE_IDS: {
      EL_PATRON: "1340661135333920818",
      VIP_TIER_2_3: "1340661294344179782",
      VIP_TIER_1: "1340661304066834475"
    }
  };

  Object.freeze(config.ROLE_IDS);
  Object.freeze(config.ALLOWED_SITE_ORIGINS);
  globalThis.DISCORD_VIP_CONFIG = Object.freeze(config);
})();
