// Lê o app.json e, quando o arquivo do Firebase existe, liga as notificações push do Android (FCM).
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  if (!fs.existsSync(path.join(__dirname, "google-services.json"))) return config;
  return { ...config, android: { ...config.android, googleServicesFile: "./google-services.json" } };
};
