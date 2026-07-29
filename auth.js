async function loginDiscord() {

    await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
            redirectTo: window.location.origin
        }
    });

}

async function logout(){

    await supabase.auth.signOut();

    location.reload();

}

async function verificarLogin(){

    const { data } = await supabase.auth.getUser();

    if(!data.user){

        document.getElementById("btnLogin").style.display="block";
        document.getElementById("perfil").style.display="none";

        return;
    }

    document.getElementById("btnLogin").style.display="none";
    document.getElementById("perfil").style.display="flex";

    document.getElementById("nomeUsuario").innerHTML =
        data.user.user_metadata.full_name;

    document.getElementById("avatar").src =
        data.user.user_metadata.avatar_url;

}