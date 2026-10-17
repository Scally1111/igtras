const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "public", "index.html");
if (!fs.existsSync(file)) {
  console.error("Не найден public/index.html. Запусти скрипт из корня репозитория igtras.");
  process.exit(1);
}
let html = fs.readFileSync(file, "utf8");

// Queue a match start if the user presses the button before joining a room.
const oldState = "let authOK=false,authAction='login',pendingInvite=null;";
const newState = "let authOK=false,authAction='login',pendingInvite=null,pendingStartMatch=false;";
if (html.includes(oldState)) html = html.replace(oldState, newState);
else if (!html.includes("pendingStartMatch=false")) {
  console.error("Не найден ожидаемый блок состояния authOK. Файл отличается от проверенной версии; изменения не применены.");
  process.exit(1);
}

// When room join succeeds, continue a queued start request.
const oldJoined = "running=true;startBackground();$('roomDisplay').textContent=code;";
const newJoined = "running=true;startBackground();if(pendingStartMatch){pendingStartMatch=false;sock.emit('setMode',{mode:$('mode').value});sock.emit('startMatch');notice('Матч запущен');}$('roomDisplay').textContent=code;";
if (html.includes(oldJoined)) html = html.replace(oldJoined, newJoined);
else if (!html.includes("if(pendingStartMatch)")) {
  console.error("Не найден обработчик joined в ожидаемом виде. Изменения не применены.");
  process.exit(1);
}

// Replace the button handler so it joins the selected room first when needed.
const oldHandler = "$('startMatch').onclick=()=>{if(sock?.connected){sock.emit('setMode',{mode:$('mode').value});setTimeout(()=>sock.emit('startMatch'),100)}else notice('Сначала войди в комнату')};";
const newHandler = "$('startMatch').onclick=()=>{if(!authOK){notice('Сначала войди в аккаунт');return}if(!sock?.connected){notice('Нет соединения с сервером — обнови страницу и войди снова');return}if(!id){pendingStartMatch=true;join();return}sock.emit('setMode',{mode:$('mode').value});sock.emit('startMatch');notice('Матч запущен')};";
if (html.includes(oldHandler)) html = html.replace(oldHandler, newHandler);
else if (!html.includes("pendingStartMatch=true;join()")) {
  console.error("Не найден обработчик кнопки startMatch в ожидаемом виде. Изменения не применены.");
  process.exit(1);
}

fs.writeFileSync(file, html, "utf8");
console.log("Готово: кнопка «НАЧАТЬ МАТЧ» теперь сама входит в выбранную комнату, если игрок ещё не вошёл, и запускает матч после подтверждённого события joined.");
