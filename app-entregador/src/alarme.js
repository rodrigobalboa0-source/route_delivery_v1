// Alarme de corrida nova: toca em repetição (e vibra) enquanto o aviso "Nova corrida" estiver na tela.
// Toca mesmo com o celular no silencioso (volume de mídia). Com o app fechado não toca — isso exige notificação push.
import { Platform, Vibration } from "react-native";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

let player = null;
let tocando = false;

function obterPlayer() {
  if (!player) {
    player = createAudioPlayer(require("../assets/alarme.wav"));
    player.loop = true;
    player.volume = 1;
  }
  return player;
}

export async function tocarAlarme() {
  if (tocando) return;
  tocando = true;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: "doNotMix" }).catch(() => {});
    const p = obterPlayer();
    p.seekTo(0);
    p.play();
  } catch {
    // sem áudio (ex.: navegador bloqueou o som antes de um toque na tela): fica só a vibração
  }
  if (Platform.OS !== "web") Vibration.vibrate([0, 600, 400], true);
}

export function pararAlarme() {
  if (!tocando) return;
  tocando = false;
  try { player?.pause(); } catch { /* nada tocando */ }
  if (Platform.OS !== "web") Vibration.cancel();
}
