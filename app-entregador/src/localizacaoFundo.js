// Localização "o tempo todo": enquanto o entregador está online, a posição continua indo para o sistema
// mesmo com o app minimizado, a tela bloqueada ou o app fechado. O Android mostra uma notificação fixa
// ("Você está online") enquanto isso acontece — é a regra do sistema para localização em segundo plano.
// Precisa da permissão "Permitir o tempo todo" (Configurações › Apps › Route Entregador › Permissões › Localização).
import { Linking, Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { api, carregarToken } from "./api";

export const TAREFA_LOCALIZACAO = "route-localizacao-fundo";
const NATIVO = Platform.OS !== "web";
let ultimoEnvio = 0;

// Tem de ser definida no carregamento do app (fora de componentes): o Android chama a tarefa mesmo com o app fechado.
if (NATIVO) {
  TaskManager.defineTask(TAREFA_LOCALIZACAO, async ({ data, error }) => {
    if (error) return;
    const loc = data?.locations?.[data.locations.length - 1];
    if (!loc || Date.now() - ultimoEnvio < 10000) return;
    ultimoEnvio = Date.now();
    try {
      await carregarToken(); // com o app fechado, o módulo da API começa sem o token
      await api.post("/localizacao", { lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch (e) {
      // Sessão encerrada ou conta bloqueada: para de enviar.
      if ([401, 403].includes(e.status)) await pararRastreioFundo();
    }
  });
}

// "granted" = o tempo todo; "foreground" = só durante o uso; "denied" = sem localização; "web" = navegador (não se aplica).
export async function situacaoLocalizacao() {
  if (!NATIVO) return "web";
  const frente = await Location.getForegroundPermissionsAsync().catch(() => ({ status: "denied" }));
  if (frente.status !== "granted") return "denied";
  const fundo = await Location.getBackgroundPermissionsAsync().catch(() => ({ status: "denied" }));
  return fundo.status === "granted" ? "granted" : "foreground";
}

// Pede "Permitir o tempo todo". No Android 11+ abre a tela de permissões do app (o sistema não mostra mais a pergunta).
export async function pedirLocalizacaoTempoTodo() {
  if (!NATIVO) return "web";
  const frente = await Location.requestForegroundPermissionsAsync();
  if (frente.status !== "granted") return "denied";
  const fundo = await Location.requestBackgroundPermissionsAsync().catch(() => ({ status: "denied", canAskAgain: false }));
  if (fundo.status !== "granted" && fundo.canAskAgain === false) await Linking.openSettings().catch(() => {});
  return fundo.status === "granted" ? "granted" : "foreground";
}

export async function rastreioFundoAtivo() {
  if (!NATIVO) return false;
  return Location.hasStartedLocationUpdatesAsync(TAREFA_LOCALIZACAO).catch(() => false);
}

// Liga o envio em segundo plano (só com "Permitir o tempo todo"). Devolve true se ficou ligado.
export async function iniciarRastreioFundo() {
  if (!NATIVO || (await situacaoLocalizacao()) !== "granted") return false;
  if (await rastreioFundoAtivo()) return true;
  try {
    await Location.startLocationUpdatesAsync(TAREFA_LOCALIZACAO, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15000,
      distanceInterval: 30,
      foregroundService: {
        notificationTitle: "Route Entregador — você está online",
        notificationBody: "Sua localização é enviada para acompanhar as entregas. Fique offline no app para parar.",
        notificationColor: "#2a78d6",
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch (e) {
    console.warn("[localização] segundo plano não iniciou:", e?.message);
    return false;
  }
}

export async function pararRastreioFundo() {
  if (!NATIVO) return;
  if (await rastreioFundoAtivo()) await Location.stopLocationUpdatesAsync(TAREFA_LOCALIZACAO).catch(() => {});
}
