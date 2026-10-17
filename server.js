const express=require("express"),http=require("http"),path=require("path"),fs=require("fs"),crypto=require("crypto");
const app=express(),server=http.createServer(app),io=new(require("socket.io").Server)(server,{cors:{origin:"*"}});
const PORT=process.env.PORT||3000,WORLD={w:2200,h:1500};
const obstacles=[[280,220,230,75],[620,180,90,230],[850,360,260,70],[1240,210,90,250],[1510,310,270,75],[220,570,90,260],[420,700,260,75],[780,620,90,230],[1020,560,290,75],[1440,640,90,230],[1640,780,300,75],[330,1040,270,75],[700,1010,90,250],[990,1160,270,75],[1300,1000,90,250],[1580,1140,280,75]];
const rooms=new Map(),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
app.use(express.json({limit:"20kb"}));
const ACCOUNT_FILE=path.join(__dirname,"accounts.json");
function loadAccounts(){try{return JSON.parse(fs.readFileSync(ACCOUNT_FILE,"utf8"))}catch{return {}}}
function saveAccounts(a){const tmp=ACCOUNT_FILE+".tmp";fs.writeFileSync(tmp,JSON.stringify(a,null,2));fs.renameSync(tmp,ACCOUNT_FILE)}
function normalizeNick(n){return String(n||"").trim().normalize("NFKC").toLocaleLowerCase("en-US")}
function passwordHash(password,salt){return crypto.scryptSync(password,salt,64).toString("hex")}
app.post("/api/register",(req,res)=>{const nickname=String(req.body?.nickname||"").trim().normalize("NFKC"),password=String(req.body?.password||"");if(!/^[\p{L}\p{N}_-]{3,16}$/u.test(nickname))return res.status(400).json({error:"Ник: 3–16 символов, буквы, цифры, _ или -"});if(password.length<6||password.length>128)return res.status(400).json({error:"Пароль должен содержать от 6 до 128 символов"});const accounts=loadAccounts(),key=normalizeNick(nickname);if(accounts[key])return res.status(409).json({error:"Этот ник уже занят"});const salt=crypto.randomBytes(16).toString("hex");accounts[key]={nickname,passwordHash:passwordHash(password,salt),salt,createdAt:new Date().toISOString()};try{saveAccounts(accounts)}catch(e){return res.status(500).json({error:"Не удалось сохранить аккаунт на сервере"})}res.json({ok:true,nickname:accounts[key].nickname})});
app.post("/api/login",(req,res)=>{const nickname=String(req.body?.nickname||"").trim().normalize("NFKC"),password=String(req.body?.password||""),account=loadAccounts()[normalizeNick(nickname)];if(!account||!crypto.timingSafeEqual(Buffer.from(passwordHash(password,account.salt),"hex"),Buffer.from(account.passwordHash,"hex")))return res.status(401).json({error:"Неверный ник или пароль"});res.json({ok:true,nickname:account.nickname})});
app.use(express.static(path.join(__dirname,"public")));app.get("/health",(_,r)=>r.json({ok:true,game:"Serega V5"}));
app.get("/api/servers",(_,res)=>res.json([...rooms.entries()].map(([code,r])=>({code,players:r.players.size,mode:r.mode,started:r.started})).sort((a,b)=>b.players-a.players)));
function roomFor(c){if(!rooms.has(c))rooms.set(c,{players:new Map(),firstKillPlayed:false,mode:"ffa",started:true,bomb:{planted:false,by:null,at:0}});return rooms.get(c)}
function spawn(r,excludeId=null){
 // Try many random positions, keeping players away from walls, obstacles and each other.
 for(let i=0;i<500;i++){
  const pos={x:70+Math.random()*(WORLD.w-140),y:70+Math.random()*(WORLD.h-140)};
  if(hitWall(pos.x,pos.y))continue;
  if(r&&[...r.players.values()].some(q=>q.id!==excludeId&&Math.hypot(q.x-pos.x,q.y-pos.y)<115))continue;
  return pos;
 }
 // Deterministic fallback grid scan if random attempts happen to miss open space.
 for(let y=80;y<WORLD.h-80;y+=55)for(let x=80;x<WORLD.w-80;x+=55){
  if(!hitWall(x,y)&&(!r||![...r.players.values()].some(q=>q.id!==excludeId&&Math.hypot(q.x-x,q.y-y)<90)))return{x,y};
 }
 return{x:100,y:100};
}
function hitWall(x,y){return x<45||y<45||x>WORLD.w-45||y>WORLD.h-45||obstacles.some(([ox,oy,w,h])=>x>ox-15&&x<ox+w+15&&y>oy-15&&y<oy+h+15)}
const RESPAWN_MS=3000;
function scheduleRespawn(c,p){
 if(p.respawnTimer)clearTimeout(p.respawnTimer);
 p.dead=true;p.hp=0;
 io.to(p.id).emit("death",{delay:RESPAWN_MS});
 state(c);
 p.respawnTimer=setTimeout(()=>{
  const r=rooms.get(c),current=r?.players.get(p.id);
  if(!current)return;
  Object.assign(current,spawn(r,current.id),{hp:100,armor:100,dead:false,respawnTimer:null,lastMove:Date.now()});
  io.to(current.id).emit("respawned",{x:current.x,y:current.y,hp:current.hp,armor:current.armor,dead:false});
  io.to(c).emit("respawnSync",{id:current.id,x:current.x,y:current.y,hp:current.hp,armor:current.armor,dead:false});
  state(c);
 },RESPAWN_MS);
}
function state(c){const r=rooms.get(c);if(r)io.to(c).emit("state",{players:[...r.players.values()].map(({id,name,x,y,a,hp,armor,kills,silver,streak,team,dead,bodyColor,playerCode,prefix})=>({id,name,x,y,a,hp,armor,kills,streak,team,dead:!!dead,bodyColor,playerCode,prefix:prefix||"мать дающая",mode:r.mode,started:r.started,bomb:r.bomb})),world:WORLD,obstacles})}
io.on("connection",s=>{
 s.on("join",d=>{const code=String(d?.room||"FRIENDS").toUpperCase().replace(/[^A-Z0-9-]/g,"").slice(0,12)||"FRIENDS";if(s.data.room){const old=rooms.get(s.data.room);if(old){old.players.delete(s.id);state(s.data.room);if(!old.players.size)rooms.delete(s.data.room)}s.leave(s.data.room)}
 const r=roomFor(code),blue=[...r.players.values()].filter(p=>p.team==="blue").length,red=[...r.players.values()].filter(p=>p.team==="red").length,pos=spawn(r),p={id:s.id,name:String(d?.name||"Player").replace(/[<>]/g,"").slice(0,16),prefix:"мать дающая",...pos,a:0,hp:100,armor:100,kills:0,silver:0,streak:0,team:"solo",playerCode:/^[A-Z0-9]{6}$/.test(d?.playerCode||"")?d.playerCode:Math.random().toString(36).slice(2,8).toUpperCase(),bodyColor:/^#[0-9a-fA-F]{6}$/.test(d?.bodyColor||"")?d.bodyColor:(blue<=red?"#3294b6":"#bd5143"),tracerColor:/^#[0-9a-fA-F]{6}$/.test(d?.tracerColor||"")?d.tracerColor:"#ffd166",lastShot:0,lastMove:Date.now(),dead:false,respawnTimer:null};
 r.players.set(s.id,p);s.data.room=code;s.join(code);s.emit("joined",{id:s.id,room:code,team:p.team,playerCode:p.playerCode,mode:r.mode,x:p.x,y:p.y,obstacles,world:WORLD});io.to(code).emit("feed",{type:"system",text:p.name+" вошёл"});state(code)});
 s.on("move",d=>{const c=s.data.room,r=rooms.get(c),p=r?.players.get(s.id);if(!p||!d||p.dead)return;const now=Date.now(),dt=clamp((now-p.lastMove)/1000,0,.08);p.lastMove=now;let dx=clamp(+d.x||p.x,45,WORLD.w-45)-p.x,dy=clamp(+d.y||p.y,45,WORLD.h-45)-p.y,dist=Math.hypot(dx,dy),max=360*dt+8,k=dist>max?max/dist:1,nx=p.x+dx*k,ny=p.y+dy*k;if(!hitWall(nx,p.y))p.x=nx;if(!hitWall(p.x,ny))p.y=ny;if(Number.isFinite(d.a))p.a=d.a;state(c)});
 s.on("settings",d=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id);if(!p||!d)return;
  if(/^#[0-9a-fA-F]{6}$/.test(d.bodyColor||""))p.bodyColor=d.bodyColor;
  if(/^#[0-9a-fA-F]{6}$/.test(d.tracerColor||""))p.tracerColor=d.tracerColor;
  state(s.data.room);
 });
 s.on("setMode",d=>{const r=rooms.get(s.data.room);if(!r)return;const mode=["ffa","bomb"].includes(d?.mode)?d.mode:"ffa";r.mode=mode;r.started=false;r.bomb={planted:false,by:null,at:0};io.to(s.data.room).emit("modeChanged",{mode,started:false});});
 s.on("startMatch",()=>{const r=rooms.get(s.data.room);if(!r)return;r.started=true;io.to(s.data.room).emit("matchStarted",{mode:r.mode});state(s.data.room)});
 s.on("friendAdd",d=>{const target=[...io.sockets.sockets.values()].find(x=>{const rr=rooms.get(x.data.room);const pp=rr?.players.get(x.id);return pp?.playerCode===String(d?.playerCode||"").toUpperCase()});const me=rooms.get(s.data.room)?.players.get(s.id);if(!target||!me){s.emit("notice",{text:"Игрок не найден онлайн"});return}target.emit("friendRequest",{from:me.playerCode,name:me.name,room:s.data.room});s.emit("notice",{text:"Запрос отправлен"})});
 s.on("inviteFriend",d=>{const target=[...io.sockets.sockets.values()].find(x=>{const rr=rooms.get(x.data.room);const pp=rr?.players.get(x.id);return pp?.playerCode===String(d?.playerCode||"").toUpperCase()});const me=rooms.get(s.data.room)?.players.get(s.id);if(!target||!me){s.emit("notice",{text:"Друг не найден онлайн"});return}target.emit("gameInvite",{from:me.playerCode,name:me.name,room:s.data.room,mode:rooms.get(s.data.room)?.mode||"ffa"});s.emit("notice",{text:"Приглашение отправлено"})});
 s.on("acceptInvite",d=>{if(d?.room)s.emit("joinRoom",{room:String(d.room).replace(/[^A-Z0-9-]/gi,"").slice(0,12)})});
 s.on("plantBomb",()=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id);if(!r||!p||p.dead||r.mode!=="bomb"||r.bomb.planted)return;r.bomb={planted:true,by:p.name,at:Date.now()};io.to(s.data.room).emit("bombPlanted",{by:p.name,at:r.bomb.at});setTimeout(()=>{const rr=rooms.get(s.data.room);if(rr?.bomb.planted){rr.bomb={planted:false,by:null,at:0};io.to(s.data.room).emit("bombResult",{result:"exploded"})}},15000)});
 s.on("defuseBomb",()=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id);if(r&&p&&!p.dead&&r.bomb.planted){r.bomb={planted:false,by:null,at:0};io.to(s.data.room).emit("bombResult",{result:"defused",by:p.name})}});
 s.on("shoot",d=>{const c=s.data.room,r=rooms.get(c),p=r?.players.get(s.id);if(!p||!d||p.dead)return;const now=Date.now(),weapon=['awp','ak47','m4a4s','pistol','knife'].includes(d.weapon)?d.weapon:'ak47',cfg={awp:{delay:900,range:1050,damage:100,spread:8},ak47:{delay:120,range:720,damage:34,spread:23},m4a4s:{delay:105,range:760,damage:29,spread:20},pistol:{delay:240,range:480,damage:24,spread:25},knife:{delay:450,range:65,damage:55,spread:30}}[weapon];if(now-p.lastShot<cfg.delay)return;p.lastShot=now;const angle=Number.isFinite(d.angle)?d.angle:p.a;if(!Number.isFinite(angle))return;p.a=angle;const range=cfg.range,ux=Math.cos(angle),uy=Math.sin(angle);let t=null,bestDist=range+1;for(const q of r.players.values()){if(q.id===p.id||q.dead)continue;const dx=q.x-p.x,dy=q.y-p.y,along=dx*ux+dy*uy,perp=Math.abs(dx*uy-dy*ux);if(along<0||along>range||perp>cfg.spread||along>=bestDist)continue;let blocked=false;for(let n=15;n<along;n+=8){const x=p.x+ux*n,y=p.y+uy*n;if(obstacles.some(([ox,oy,w,h])=>x>ox&&x<ox+w&&y>oy&&y<oy+h)){blocked=true;break}}if(!blocked){t=q;bestDist=along}}let wallDist=range;for(let n=15;n<range;n+=8){const x=p.x+ux*n,y=p.y+uy*n;if(obstacles.some(([ox,oy,w,h])=>x>ox&&x<ox+w&&y>oy&&y<oy+h)){wallDist=n;break}}if(t&&bestDist<=wallDist){io.to(c).emit("tracer",{from:p.id,to:t.id,x1:p.x,y1:p.y,x2:t.x,y2:t.y,color:p.tracerColor||"#ffd166"});if(t.dead)return;t.hp-=cfg.damage;io.to(c).emit("shotFx",{from:p.id,to:t.id,hit:true,x:t.x,y:t.y});if(t.hp<=0){p.kills++;p.silver=(p.silver||0)+10;p.streak++;t.streak=0;io.to(p.id).emit('currency',{silver:p.silver,gold:1000});io.to(c).emit("kill",{killer:p.id,killerName:p.name,victim:t.id,victimName:t.name,kills:p.kills,streak:p.streak});scheduleRespawn(c,t);if(!r.firstKillPlayed){r.firstKillPlayed=true;io.to(c).emit("musicEvent",{kind:"first",player:p.id,name:p.name})}if(p.streak===3)io.to(c).emit("musicEvent",{kind:"triple",player:p.id,name:p.name});if(p.streak===4)io.to(c).emit("musicEvent",{kind:"four",player:p.id,name:p.name});if(p.streak===5){io.to(c).emit("musicEvent",{kind:"rampage",player:p.id,name:p.name});io.to(c).emit("banner",{text:"RAMPAGE",name:p.name})}state(c)}}else{io.to(c).emit("tracer",{from:p.id,x1:p.x,y1:p.y,x2:p.x+ux*wallDist,y2:p.y+uy*wallDist,color:p.tracerColor||"#ffd166"});io.to(c).emit("shotFx",{from:p.id,hit:false,x:p.x+ux*wallDist,y:p.y+uy*wallDist})}});
 s.on("respawn",()=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id);if(p&&p.dead&&!p.respawnTimer)scheduleRespawn(s.data.room,p)});
 s.on("disconnect",()=>{const c=s.data.room,r=rooms.get(c),p=r?.players.get(s.id);if(r){if(p?.respawnTimer)clearTimeout(p.respawnTimer);r.players.delete(s.id);if(p)io.to(c).emit("feed",{type:"system",text:p.name+" вышел"});if(!r.players.size)rooms.delete(c);else state(c)}});
});
server.listen(PORT,"0.0.0.0",()=>console.log("5D Shooter listening on "+PORT));
