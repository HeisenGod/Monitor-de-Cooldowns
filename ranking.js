(() => {
  const TABELA_RANKING = "farm_rankings";

  function getElemento(id) {
    return document.getElementById(id);
  }

  function definirStatus(mensagem, tipo = "normal") {
    const status = getElemento("rankingStatus");
    if (!status) return;

    status.textContent = mensagem;
    status.dataset.tipo = tipo;
  }

  function formatarDuracao(segundos) {
    const total = Math.max(0, Number(segundos) || 0);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function criarCelula(texto, classe = "") {
    const td = document.createElement("td");
    td.textContent = texto;
    if (classe) td.className = classe;
    return td;
  }

  function renderizarRanking(registros) {
    const corpo = getElemento("rankingBody");
    if (!corpo) return;

    corpo.replaceChildren();

    if (!registros.length) {
      const linha = document.createElement("tr");
      const celula = criarCelula("Ainda não há tempos registrados.", "ranking-empty");
      celula.colSpan = 3;
      linha.appendChild(celula);
      corpo.appendChild(linha);
      return;
    }

    registros.forEach((registro, indice) => {
      const linha = document.createElement("tr");
      const posicao = criarCelula(`${indice + 1}º`, "ranking-position");

      const jogador = document.createElement("td");
      jogador.className = "ranking-player";

      if (registro.discord_avatar) {
        const avatar = document.createElement("img");
        avatar.src = registro.discord_avatar;
        avatar.alt = "";
        avatar.loading = "lazy";
        jogador.appendChild(avatar);
      }

      const nome = document.createElement("span");
      nome.textContent = registro.discord_name || "Jogador";
      jogador.appendChild(nome);

      const tempo = criarCelula(
        formatarDuracao(registro.total_seconds),
        "ranking-time"
      );

      linha.append(posicao, jogador, tempo);
      corpo.appendChild(linha);
    });
  }

  async function carregarRankingFarm() {
    const client = window.supabaseClient;
    if (!client) {
      definirStatus("Ranking indisponível: Supabase não foi carregado.", "erro");
      return;
    }

    definirStatus("Carregando ranking...");

    const { data, error } = await client
      .from(TABELA_RANKING)
      .select("user_id, discord_name, discord_avatar, total_seconds, updated_at")
      .order("total_seconds", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Erro ao carregar o ranking:", error.message);
      definirStatus(
        "Não foi possível carregar. Execute o arquivo supabase-setup.sql no Supabase.",
        "erro"
      );
      return;
    }

    renderizarRanking(data ?? []);
    definirStatus(`Ranking atualizado: ${(data ?? []).length} jogador(es).`, "sucesso");
  }

  async function participarDoRanking() {
    const botao = getElemento("btnParticiparRanking");
    const client = window.supabaseClient;

    if (!client) {
      definirStatus("Supabase não foi carregado.", "erro");
      return;
    }

    const user = await window.getUsuarioDiscord?.({ validarNoServidor: true });
    if (!user) {
      definirStatus("Entre com o Discord para registrar seu tempo.", "aviso");
      await window.loginDiscord?.();
      return;
    }

    if (typeof window.getFarmRankingSeconds !== "function") {
      definirStatus("Não consegui ler o cronômetro de farm.", "erro");
      return;
    }

    const totalSeconds = window.getFarmRankingSeconds();
    if (totalSeconds < 1) {
      definirStatus("Inicie o cronômetro de Farm antes de participar.", "aviso");
      return;
    }

    if (botao) botao.disabled = true;
    definirStatus("Salvando seu melhor tempo...");

    const registro = {
      user_id: user.id,
      discord_name: window.getNomeDiscord?.(user) || "Usuário do Discord",
      discord_avatar: window.getAvatarDiscord?.(user) || null,
      total_seconds: totalSeconds,
      updated_at: new Date().toISOString()
    };

    const { error } = await client
      .from(TABELA_RANKING)
      .upsert(registro, { onConflict: "user_id" });

    if (botao) botao.disabled = false;

    if (error) {
      console.error("Erro ao salvar no ranking:", error.message);
      definirStatus("Não foi possível salvar seu tempo.", "erro");
      return;
    }

    definirStatus("Seu tempo foi registrado no ranking!", "sucesso");
    await carregarRankingFarm();
  }

  function atualizarBotaoParticipacao(user) {
    const botao = getElemento("btnParticiparRanking");
    if (!botao) return;

    botao.textContent = user
      ? "🏆 Registrar meu tempo"
      : "Entrar com Discord para participar";
  }

  function inicializarRanking() {
    atualizarBotaoParticipacao(null);
    carregarRankingFarm();
  }

  window.carregarRankingFarm = carregarRankingFarm;
  window.participarDoRanking = participarDoRanking;

  window.addEventListener("discord-auth-changed", (event) => {
    atualizarBotaoParticipacao(event.detail?.user ?? null);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarRanking, { once: true });
  } else {
    inicializarRanking();
  }
})();
