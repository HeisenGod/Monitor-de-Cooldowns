(() => {
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
    el_patrono: "El Patrono"
  };

  let categoriaAtual = "helicoptero";
  let registrosAtuais = [];

  function getElemento(id) {
    return document.getElementById(id);
  }

  function definirStatus(mensagem, tipo = "normal") {
    const status = getElemento("rankingStatus");
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

    if (perfil?.discord_avatar) {
      const img = document.createElement("img");
      img.src = perfil.discord_avatar;
      img.alt = `Foto de ${perfil.discord_name || "usuário"}`;
      img.loading = "lazy";
      celula.appendChild(img);
      return celula;
    }

    const fallback = document.createElement("span");
    fallback.className = "ranking-avatar-fallback";
    fallback.textContent = (perfil?.discord_name || "?").charAt(0).toUpperCase();
    celula.appendChild(fallback);
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
        criarCelula(perfil.discord_name || "Usuário do Discord", "ranking-player-name"),
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
          discord_name,
          discord_avatar,
          user_type
        )
      `)
      .eq("category", categoriaAtual)
      .order("reset_count", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Erro ao carregar o ranking:", error.message);
      definirStatus(
        "Não foi possível carregar. Execute o arquivo supabase-ranking.sql.",
        "erro"
      );
      return;
    }

    registrosAtuais = data ?? [];
    renderizarRanking();
    definirStatus(
      `${registrosAtuais.length} jogador(es) em ${CATEGORIAS[categoriaAtual]}.`,
      "sucesso"
    );
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
      console.error("Erro ao registrar reset no ranking:", error.message);
      definirStatus("O reset local foi salvo, mas o ranking não pôde ser atualizado.", "erro");
      return;
    }

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

  function inicializarRanking() {
    conectarRegistroDeResets();
    configurarFiltros();
    selecionarAba(categoriaAtual);
  }

  window.carregarRanking = carregarRanking;
  window.selecionarAbaRanking = selecionarAba;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarRanking, { once: true });
  } else {
    inicializarRanking();
  }
})();
