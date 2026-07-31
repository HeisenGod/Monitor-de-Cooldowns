(() => {
  const AUTO_REFRESH_MS = 10 * 60 * 1000;
  const NICKNAME_COOLDOWN_MS = 10 * 60 * 1000;
  const HIDDEN_AVATAR_PATH = "img/icons/Usuario.png";
  const NICKNAME_REGEX = /^[A-Za-z0-9]{2,32}$/;

  const CATEGORIAS = {
    helicoptero: "Helicóptero",
    tanque: "Tanque",
    invasao: "Invasões"
  };

  const TIPOS_USUARIO = {
    normal: "Normal",
    vip_tier_1: "VIP Tier 1",
    vip_tier_2: "VIP Tier 2",
    vip_tier_3: "VIP Tier 3",
    el_patron: "El Patron"
  };

  let categoriaAtual = "helicoptero";
  let registrosAtuais = [];
  let usuarioAtual = null;
  let tipoUsuarioAtual = "normal";
  let temposCooldown = {};
  let proximaTrocaNickname = null;
  let banimentoEmAndamento = false;

  function getElemento(id) {
    return document.getElementById(id);
  }

  function definirStatus(mensagem, tipo = "normal") {
    const status = getElemento("rankingStatus");
    if (!status) return;

    status.textContent = mensagem;
    status.dataset.tipo = tipo;
  }

  function definirStatusNickname(mensagem, tipo = "normal") {
    const status = getElemento("rankingNicknameStatus");
    if (!status) return;

    status.textContent = mensagem;
    status.dataset.tipo = tipo;
  }

  function normalizarCategoria(itemName) {
    const nome = String(itemName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (nome.includes("helicoptero")) return "helicoptero";
    if (nome.includes("tank") || nome.includes("tanque")) return "tanque";
    if (nome.includes("invasao")) return "invasao";
    return null;
  }

  function getTiposSelecionados() {
    return [...document.querySelectorAll(".ranking-type-filter:checked")]
      .map(input => input.value);
  }

  function atualizarCheckboxTodos() {
    const todos = getElemento("rankingFilterTodos");
    const filtros = [...document.querySelectorAll(".ranking-type-filter")];
    if (!todos || !filtros.length) return;

    const marcados = filtros.filter(input => input.checked).length;
    todos.checked = marcados === filtros.length;
    todos.indeterminate = marcados > 0 && marcados < filtros.length;
  }

  function obterPerfil(registro) {
    const perfil = registro.profile;
    return Array.isArray(perfil) ? perfil[0] : perfil;
  }

  function criarCelula(texto, classe = "") {
    const td = document.createElement("td");
    td.textContent = texto;
    if (classe) td.className = classe;
    return td;
  }

  function criarAvatar(perfil) {
    const celula = document.createElement("td");
    celula.className = "ranking-avatar-cell";

    const criarFallback = () => {
      const fallback = document.createElement("span");
      fallback.className = "ranking-avatar-fallback";
      fallback.textContent = (perfil?.display_name || "?").charAt(0).toUpperCase();
      return fallback;
    };

    const avatarUrl = perfil?.hide_avatar
      ? HIDDEN_AVATAR_PATH
      : perfil?.discord_avatar;

    if (avatarUrl) {
      const img = document.createElement("img");
      img.src = avatarUrl;
      img.alt = `Foto de ${perfil.display_name || "usuário"}`;
      img.loading = "lazy";
      img.addEventListener("error", () => {
        if (!perfil?.hide_avatar && img.src !== new URL(HIDDEN_AVATAR_PATH, document.baseURI).href) {
          img.src = HIDDEN_AVATAR_PATH;
          return;
        }

        img.replaceWith(criarFallback());
      });
      celula.appendChild(img);
      return celula;
    }

    celula.appendChild(criarFallback());
    return celula;
  }

  function criarTagTipo(tipo) {
    const celula = document.createElement("td");
    const tag = document.createElement("span");
    const tipoValido = TIPOS_USUARIO[tipo] ? tipo : "normal";

    tag.className = `ranking-user-tag ${tipoValido}`;
    tag.textContent = TIPOS_USUARIO[tipoValido];
    celula.appendChild(tag);
    return celula;
  }

  function renderizarRanking() {
    const corpo = getElemento("rankingBody");
    if (!corpo) return;

    const tiposSelecionados = new Set(getTiposSelecionados());
    const registrosFiltrados = registrosAtuais
      .filter(registro => {
        const perfil = obterPerfil(registro);
        return perfil && tiposSelecionados.has(perfil.user_type);
      })
      .sort((a, b) => Number(b.reset_count) - Number(a.reset_count));

    corpo.replaceChildren();

    if (!registrosFiltrados.length) {
      const linha = document.createElement("tr");
      const celula = criarCelula(
        tiposSelecionados.size
          ? "Nenhum usuário encontrado para estes filtros."
          : "Marque pelo menos um tipo de usuário.",
        "ranking-empty"
      );
      celula.colSpan = 5;
      linha.appendChild(celula);
      corpo.appendChild(linha);
      return;
    }

    registrosFiltrados.forEach((registro, indice) => {
      const perfil = obterPerfil(registro);
      const linha = document.createElement("tr");

      linha.append(
        criarCelula(`${indice + 1}º`, "ranking-position"),
        criarAvatar(perfil),
        criarCelula(perfil.display_name || "Usuário", "ranking-player-name"),
        criarTagTipo(perfil.user_type),
        criarCelula(String(registro.reset_count || 0), "ranking-reset-count")
      );

      corpo.appendChild(linha);
    });
  }

  async function carregarRanking() {
    const client = window.supabaseClient;
    if (!client) {
      definirStatus("Ranking indisponível: Supabase não foi carregado.", "erro");
      return;
    }

    definirStatus(`Carregando ranking de ${CATEGORIAS[categoriaAtual]}...`);

    const { data, error } = await client
      .from("ranking_resets")
      .select(`
        reset_count,
        profile:ranking_profiles!inner (
          display_name,
          discord_avatar,
          user_type,
          hide_avatar
        )
      `)
      .eq("category", categoriaAtual)
      .order("reset_count", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Erro ao carregar o ranking:", error.message);
      definirStatus(
        "Não foi possível carregar. Execute a versão atual de supabase-ranking.sql.",
        "erro"
      );
      return;
    }

    registrosAtuais = data ?? [];
    renderizarRanking();
    definirStatus(
      `${registrosAtuais.length} jogador(es) em ${CATEGORIAS[categoriaAtual]}. Atualização automática a cada 10 minutos.`,
      "sucesso"
    );
  }

  function notificarTemposAtualizados() {
    window.dispatchEvent(
      new CustomEvent("cooldown-config-changed", {
        detail: { userType: tipoUsuarioAtual }
      })
    );
  }

  function notificarEstatisticasUsuario(stats) {
    window.dispatchEvent(
      new CustomEvent("ranking-user-stats-changed", {
        detail: { stats }
      })
    );
  }

  function escaparHtml(texto) {
    const elemento = document.createElement("span");
    elemento.textContent = String(texto || "");
    return elemento.innerHTML;
  }

  function erroEhBanimento(error) {
    return String(error?.message || "").toLowerCase().includes("banido");
  }

  async function finalizarSessaoBanida(motivo) {
    if (banimentoEmAndamento) return;
    banimentoEmAndamento = true;

    usuarioAtual = null;
    tipoUsuarioAtual = "normal";
    atualizarEditorNickname(null);
    notificarEstatisticasUsuario(null);
    definirStatus("Esta conta está banida e não aparece no ranking.", "erro");

    const motivoSeguro = motivo
      ? `<br><br><strong>Motivo:</strong> ${escaparHtml(motivo)}`
      : "";

    if (typeof window.showCustomModal === "function") {
      await window.showCustomModal({
        title: "Usuário banido",
        message: `Sua conta foi banida e a sessão será encerrada.${motivoSeguro}`,
        icon: "🚫",
        confirmText: "Entendi",
        alertOnly: true,
        isDanger: true
      });
    } else {
      window.alert(`Sua conta foi banida.${motivo ? `\nMotivo: ${motivo}` : ""}`);
    }

    try {
      await window.logout?.();
    } finally {
      window.location.replace(`${window.location.origin}${window.location.pathname}`);
    }
  }

  async function tratarErroBanimento(error) {
    if (!erroEhBanimento(error)) return false;
    await finalizarSessaoBanida(null);
    return true;
  }

  async function carregarEstatisticasUsuario() {
    if (!usuarioAtual) {
      notificarEstatisticasUsuario(null);
      return;
    }

    const client = window.supabaseClient;
    if (!client) return;

    const { data, error } = await client.rpc("get_my_reset_stats");

    if (error) {
      if (await tratarErroBanimento(error)) return;
      console.error("Erro ao carregar totais do usuário:", error.message);
      return;
    }

    const estatisticas = Array.isArray(data) ? data[0] : data;
    notificarEstatisticasUsuario({
      total: Number(estatisticas?.total_count || 0),
      today: Number(estatisticas?.today_count || 0)
    });
  }

  async function carregarTemposCooldown(userType) {
    const client = window.supabaseClient;
    if (!client) return;

    const { data, error } = await client
      .from("cooldown_durations")
      .select("cooldown_key, duration_seconds")
      .eq("user_type", userType);

    if (error) {
      console.error("Erro ao carregar tempos do banco:", error.message);
      temposCooldown = {};
      notificarTemposAtualizados();
      return;
    }

    temposCooldown = Object.fromEntries(
      (data ?? []).map(item => [
        item.cooldown_key,
        Number(item.duration_seconds)
      ])
    );

    notificarTemposAtualizados();
  }

  function atualizarEditorNickname(perfil) {
    const input = getElemento("rankingNicknameInput");
    const botao = getElemento("rankingNicknameSave");
    const botaoEditar = getElemento("btnEditProfile");

    if (botaoEditar) {
      botaoEditar.style.display = usuarioAtual ? "flex" : "none";
    }

    if (!input || !botao) return;

    if (!usuarioAtual) {
      fecharEditorPerfil();
      input.value = "";
      input.placeholder = "Entre com o Discord para escolher seu nick";
      input.disabled = true;
      botao.disabled = true;
      proximaTrocaNickname = null;
      definirStatusNickname("O login é necessário apenas para registrar resets e trocar o nick.");
      return;
    }

    input.disabled = false;
    input.value = perfil?.display_name || window.getNomeDiscord?.(usuarioAtual) || "";
    proximaTrocaNickname = perfil?.nickname_changed_at
      ? new Date(perfil.nickname_changed_at).getTime() + NICKNAME_COOLDOWN_MS
      : null;

    atualizarCooldownNickname();
  }

  function abrirEditorPerfil(event) {
    event?.stopPropagation?.();
    if (!usuarioAtual) return;

    getElemento("settingsPopover")?.classList.remove("active");

    const modal = getElemento("profileModal");
    if (!modal) return;

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => getElemento("rankingNicknameInput")?.focus());
  }

  function fecharEditorPerfil() {
    const modal = getElemento("profileModal");
    if (!modal) return;

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }

  function atualizarCooldownNickname() {
    const botao = getElemento("rankingNicknameSave");
    if (!botao) return;

    if (!usuarioAtual) {
      botao.disabled = true;
      botao.textContent = "Salvar nick";
      return;
    }

    const restante = proximaTrocaNickname
      ? Math.max(0, proximaTrocaNickname - Date.now())
      : 0;

    if (restante > 0) {
      const minutos = Math.floor(restante / 60000);
      const segundos = Math.floor((restante % 60000) / 1000);
      botao.disabled = true;
      botao.textContent = `Aguarde ${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
      definirStatusNickname("O nick pode ser alterado uma vez a cada 10 minutos.", "aviso");
      return;
    }

    botao.disabled = false;
    botao.textContent = "Salvar nick";
    definirStatusNickname("O nome original do Discord continuará salvo no banco.");
  }

  async function carregarContextoUsuario(user) {
    usuarioAtual = user ?? null;
    tipoUsuarioAtual = "normal";

    if (!usuarioAtual) {
      atualizarEditorNickname(null);
      notificarEstatisticasUsuario(null);
      await carregarTemposCooldown("normal");
      return;
    }

    const client = window.supabaseClient;
    const { data, error } = await client.rpc("sync_ranking_profile");

    if (error) {
      if (await tratarErroBanimento(error)) return;
      console.error("Erro ao sincronizar perfil do ranking:", error.message);
      atualizarEditorNickname(null);
      await carregarTemposCooldown("normal");
      return;
    }

    const perfil = Array.isArray(data) ? data[0] : data;

    if (perfil?.is_banned) {
      await finalizarSessaoBanida(perfil.ban_reason);
      return;
    }

    banimentoEmAndamento = false;
    tipoUsuarioAtual = TIPOS_USUARIO[perfil?.user_type]
      ? perfil.user_type
      : "normal";

    atualizarEditorNickname(perfil);
    await Promise.all([
      carregarTemposCooldown(tipoUsuarioAtual),
      carregarEstatisticasUsuario()
    ]);
  }

  async function salvarNickname() {
    const input = getElemento("rankingNicknameInput");
    const botao = getElemento("rankingNicknameSave");
    const nickname = input?.value.trim() || "";

    if (!usuarioAtual) {
      definirStatusNickname("Entre com o Discord para trocar o nick.", "aviso");
      return;
    }

    if (!NICKNAME_REGEX.test(nickname)) {
      definirStatusNickname(
        "Use somente A-Z, a-z e 0-9, com 2 a 32 caracteres.",
        "erro"
      );
      return;
    }

    if (botao) botao.disabled = true;
    definirStatusNickname("Salvando nick...");

    const { data, error } = await window.supabaseClient.rpc(
      "update_ranking_nickname",
      { p_display_name: nickname }
    );

    if (error) {
      if (await tratarErroBanimento(error)) return;
      console.error("Erro ao trocar o nick:", error.message);
      atualizarCooldownNickname();
      definirStatusNickname(error.message || "Não foi possível trocar o nick.", "erro");
      return;
    }

    proximaTrocaNickname = new Date(data).getTime();
    definirStatusNickname("Nick atualizado com sucesso.", "sucesso");
    atualizarCooldownNickname();
    fecharEditorPerfil();
    await carregarRanking();
  }

  async function registrarResetNoRanking(itemName) {
    const categoria = normalizarCategoria(itemName);
    if (!categoria) return;

    const client = window.supabaseClient;
    const user = await window.getUsuarioDiscord?.();
    if (!client || !user) return;

    const { error } = await client.rpc("register_ranking_reset", {
      p_category: categoria
    });

    if (error) {
      if (await tratarErroBanimento(error)) return;
      console.error("Erro ao registrar reset no ranking:", error.message);
      definirStatus("O reset local foi salvo, mas o ranking não pôde ser atualizado.", "erro");
      return;
    }

    await carregarEstatisticasUsuario();

    if (categoriaAtual === categoria) {
      await carregarRanking();
    }
  }

  function selecionarAba(categoria) {
    if (!CATEGORIAS[categoria]) return;
    categoriaAtual = categoria;

    document.querySelectorAll(".ranking-tab").forEach(botao => {
      const ativo = botao.dataset.category === categoria;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-selected", String(ativo));
    });

    carregarRanking();
  }

  function conectarRegistroDeResets() {
    const registroOriginal = window.registerReset;
    if (typeof registroOriginal !== "function" || registroOriginal.rankingConectado) {
      return;
    }

    function registroComRanking(...args) {
      const resultado = registroOriginal.apply(this, args);
      registrarResetNoRanking(args[0]);
      return resultado;
    }

    registroComRanking.rankingConectado = true;
    window.registerReset = registroComRanking;
  }

  function configurarFiltros() {
    const todos = getElemento("rankingFilterTodos");
    const filtros = [...document.querySelectorAll(".ranking-type-filter")];

    todos?.addEventListener("change", () => {
      filtros.forEach(input => {
        input.checked = todos.checked;
      });
      todos.indeterminate = false;
      renderizarRanking();
    });

    filtros.forEach(input => {
      input.addEventListener("change", () => {
        atualizarCheckboxTodos();
        renderizarRanking();
      });
    });

    atualizarCheckboxTodos();
  }

  function configurarModalPerfil() {
    const modal = getElemento("profileModal");
    const input = getElemento("rankingNicknameInput");

    modal?.addEventListener("click", event => {
      if (event.target === modal) fecharEditorPerfil();
    });

    input?.addEventListener("input", () => {
      const valorFiltrado = input.value.replace(/[^A-Za-z0-9]/g, "");
      if (valorFiltrado !== input.value) {
        input.value = valorFiltrado;
        definirStatusNickname("Use apenas A-Z, a-z e 0-9.", "aviso");
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") fecharEditorPerfil();
    });
  }

  async function inicializarRanking() {
    conectarRegistroDeResets();
    configurarFiltros();
    configurarModalPerfil();
    selecionarAba(categoriaAtual);

    const user = await window.getUsuarioDiscord?.();
    await carregarContextoUsuario(user);

    setInterval(() => {
      carregarRanking();
      carregarContextoUsuario(usuarioAtual);
    }, AUTO_REFRESH_MS);

    setInterval(atualizarCooldownNickname, 1000);
  }

  window.selecionarAbaRanking = selecionarAba;
  window.salvarNicknameRanking = salvarNickname;
  window.abrirPerfilRanking = abrirEditorPerfil;
  window.fecharPerfilRanking = fecharEditorPerfil;
  window.atualizarEstatisticasRanking = carregarEstatisticasUsuario;
  window.getCooldownDurationSeconds = key => {
    const value = temposCooldown[key];
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  window.getCurrentRankingUserType = () => tipoUsuarioAtual;

  window.addEventListener("discord-auth-changed", event => {
    carregarContextoUsuario(event.detail?.user ?? null);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarRanking, { once: true });
  } else {
    inicializarRanking();
  }
})();
