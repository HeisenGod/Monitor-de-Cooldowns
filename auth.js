(() => {
  let authInicializado = false;
  let capturaTokenInicializada = false;
  let usuarioAtual = null;

  function getDiscordVipConfig() {
    return window.DISCORD_VIP_CONFIG ?? {};
  }

  function getProviderTokenStorageKey() {
    return getDiscordVipConfig().PROVIDER_TOKEN_STORAGE_KEY
      || "discord_oauth_provider_token";
  }

  function salvarProviderToken(session) {
    const providerToken = session?.provider_token;
    if (providerToken) {
      window.sessionStorage.setItem(getProviderTokenStorageKey(), providerToken);
    }
  }

  function removerProviderToken() {
    window.sessionStorage.removeItem(getProviderTokenStorageKey());
  }

  function getDiscordProviderToken() {
    return window.sessionStorage.getItem(getProviderTokenStorageKey()) || "";
  }

  function inicializarCapturaProviderToken() {
    if (capturaTokenInicializada) return;
    capturaTokenInicializada = true;

    const client = getSupabaseClient();
    if (!client) return;

    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") removerProviderToken();
      else salvarProviderToken(session);
    });
  }

  function getSupabaseClient() {
    return window.supabaseClient ?? null;
  }

  function getNomeDiscord(user) {
    const metadata = user?.user_metadata ?? {};
    return (
      metadata.full_name ||
      metadata.name ||
      metadata.preferred_username ||
      metadata.user_name ||
      "Usuário do Discord"
    );
  }

  function getAvatarDiscord(user) {
    const metadata = user?.user_metadata ?? {};
    return metadata.avatar_url || metadata.picture || "";
  }

  function atualizarInterfaceLogin(user, session = null) {
    usuarioAtual = user ?? null;
    salvarProviderToken(session);

    const btnLogin = document.getElementById("btnLogin");
    const perfil = document.getElementById("perfil");
    const nomeUsuario = document.getElementById("nomeUsuario");
    const avatar = document.getElementById("avatar");

    if (btnLogin) btnLogin.style.display = user ? "none" : "inline-flex";
    if (perfil) perfil.style.display = user ? "flex" : "none";
    if (nomeUsuario) nomeUsuario.textContent = user ? getNomeDiscord(user) : "";

    if (avatar) {
      const avatarUrl = user ? getAvatarDiscord(user) : "";
      avatar.src = avatarUrl;
      avatar.style.display = avatarUrl ? "block" : "none";
    }

    window.dispatchEvent(
      new CustomEvent("discord-auth-changed", {
        detail: {
          user: usuarioAtual,
          providerToken: getDiscordProviderToken()
        }
      })
    );
  }

  async function loginDiscord() {
    const client = getSupabaseClient();
    if (!client) {
      console.error("Cliente do Supabase indisponível.");
      return;
    }

    // Mantém o caminho do repositório no GitHub Pages após o login.
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await client.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo,
        scopes: getDiscordVipConfig().OAUTH_SCOPES || "guilds.members.read"
      }
    });

    if (error) {
      console.error("Não foi possível entrar com o Discord:", error.message);
      window.alert("Não foi possível abrir o login do Discord. Confira a configuração do OAuth no Supabase.");
    }
  }

  async function logout() {
    const client = getSupabaseClient();
    if (!client) return;

    const { error } = await client.auth.signOut();
    if (error) {
      console.error("Não foi possível sair:", error.message);
      return;
    }

    removerProviderToken();
    atualizarInterfaceLogin(null);
  }

  async function getUsuarioDiscord({ validarNoServidor = false } = {}) {
    const client = getSupabaseClient();
    if (!client) return null;

    if (!validarNoServidor && usuarioAtual) return usuarioAtual;

    const result = validarNoServidor
      ? await client.auth.getUser()
      : await client.auth.getSession();

    if (result.error) {
      // Ausência de sessão é um estado normal para quem usa o site sem login.
      atualizarInterfaceLogin(null);
      return null;
    }

    const session = validarNoServidor ? null : result.data.session;
    const user = validarNoServidor ? result.data.user : session?.user;

    atualizarInterfaceLogin(user ?? null, session);
    return user ?? null;
  }

  async function verificarLogin() {
    return getUsuarioDiscord();
  }

  function inicializarAuth() {
    if (authInicializado) return;
    authInicializado = true;

    const client = getSupabaseClient();
    if (!client) {
      atualizarInterfaceLogin(null);
      return;
    }

    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") removerProviderToken();
      atualizarInterfaceLogin(session?.user ?? null, session);
    });

    verificarLogin();
  }

  window.loginDiscord = loginDiscord;
  window.logout = logout;
  window.verificarLogin = verificarLogin;
  window.getUsuarioDiscord = getUsuarioDiscord;
  window.getNomeDiscord = getNomeDiscord;
  window.getAvatarDiscord = getAvatarDiscord;
  window.getDiscordProviderToken = getDiscordProviderToken;

  inicializarCapturaProviderToken();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarAuth, { once: true });
  } else {
    inicializarAuth();
  }
})();
