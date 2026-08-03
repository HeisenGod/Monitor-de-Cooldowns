(() => {
  let tokenSincronizado = "";
  let sincronizacaoAtual = null;

  function getConfig() {
    return window.DISCORD_VIP_CONFIG ?? {};
  }

  async function chamarSincronizacao(providerToken, action = "sync", vipChoice = null) {
    const client = window.supabaseClient;
    const functionName = getConfig().EDGE_FUNCTION_NAME || "sync-discord-vip";

    if (!client) throw new Error("Cliente do Supabase indisponível");

    const { data, error } = await client.functions.invoke(functionName, {
      body: { providerToken, action, vipChoice }
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data ?? {};
  }

  async function perguntarTierCompartilhado(providerToken) {
    if (typeof window.showCustomModal !== "function") {
      console.error("Modal do site indisponível para escolher o nível VIP.");
      return null;
    }

    const escolheuTier3 = await window.showCustomModal({
      title: "Qual é o seu nível VIP?",
      icon: "👑",
      message: "O seu cargo do Discord pode representar VIP Tier 2 ou VIP Tier 3. Selecione o seu nível:",
      cancelText: "VIP Tier 2",
      confirmText: "VIP Tier 3",
      closeOnOverlay: false
    });

    const vipChoice = escolheuTier3 ? "vip_tier_3" : "vip_tier_2";
    return chamarSincronizacao(providerToken, "save_shared_tier", vipChoice);
  }

  async function avisarForaDoServidor() {
    if (typeof window.showCustomModal !== "function") return;

    const entrarNoDiscord = await window.showCustomModal({
      title: "Você ainda não faz parte do servidor!",
      icon: "💬",
      message: "Para sincronizar automaticamente seu nível VIP, é necessário participar do servidor oficial do Discord.<br><br>Você pode continuar utilizando normalmente o site, porém seu nível será definido como <strong>Normal (Sem VIP)</strong> até entrar no servidor.",
      cancelText: "Continuar sem VIP",
      confirmText: "Entrar no Discord",
      closeOnOverlay: false
    });

    if (entrarNoDiscord) {
      window.open(getConfig().INVITE_URL, "_blank", "noopener,noreferrer");
    }
  }

  function notificarVipAtualizado(result) {
    window.dispatchEvent(new CustomEvent("discord-vip-changed", {
      detail: {
        userType: result.user_type || "normal",
        guildMember: result.guild_member !== false
      }
    }));
  }

  async function executarSincronizacao(user, providerToken) {
    if (!user || !providerToken) {
      if (user && !providerToken) {
        console.warn("Sincronização VIP ignorada: token OAuth do Discord indisponível. Faça logout e entre novamente para autorizar o novo escopo.");
      }
      return;
    }

    if (providerToken === tokenSincronizado) return;
    tokenSincronizado = providerToken;

    try {
      const { data: profileData, error: profileError } = await window.supabaseClient
        .rpc("sync_ranking_profile");

      if (profileError) throw profileError;

      const profile = Array.isArray(profileData) ? profileData[0] : profileData;
      if (profile?.is_banned) return;

      let result = await chamarSincronizacao(providerToken);

      if (result.status === "choice_required") {
        result = await perguntarTierCompartilhado(providerToken);
        if (!result) return;
      }

      if (result.status === "not_member") {
        notificarVipAtualizado(result);
        await avisarForaDoServidor();
        return;
      }

      if (result.status === "synced") {
        notificarVipAtualizado(result);
      }
    } catch (error) {
      console.error("Erro ao sincronizar VIP pelo Discord:", error);
    }
  }

  function sincronizarVipDiscord(user, providerToken) {
    if (sincronizacaoAtual) return sincronizacaoAtual;

    sincronizacaoAtual = executarSincronizacao(user, providerToken)
      .finally(() => {
        sincronizacaoAtual = null;
      });

    return sincronizacaoAtual;
  }

  window.sincronizarVipDiscord = sincronizarVipDiscord;

  window.addEventListener("discord-auth-changed", event => {
    const user = event.detail?.user ?? null;
    if (!user) {
      tokenSincronizado = "";
      return;
    }

    setTimeout(() => {
      sincronizarVipDiscord(
        user,
        event.detail?.providerToken || window.getDiscordProviderToken?.() || ""
      );
    }, 0);
  });
})();
