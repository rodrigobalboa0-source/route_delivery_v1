// Mapa no celular (Android/iOS): o mesmo Leaflet + OpenStreetMap dentro de uma WebView.
// A tela manda posição e marcadores para dentro dela com injectJavaScript.
import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { CENTRO_PADRAO, htmlAvatar, htmlCliente, htmlLoja } from "./marcadores";

const HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#m{margin:0;height:100%;background:#e5e3df}.leaflet-div-icon{background:none;border:0}</style></head>
<body><div id="m"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
var map=L.map('m',{zoomControl:false}).setView([${CENTRO_PADRAO.lat},${CENTRO_PADRAO.lng}],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap'}).addTo(map);
var eu=null,grupo=L.layerGroup().addTo(map),centrado=false,ultimoPedido=0;
function ic(html,t,a){return L.divIcon({className:'',html:html,iconSize:t,iconAnchor:a});}
window.atualizar=function(d){
  grupo.clearLayers();
  (d.marcadores||[]).forEach(function(m){L.marker([m.lat,m.lng],{icon:m.tipo==='loja'?ic(d.htmlLoja,[30,30],[15,15]):ic(d.htmlCliente,[30,38],[15,37])}).addTo(grupo);});
  if(d.posicao){
    var ll=[d.posicao.lat,d.posicao.lng];
    if(!eu){eu=L.marker(ll,{icon:ic(d.htmlAvatar,[48,48],[24,24]),zIndexOffset:1000}).addTo(map);}else{eu.setLatLng(ll);eu.setIcon(ic(d.htmlAvatar,[48,48],[24,24]));}
    if(!centrado||d.recentralizar!==ultimoPedido){centrado=true;ultimoPedido=d.recentralizar;map.setView(ll,14);}
  }
};
</script></body></html>`;

export default function Mapa({ posicao, entregador, online, marcadores = [], recentralizar }) {
  const ref = useRef(null);
  const pronto = useRef(false);
  const dados = useMemo(() => ({
    posicao, marcadores, recentralizar: recentralizar || 0,
    htmlAvatar: htmlAvatar({ fotoUrl: entregador?.fotoUrl, nome: entregador?.nomeCompleto, online }),
    htmlLoja: htmlLoja(), htmlCliente: htmlCliente(),
  }), [posicao, marcadores, recentralizar, entregador?.fotoUrl, entregador?.nomeCompleto, online]);

  const enviar = () => ref.current?.injectJavaScript(`window.atualizar && window.atualizar(${JSON.stringify(dados)}); true;`);
  useEffect(() => { if (pronto.current) enviar(); }, [dados]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <WebView
        ref={ref}
        originWhitelist={["*"]}
        source={{ html: HTML }}
        onLoadEnd={() => { pronto.current = true; enviar(); }}
        style={{ flex: 1 }}
        javaScriptEnabled
        setSupportMultipleWindows={false}
      />
    </View>
  );
}
