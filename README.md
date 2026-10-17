# 5D Shooter Online

Браузерный multiplayer-прототип на Node.js, Express и Socket.IO. Готов к GitHub и Render.

## Запуск локально
Нужен Node.js 18+.
```bash
npm install
npm start
```
Открой http://localhost:3000 в двух браузерах и введи одинаковый код комнаты.

## GitHub
Создай пустой репозиторий, распакуй проект и выполни в его папке:
```bash
git init
git add .
git commit -m "Initial 5D Shooter Online"
git branch -M main
git remote add origin https://github.com/ВАШ-АККАУНТ/ВАШ-РЕПОЗИТОРИЙ.git
git push -u origin main
```
Не забудь включить `public/audio/` с четырьмя треками.

## Render
Создай **New + → Web Service**, подключи GitHub-репозиторий. Используй:
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

После статуса Live отправь друзьям URL сервиса и одинаковый код комнаты. Бесплатный Render может засыпать после простоя.

## Управление
WASD — движение, мышь — прицел, ЛКМ — выстрел, Shift — ускорение, R — возрождение, Esc — меню.

## Звук и streaks
Встроены предоставленные пользователем аудиофайлы: меню, 3 убийства подряд (Triple Kill), 4 убийства подряд, 5 убийств подряд (Rampage). События отправляются сервером всем игрокам комнаты. Громкость хранится локально в `localStorage` каждого браузера.

## Ограничения
Это прототип с видом сверху под углом, не полноценный 3D FPS уровня CS2. Проверка попаданий и античит базовые, и сервер следует дополнительно тестировать перед публичным соревновательным использованием. Перед публикацией убедись, что имеешь права на распространение аудиозаписей.

- Исправлено прицеливание: при Pointer Lock угол меняется по относительному движению мыши, прицел закреплён в центре экрана; вне Pointer Lock используется позиция курсора относительно canvas.


## Serega V5 update
- Respawn delay: 3 seconds.
- User-provided background track (`public/audio/background.m4a`) loops continuously after the first user interaction.
- Killstreak audio overlays background music and stops after 15 seconds.
- Colorful teal/blue/purple map palette.
- Random persistent player ID shown in the main menu; online friend requests and game invites by ID.
- Modes: Free-for-all and a basic bomb-plant mode. Press F to plant and E to defuse.
- Press Start Match to select/apply the room mode.
