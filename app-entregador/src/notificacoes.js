// Notificações push: nova corrida (toca o som de alarme), promoções e taxas dinâmicas (ex.: chuva).
// Chegam mesmo com o app fechado. Com o app aberto, a corrida já toca pelo pop-up — a notificação não repete o som.
import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { api } from "./api";

const NATIVO = Platform.OS !== "web";

if (NATIVO) {
  Notifications.setNotificationHandler({
    handleNotification: async n => {
      const corrida = n.request.content.data?.tipo === "corrida";
      return { shouldShowBanner: !corrida, shouldShowList: true, shouldPlaySound: !corrida, shouldSetBadge: false };
    },
  });
}

async function criarCanais() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("corridas", {
    name: "Novas corridas",
    description: "Toca o alarme quando chega uma corrida disponível.",
    importance: Notifications.AndroidImportance.MAX,
    sound: "corrida.wav",
    vibrationPattern: [0, 800, 400, 800, 400, 800],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
  });
  await Notifications.setNotificationChannelAsync("avisos", {
    name: "Promoções e taxas",
    description: "Promoções novas e taxas dinâmicas (ex.: chuva).",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 200, 300],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// Pede permissão, pega o token deste celular e manda para o servidor. Sem Firebase configurado, só não registra.
export async function registrarPush() {
  if (!NATIVO) return null;
  try {
    await criarCanais();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post("/push-token", { token, plataforma: Platform.OS });
    return token;
  } catch (e) {
    console.warn("[push] não registrado:", e?.message);
    return null;
  }
}

// Tocar na notificação abre a tela certa (corrida -> Disponíveis, promoção -> Promoção).
export function useToqueNotificacao(ir) {
  const resposta = NATIVO ? Notifications.useLastNotificationResponse() : null;
  useEffect(() => {
    const tela = resposta?.notification?.request?.content?.data?.tela;
    if (tela) ir(tela);
  }, [resposta, ir]);
}
