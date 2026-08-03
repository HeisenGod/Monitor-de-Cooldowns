import { createClient } from "npm:@supabase/supabase-js@2";
import "../_shared/discord-vip-config.js";

type VipType = "normal" | "vip_tier_1" | "vip_tier_2" | "vip_tier_3" | "el_patron";

const config = (globalThis as typeof globalThis & {
  DISCORD_VIP_CONFIG: {
    GUILD_ID: string;
    ALLOWED_SITE_ORIGINS: string[];
    ROLE_IDS: {
      EL_PATRON: string;
      VIP_TIER_2_3: string;
      VIP_TIER_1: string;
    };
  };
}).DISCORD_VIP_CONFIG;

function getEnvironmentKey(legacyName: string, modernName: string) {
  const legacyValue = Deno.env.get(legacyName);
  if (legacyValue) return legacyValue;

  const modernValue = Deno.env.get(modernName);
  if (!modernValue) return "";

  try {
    const parsed = JSON.parse(modernValue);
    return String(parsed.default || Object.values(parsed)[0] || "");
  } catch {
    return modernValue;
  }
}

function getCorsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin"
  };
}

function jsonResponse(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: getCorsHeaders(origin)
  });
}

async function discordRequest(path: string, providerToken: string) {
  return fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bearer ${providerToken}` }
  });
}

Deno.serve(async request => {
  const origin = request.headers.get("Origin") || "";
  const originAllowed = !origin || config.ALLOWED_SITE_ORIGINS.includes(origin);

  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: originAllowed ? 200 : 403,
      headers: getCorsHeaders(originAllowed ? origin : "null")
    });
  }

  if (!originAllowed) return jsonResponse({ error: "Origem não autorizada" }, 403, "null");
  if (request.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405, origin);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishableKey = getEnvironmentKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
    const secretKey = getEnvironmentKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
    const authorization = request.headers.get("Authorization") || "";

    if (!supabaseUrl || !publishableKey || !secretKey || !authorization) {
      return jsonResponse({ error: "Autenticação indisponível" }, 401, origin);
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: userResult, error: userError } = await userClient.auth.getUser();
    const supabaseUser = userResult.user;

    if (userError || !supabaseUser) {
      return jsonResponse({ error: "Sessão inválida" }, 401, origin);
    }

    const body = await request.json().catch(() => ({}));
    const providerToken = typeof body.providerToken === "string" ? body.providerToken : "";
    const action = body.action === "save_shared_tier" ? body.action : "sync";
    const vipChoice = body.vipChoice as VipType | undefined;

    if (!providerToken) {
      return jsonResponse({ error: "Token do Discord ausente" }, 400, origin);
    }

    const discordUserResponse = await discordRequest("/users/@me", providerToken);
    if (!discordUserResponse.ok) {
      throw new Error(`Discord /users/@me respondeu ${discordUserResponse.status}`);
    }

    const discordUser = await discordUserResponse.json();
    const discordIdentityIds = new Set<string>();
    const metadata = supabaseUser.user_metadata || {};

    [metadata.provider_id, metadata.sub, metadata.id]
      .filter(Boolean)
      .forEach(value => discordIdentityIds.add(String(value)));

    (supabaseUser.identities || [])
      .filter(identity => identity.provider === "discord")
      .forEach(identity => {
        const identityData = identity.identity_data || {};
        [identity.identity_id, identityData.provider_id, identityData.sub, identityData.id]
          .filter(Boolean)
          .forEach(value => discordIdentityIds.add(String(value)));
      });

    if (!discordIdentityIds.has(String(discordUser.id))) {
      return jsonResponse({ error: "O token do Discord não pertence ao usuário autenticado" }, 403, origin);
    }

    const { data: profile, error: profileError } = await adminClient
      .from("ranking_profiles")
      .select("user_type, vip_tier_choice")
      .eq("supabase_user_id", supabaseUser.id)
      .maybeSingle();

    if (profileError || !profile) {
      throw profileError || new Error("Perfil do ranking ainda não foi criado");
    }

    const updateProfile = async (userType: VipType, choiceToSave?: VipType) => {
      const changes: Record<string, unknown> = {
        user_type: userType,
        discord_vip_synced_at: new Date().toISOString()
      };

      if (choiceToSave) changes.vip_tier_choice = choiceToSave;

      const { error } = await adminClient
        .from("ranking_profiles")
        .update(changes)
        .eq("supabase_user_id", supabaseUser.id);

      if (error) throw error;
    };

    const memberResponse = await discordRequest(
      `/users/@me/guilds/${config.GUILD_ID}/member`,
      providerToken
    );

    if (memberResponse.status === 404) {
      await updateProfile("normal");
      return jsonResponse({
        status: "not_member",
        guild_member: false,
        user_type: "normal"
      }, 200, origin);
    }

    if (!memberResponse.ok) {
      throw new Error(`Discord guild member respondeu ${memberResponse.status}`);
    }

    const member = await memberResponse.json();
    if (member.user?.id && String(member.user.id) !== String(discordUser.id)) {
      return jsonResponse({ error: "Membro do Discord incompatível" }, 403, origin);
    }

    const roles = new Set<string>((member.roles || []).map(String));
    let userType: VipType = "normal";
    let choiceToSave: VipType | undefined;

    if (roles.has(config.ROLE_IDS.EL_PATRON)) {
      userType = "el_patron";
    } else if (roles.has(config.ROLE_IDS.VIP_TIER_2_3)) {
      const savedChoice = profile.vip_tier_choice as VipType | null;

      if (savedChoice === "vip_tier_2" || savedChoice === "vip_tier_3") {
        userType = savedChoice;
      } else if (action === "save_shared_tier") {
        if (vipChoice !== "vip_tier_2" && vipChoice !== "vip_tier_3") {
          return jsonResponse({ error: "Escolha VIP inválida" }, 400, origin);
        }
        userType = vipChoice;
        choiceToSave = vipChoice;
      } else {
        return jsonResponse({
          status: "choice_required",
          guild_member: true
        }, 200, origin);
      }
    } else if (roles.has(config.ROLE_IDS.VIP_TIER_1)) {
      userType = "vip_tier_1";
    }

    await updateProfile(userType, choiceToSave);
    return jsonResponse({
      status: "synced",
      guild_member: true,
      user_type: userType
    }, 200, origin);
  } catch (error) {
    console.error("Falha na sincronização VIP do Discord:", error instanceof Error ? error.message : error);
    return jsonResponse({ error: "Não foi possível sincronizar o VIP agora" }, 500, origin);
  }
});
