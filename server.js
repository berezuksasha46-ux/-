<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>CardFool — Онлайн Дурак</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        :root {
            --bg-deep: #0e071b;
            --bg-card: #190f33;
            --accent-purple: #8b5cf6;
            --accent-glow: #a78bfa;
            --accent-gold: #fbbf24;
            --text-color: #f3e8ff;
            --text-muted: #9ca3af;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: var(--bg-deep);
            background-image: 
                radial-gradient(circle at 15% 15%, rgba(139, 92, 246, 0.15) 0%, transparent 45%),
                radial-gradient(circle at 85% 85%, rgba(109, 40, 217, 0.15) 0%, transparent 45%),
                linear-gradient(135deg, #0e071b 0%, #170b2e 100%);
            color: var(--text-color);
            margin: 0; padding: 0;
            display: flex; flex-direction: column; height: 100vh;
            overflow: hidden;
            position: relative;
        }

        /* Водяные знаки мастей */
        body::before {
            content: "♠ ♥ ♦ ♣ ♠ ♥ ♦ ♣ ♠ ♥ ♦ ♣";
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%) rotate(-15deg);
            font-size: 80px; letter-spacing: 40px;
            color: rgba(139, 92, 246, 0.03);
            pointer-events: none; white-space: nowrap; z-index: 0;
        }

        .header-bar, .content, .navbar, .modal { position: relative; z-index: 1; }

        .header-bar {
            background: rgba(25, 15, 51, 0.9);
            backdrop-filter: blur(12px);
            padding: 12px 16px;
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid rgba(139, 92, 246, 0.25);
        }
        .user-info { display: flex; align-items: center; gap: 8px; font-weight: bold; font-size: 15px; }
        .balance-chip {
            background: rgba(251, 191, 36, 0.15);
            border: 1px solid var(--accent-gold);
            color: var(--accent-gold);
            padding: 6px 14px; border-radius: 20px;
            font-weight: bold; font-size: 14px; cursor: pointer;
            display: flex; align-items: center; gap: 6px;
            box-shadow: 0 0 15px rgba(251, 191, 36, 0.15);
        }

        .content { flex: 1; overflow-y: auto; padding: 16px; padding-bottom: 80px; }
        .page { display: none; }
        .page.active { display: block; }

        .card { 
            background: var(--bg-card); border-radius: 16px; padding: 16px; margin-bottom: 12px; 
            border: 1px solid rgba(139, 92, 246, 0.25);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        /* Подсветка своего собственного стола */
        .card.my-room {
            border: 2px solid var(--accent-gold);
            box-shadow: 0 0 20px rgba(251, 191, 36, 0.25);
            background: linear-gradient(135deg, #190f33 0%, #2a1548 100%);
        }
        
        .btn {
            background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); 
            color: white; font-weight: bold; border: none; border-radius: 12px; 
            padding: 14px; width: 100%; font-size: 15px; cursor: pointer; margin-top: 8px;
            display: flex; justify-content: center; align-items: center; gap: 6px;
            box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
        }
        .btn:active { transform: scale(0.98); }
        .btn-green { background: linear-gradient(135deg, #10b981 0%, #059669 100%); box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); }
        .btn-outline { background: transparent; border: 2px solid var(--accent-purple); color: var(--accent-glow); box-shadow: none; }

        .navbar {
            position: fixed; bottom: 0; left: 0; right: 0;
            background: rgba(25, 15, 51, 0.95); backdrop-filter: blur(10px);
            display: flex; justify-content: space-around; padding: 10px 0;
            border-top: 1px solid rgba(139, 92, 246, 0.25);
        }
        .nav-item {
            color: var(--text-muted); text-decoration: none; font-size: 11px;
            display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer;
        }
        .nav-item.active { color: var(--accent-glow); font-weight: bold; text-shadow: 0 0 10px rgba(167, 139, 250, 0.5); }
        .nav-icon { font-size: 20px; }

        .modal {
            display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(14, 7, 27, 0.85); backdrop-filter: blur(5px); z-index: 100;
            justify-content: center; align-items: center; padding: 20px;
        }
        .modal-content {
            background: var(--bg-card); width: 100%; max-width: 360px;
            border-radius: 20px; padding: 20px; border: 1px solid rgba(139, 92, 246, 0.4);
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        }
        .select-group { margin-bottom: 12px; text-align: left; }
        .select-group label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
        .select-group select {
            width: 100%; padding: 12px; background: #0e071b; color: white;
            border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 10px; font-size: 14px;
        }

        .leader-item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 12px 0; border-bottom: 1px solid rgba(139, 92, 246, 0.15);
        }
    </style>
</head>
<body>

    <div class="header-bar">
        <div class="user-info">
            <span>🃏</span>
            <span id="header-name">Игрок</span>
        </div>
        <div class="balance-chip" onclick="openBalanceModal()">
            <span id="header-balance">0</span> ⭐ ➕
        </div>
    </div>

    <div class="content">
        <div id="page-menu" class="page active">
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <button class="btn" onclick="openCreateModal()">➕ Создать стол</button>
                <button class="btn btn-outline" onclick="createFastGame()">⚡ Быстрый поиск</button>
            </div>
            
            <h3 style="margin-bottom: 10px; font-size: 16px;">📜 Активные столы</h3>
            <div id="rooms-list">
                <div class="card"><p style="color: var(--text-muted); text-align: center;">Поиск доступных столов...</p></div>
            </div>
        </div>

        <div id="page-leaderboard" class="page">
            <h3 style="margin-bottom: 10px;">🏆 Топ игроков</h3>
            <div class="card" id="leaderboard-list">
                <p style="text-align: center; color: var(--text-muted);">Пока нет лидеров</p>
            </div>
        </div>

        <div id="page-referrals" class="page">
            <h3 style="margin-bottom: 10px;">🎁 Реферальная система</h3>
            <div class="card">
                <p style="font-size: 14px; line-height: 1.5;">Приглашайте друзей и получайте <b>+10 ⭐</b> за каждого нового игрока + <b>5%</b> от всех их ставок навсегда!</p>
                <button class="btn" onclick="copyRefLink()">📋 Скопировать ссылку</button>
            </div>
        </div>

        <div id="page-profile" class="page">
            <h3 style="margin-bottom: 10px;">👤 Мой профиль</h3>
            <div class="card" style="text-align: center; padding: 24px;">
                <h2 id="user-name" style="margin: 0 0 10px 0;">Игрок</h2>
                <p style="color: var(--text-muted); margin: 5px 0;">Уровень: <b id="user-level" style="color: var(--accent-glow);">1</b></p>
                <hr style="border-color: rgba(139, 92, 246, 0.2); margin: 15px 0;">
                <p style="margin: 5px 0;">Основной баланс: <b id="user-balance">0</b> ⭐</p>
                <p style="margin: 5px 0;">Победы / Поражения: <b id="user-winrate">0 В / 0 П</b></p>
                
                <button class="btn btn-green" onclick="claimDailyBonus()" style="margin-top: 20px;">
                    🎁 Ежедневный бонус (+10 ⭐)
                </button>
            </div>
        </div>

        <div id="page-game" class="page">
            <div style="background: rgba(25, 15, 51, 0.9); border-radius: 20px; border: 2px solid var(--accent-purple); height: 320px; position: relative; padding: 10px;">
                <div style="position: absolute; top: 10px; right: 10px; background: #ef4444; color: white; padding: 4px 10px; border-radius: 20px; font-weight: bold; font-size: 12px;" id="game-timer">⏳ 15s</div>
                <div id="opponent-info" style="color: var(--accent-glow);">Соперник</div>
                <div id="table-cards" style="margin-top: 60px; text-align: center;">Игра началась! Раздача карт...</div>
            </div>
            <div id="my-hand" style="margin-top: 15px; display: flex; gap: 5px; overflow-x: auto;"></div>
        </div>
    </div>

    <div class="modal" id="modal-create">
        <div class="modal-content">
            <h3 style="margin-top: 0;">⚙️ Создание стола</h3>
            <div class="select-group">
                <label>Режим игры:</label>
                <select id="create-mode">
                    <option value="podkidnoy">Подкидной</option>
                    <option value="perevodnoy">Переводной</option>
                </select>
            </div>
            <div class="select-group">
                <label>Колода:</label>
                <select id="create-deck">
                    <option value="36">36 карт</option>
                    <option value="24">24 карты</option>
                </select>
            </div>
            <div class="select-group">
                <label>Ставка (Звёзды):</label>
                <select id="create-bet">
                    <option value="10">10 ⭐</option>
                    <option value="25">25 ⭐</option>
                    <option value="50">50 ⭐</option>
                    <option value="100">100 ⭐</option>
                </select>
            </div>
            <button class="btn" onclick="submitCreateRoom()">Создать стол</button>
            <button class="btn btn-outline" onclick="closeCreateModal()" style="margin-top: 8px;">Отмена</button>
        </div>
    </div>

    <div class="modal" id="modal-balance">
        <div class="modal-content" style="text-align: center;">
            <h3 style="margin-top: 0;">💳 Управление балансом</h3>
            <p>Ваш баланс: <b id="modal-balance-val">0</b> ⭐</p>
            <button class="btn btn-green" onclick="alert('Пополнение Stars через Telegram будет доступно при запуске платежного шлюза.')">➕ Пополнить</button>
            <button class="btn" onclick="alert('Минимальная сумма для вывода — 100 ⭐.')" style="margin-top: 8px;">💸 Вывести</button>
            <button class="btn btn-outline" onclick="closeBalanceModal()" style="margin-top: 8px;">Закрыть</button>
        </div>
    </div>

    <div class="navbar">
        <div class="nav-item active" onclick="switchPage('menu', this)">
            <span class="nav-icon">🎮</span><span>Столы</span>
        </div>
        <div class="nav-item" onclick="switchPage('leaderboard', this)">
            <span class="nav-icon">🏆</span><span>Рейтинг</span>
        </div>
        <div class="nav-item" onclick="switchPage('referrals', this)">
            <span class="nav-icon">🎁</span><span>Друзья</span>
        </div>
        <div class="nav-item" onclick="switchPage('profile', this)">
            <span class="nav-icon">👤</span><span>Профиль</span>
        </div>
    </div>

    <script>
        const tg = window.Telegram.WebApp;
        tg.expand();

        const socket = io();
        const user = tg.initDataUnsafe?.user || { id: Math.floor(Math.random()*100000), first_name: "Игрок" };

        document.getElementById('header-name').innerText = user.first_name;
        document.getElementById('user-name').innerText = user.first_name;

        socket.emit('INIT_USER', { ...user, start_param: tg.initDataUnsafe?.start_param });

        socket.on('USER_DATA', (dbUser) => {
            if (dbUser) {
                document.getElementById('header-balance').innerText = dbUser.stars_balance || 0;
                document.getElementById('modal-balance-val').innerText = dbUser.stars_balance || 0;
                document.getElementById('user-level').innerText = dbUser.level || 1;
                document.getElementById('user-balance').innerText = dbUser.stars_balance || 0;
                document.getElementById('user-winrate').innerText = `${dbUser.wins || 0} В / ${dbUser.losses || 0} П`;
            }
        });

        socket.on('ERROR_MSG', (msg) => alert(msg));

        function switchPage(pageId, el) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.getElementById(`page-${pageId}`).classList.add('active');
            if (el) el.classList.add('active');

            if (pageId === 'menu') socket.emit('GET_ROOMS');
            if (pageId === 'leaderboard') socket.emit('GET_LEADERBOARD');
        }

        function openCreateModal() { document.getElementById('modal-create').style.display = 'flex'; }
        function closeCreateModal() { document.getElementById('modal-create').style.display = 'none'; }
        function openBalanceModal() { document.getElementById('modal-balance').style.display = 'flex'; }
        function closeBalanceModal() { document.getElementById('modal-balance').style.display = 'none'; }

        function submitCreateRoom() {
            const mode = document.getElementById('create-mode').value;
            const deckSize = document.getElementById('create-deck').value;
            const bet = document.getElementById('create-bet').value;
            socket.emit('CREATE_ROOM', { mode, deckSize, bet, user });
            closeCreateModal();
        }

        function createFastGame() {
            socket.emit('CREATE_ROOM', { mode: 'podkidnoy', deckSize: 36, bet: 10, user });
        }

        socket.on('ROOMS_LIST', (rooms) => {
            const list = document.getElementById('rooms-list');
            if (rooms.length === 0) {
                list.innerHTML = '<div class="card"><p style="color: var(--text-muted); text-align: center;">Открытых столов нет. Создайте свой!</p></div>';
                return;
            }
            // Сортируем: свои столы выносим наверх
            rooms.sort((a, b) => (b.hostId === user.id) - (a.hostId === user.id));

            list.innerHTML = rooms.map(r => {
                const isMyRoom = r.hostId === user.id;
                return `
                    <div class="card ${isMyRoom ? 'my-room' : ''}">
                        <b>${isMyRoom ? '⭐ Ваш стол: ' : ''}${r.host}</b> (Ур. ${r.hostLevel}) | Ставка: <b>${r.bet} ⭐</b><br>
                        <small style="color: var(--text-muted);">Режим: ${r.mode === 'podkidnoy' ? 'Подкидной' : 'Переводной'} (${r.deckSize} карт)</small>
                        ${isMyRoom ? '<p style="color: var(--accent-gold); font-size: 12px; margin: 5px 0 0 0;">Ожидание соперника...</p>' : `<button class="btn" style="margin-top: 10px;" onclick="joinRoom('${r.id}')">Присоединиться</button>`}
                    </div>
                `;
            }).join('');
        });

        function joinRoom(id) { socket.emit('JOIN_ROOM', { roomId: id, user }); }

        socket.on('GAME_STARTED', (data) => {
            switchPage('game');
            const opp = data.players.find(p => p.id !== user.id);
            document.getElementById('opponent-info').innerText = `Соперник: ${opp ? opp.name : 'Игрок'} (${opp ? opp.cardCount : 6} карт)`;
        });

        socket.on('YOUR_HAND', (hand) => {
            const handDiv = document.getElementById('my-hand');
            handDiv.innerHTML = hand.map(c => `
                <div style="background: white; color: ${c.suit==='♥'||c.suit==='♦'?'red':'black'}; width: 45px; height: 65px; border-radius: 6px; display: flex; flex-direction: column; justify-content: space-between; padding: 4px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                    <span>${c.value === 14 ? 'T' : c.value === 13 ? 'К' : c.value === 12 ? 'Д' : c.value === 11 ? 'В' : c.value}</span>
                    <span style="align-self: center; font-size: 18px;">${c.suit}</span>
                </div>
            `).join('');
        });

        socket.on('LEADERBOARD_DATA', (leaders) => {
            const list = document.getElementById('leaderboard-list');
            if (!leaders || leaders.length === 0) {
                list.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Пока нет лидеров (нужна первая победа!)</p>';
                return;
            }
            list.innerHTML = leaders.map((l, i) => `
                <div class="leader-item">
                    <div><b>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1 + '.'} ${l.first_name || l.username}</b> (Ур. ${l.level || 1})</div>
                    <div style="color: var(--accent-glow); font-weight: bold;">${l.wins} побед</div>
                </div>
            `).join('');
        });

        function claimDailyBonus() { socket.emit('CLAIM_DAILY_BONUS', user.id); }

        socket.on('BONUS_CLAIMED', (res) => { alert(res.message); });

        function copyRefLink() {
            const botUsername = tg.initDataUnsafe?.bot_username || 'CardFoolBot';
            const link = `https://t.me/${botUsername}?start=${user.id}`;
            navigator.clipboard.writeText(link).then(() => alert(`Ссылка скопирована:\n${link}`));
        }

        socket.on('TIMER_TICK', (data) => {
            document.getElementById('game-timer').innerText = `⏳ ${data.timeLeft}s`;
        });
    </script>
</body>
</html>
                    
