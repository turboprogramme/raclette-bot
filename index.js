const API_URL = "https://conventional-lexy-raclette-1b139262.koyeb.app/update"; 
const GROUP_ID = "120363026172968119@g.us"; 

function refreshDashboard() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues().slice(1); 
  const total = data.length;
  if (total === 0) return;

  const guestList = data.map(r => `  🔹 *${r[1]}*`).join('\n');
  const dashboard = `📢 *TABLEAU DE BORD STAFF* 📢\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n👥 *TOTAL :* ${total}\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n📜 *PRÉSENTS :*\n${guestList}\n\n🔄 _MàJ : ${new Date().toLocaleTimeString()}_`;

  const props = PropertiesService.getScriptProperties();
  const lastKey = props.getProperty('LAST_KEY');

  // 1. Suppression sécurisée
  if (lastKey && lastKey !== "undefined") {
    try {
      const parsedKey = JSON.parse(lastKey);
      if (parsedKey && parsedKey.id) { // On vérifie que l'ID existe vraiment
        sendToBot({ action: "delete", chatId: GROUP_ID, msgId: parsedKey });
      }
    } catch(e) { console.log("Erreur parse ID: " + e); }
  }

  // 2. Envoi du nouveau
  const response = sendToBot({ action: "send", chatId: GROUP_ID, text: dashboard });

  // 3. Sauvegarde de la clé
  if (response && response.key) {
    props.setProperty('LAST_KEY', JSON.stringify(response.key));
  }
}

function sendToBot(payload) {
  const options = { 
    method: "post", 
    contentType: "application/json", 
    payload: JSON.stringify(payload), 
    muteHttpExceptions: true 
  };
  const res = UrlFetchApp.fetch(API_URL, options);
  const result = JSON.parse(res.getContentText());
  Logger.log("Réponse Bot: " + JSON.stringify(result)); // Pour voir l'erreur ici !
  return result;
}

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  
  ScriptApp.newTrigger('refreshDashboard').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('refreshDashboard').forSpreadsheet(ss).onEdit().create();
  
  console.log("✅ Surveillance activée !");
  refreshDashboard(); 
}
