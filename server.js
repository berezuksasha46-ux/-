const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const rooms = {};
const memoryUsers = {};
const ADMIN_IDS = [123456789]; // Укажите ваш Telegram ID

async function getUser(telegramId) {
    if (supabase) {
        const { data } = await supabase.from('users').select('*').eq('telegram_id', telegramId).single();
        return data;
    }
    return memoryUsers[telegramId] || null;
}

async function updateUserBalance(telegramId, newBalance) {
    if (supabase) {
        await supabase.from('users').update({ stars_balance: newBalance }).eq('telegram_id', telegramId);
    }
    if (memoryUsers[telegramId]) {
        memoryUsers[telegramId].stars_balance = newBalance;
    }
}

function createDeck(cardCount = 36) {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = cardCount === 24 ? [9, 10, 11, 12, 13, 14] : [6, 7, 8, 9, 10, 11, 12, 13, 14];
    let deck = [];
    for (let s of suits) {
        for (let v of values) {
            deck.push({ suit: s, value: v, id: `${s}_${v}` });
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    let currentUserId = null;

    socket.on('INIT_USER', async (userData) => {
        currentUserId = userData.id;
        socket.join(`user_${userData.id}`);

        let user = await getUser(userData.id);

        if (!user) {
            const referrerId = userData.start_param ? parseInt(userData.start_param) : null;
            user = {
                telegram_id: userData.id,
                username: userData.username || 'Игрок',
                first_name: userData.first_name || 'Игрок',
                photo_url: userData.photo_url || '',
                stars_balance: 0,
                wins: 0,
                losses: 0,
                level: 1,
                last_daily_claim: null,
                referrer_id: referrerId,
                is_admin: ADMIN_IDS.includes(userData.id)
            };

            if (supabase) {
                await supabase.from('users').insert(user);
            } else {
                memoryUsers[userData.id] = user;
            }

            if (referrerId && referrerId !== userData.id) {
                let refUser = await getUser(referrerId);
                if (refUser) {
                    await updateUserBalance(referrerId, refUser.stars_balance + 10);
                }
            }
        }
        socket.emit('USER_DATA', user);
    });

    socket.on('GET_LEADERBOARD', async () => {
        if (supabase) {
            const { data } = await supabase.from('users').select('username, first_name, wins, level').gt('wins', 0).order('wins', { ascending: false }).limit(50);
            socket.emit('LEADERBOARD_DATA', data || []);
        } else {
            const memList = Object.values(memoryUsers).filter(u => u.wins > 0).sort((a,b) => b.wins - a.wins);
            socket.emit('LEADERBOARD_DATA', memList);
        }
    });

    socket.on('GET_ROOMS', () => {
        const publicRooms = Object.values(rooms).filter(r => r.state === 'WAITING').map(r => ({
            id: r.id,
            mode: r.mode,
            deckSize: r.deckSize,
            bet: r.bet,
            hostId: r.players[0].id,
            host: r.players[0].name,
            hostLevel: r.players[0].level
        }));
        socket.emit('ROOMS_LIST', publicRooms);
    });

    socket.on('CREATE_ROOM', async ({ mode, deckSize, bet, user }) => {
        let dbUser = await getUser(user.id);
        const currentBalance = dbUser ? dbUser.stars_balance : 0;
        const betAmount = parseInt(bet) || 10;

        if (currentBalance < betAmount) {
            socket.emit('ERROR_MSG', `Недостаточно звезд! Ваш баланс: ${currentBalance} ⭐. Требуется: ${betAmount} ⭐.`);
            return;
        }

        const existingRoom = Object.values(rooms).find(r => r.state === 'WAITING' && r.players[0].id === user.id);
        if (existingRoom) {
            socket.emit('ERROR_MSG', 'У вас уже есть открытый стол!');
            return;
        }

        const roomId = `room_${Date.now()}`;
        rooms[roomId] = {
            id: roomId,
            mode: mode || 'podkidnoy',
            deckSize: parseInt(deckSize) || 36,
            bet: betAmount,
            players: [{ id: user.id, name: user.first_name, level: user.level || 1, socketId: socket.id, hand: [] }],
            state: 'WAITING',
            deck: [],
            trumpCard: null,
            table: [],
            currentTurn: 0,
            turnTimer: null
        };
        socket.join(roomId);
        socket.emit('ROOM_CREATED', roomId);
        io.emit('ROOMS_UPDATED');
    });

    socket.on('JOIN_ROOM', async ({ roomId, user }) => {
        const room = rooms[roomId];
        if (!room || room.state !== 'WAITING' || room.players.length !== 1) {
            socket.emit('ERROR_MSG', 'Этот стол уже занят или закрыт.');
            return;
        }
        if (room.players[0].id === user.id) {
            socket.emit('ERROR_MSG', 'Вы не можете присоединиться к своему столу!');
            return;
        }

        let dbUser = await getUser(user.id);
        let hostUser = await getUser(room.players[0].id);

        if (!dbUser || dbUser.stars_balance < room.bet) {
            socket.emit('ERROR_MSG', `Недостаточно средств для ставки ${room.bet} ⭐!`);
            return;
        }

        // Списываем ставки у обоих игроков
        await updateUserBalance(room.players[0].id, hostUser.stars_balance - room.bet);
        await updateUserBalance(user.id, dbUser.stars_balance - room.bet);

        io.to(`user_${room.players[0].id}`).emit('USER_DATA', await getUser(room.players[0].id));
        io.to(`user_${user.id}`).emit('USER_DATA', await getUser(user.id));

        room.players.push({ id: user.id, name: user.first_name, level: user.level || 1, socketId: socket.id, hand: [] });
        socket.join(roomId);
        
        startGame(room);
        io.emit('ROOMS_UPDATED');
    });

    socket.on('CLAIM_DAILY_BONUS', async (userId) => {
        let user = await getUser(userId);
        if (!user) return;

        const now = new Date();
        const lastClaim = user.last_daily_claim ? new Date(user.last_daily_claim) : null;
        const cooldown = 24 * 60 * 60 * 1000;

        if (!lastClaim || (now - lastClaim) >= cooldown) {
            const newBalance = (user.stars_balance || 0) + 10;
            if (supabase) {
                await supabase.from('users').update({ stars_balance: newBalance, last_daily_claim: now.toISOString() }).eq('telegram_id', userId);
            } else {
                memoryUsers[userId].stars_balance = newBalance;
                memoryUsers[userId].last_daily_claim = now.toISOString();
            }
            
            socket.emit('BONUS_CLAIMED', { success: true, message: 'Успешно! Вы получили +10 ⭐', newBalance });
            socket.emit('USER_DATA', await getUser(userId));
        } else {
            const nextClaimTime = new Date(lastClaim.getTime() + cooldown);
            const diffMs = nextClaimTime - now;
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            socket.emit('BONUS_CLAIMED', { success: false, message: `Следующий бонус через ${hours}ч. ${minutes}мин.` });
        }
    });
});

function startGame(room) {
    room.state = 'PLAYING';
    room.deck = createDeck(room.deckSize);
    
    // Раздача по 6 карт
    room.players[0].hand = room.deck.splice(0, 6);
    room.players[1].hand = room.deck.splice(0, 6);
    room.trumpCard = room.deck[room.deck.length - 1]; // Козырь под колодой
    
    const totalBank = room.bet * 2;
    room.winPrize = totalBank - Math.floor(totalBank * 0.10); // 10% комиссия

    // Отправляем событие НАЧАЛА ИГРЫ ОБОИМ игрокам в комнате
    io.to(room.id).emit('GAME_STARTED', {
        roomId: room.id,
        mode: room.mode,
        players: room.players.map(p => ({ id: p.id, name: p.name, level: p.level, cardCount: p.hand.length })),
        trumpCard: room.trumpCard,
        deckLeft: room.deck.length,
        winPrize: room.winPrize,
        attackerId: room.players[0].id
    });

    // Отправляем каждому игроку его уникальную руку
    room.players.forEach(p => {
        io.to(p.socketId).emit('YOUR_HAND', p.hand);
    });

    startTurnTimer(room);
}

function startTurnTimer(room) {
    if (room.turnTimer) clearInterval(room.turnTimer);
    let timeLeft = 15;

    room.turnTimer = setInterval(() => {
        io.to(room.id).emit('TIMER_TICK', { timeLeft });
        timeLeft--;

        if (timeLeft < 0) {
            clearInterval(room.turnTimer);
            io.to(room.id).emit('TIMEOUT_ACTION', { currentTurn: room.currentTurn });
        }
    }, 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
