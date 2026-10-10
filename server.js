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
const supabase = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const rooms = {};
const ADMIN_IDS = [123456789]; // Вставьте сюда ваш Telegram ID

// Генерация колоды
function createDeck(cardCount = 36) {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = cardCount === 24 
        ? [9, 10, 11, 12, 13, 14] 
        : [6, 7, 8, 9, 10, 11, 12, 13, 14];
    
    let deck = [];
    for (let s of suits) {
        for (let v of values) {
            deck.push({ suit: s, value: v, id: `${s}_${v}` });
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    let currentUser = null;

    // Инициализация и регистрация пользователя
    socket.on('INIT_USER', async (userData) => {
        currentUser = userData;
        socket.join(`user_${userData.id}`);

        if (supabase) {
            let { data: user } = await supabase.from('users').select('*').eq('telegram_id', userData.id).single();
            if (!user) {
                const referrerId = userData.start_param ? parseInt(userData.start_param) : null;
                
                // Создание нового аккаунта
                await supabase.from('users').insert({
                    telegram_id: userData.id,
                    username: userData.username || 'Игрок',
                    first_name: userData.first_name || '',
                    photo_url: userData.photo_url || '',
                    referrer_id: referrerId,
                    is_admin: ADMIN_IDS.includes(userData.id)
                });

                // Бонус рефереру (+10 звёзд)
                if (referrerId) {
                    await supabase.rpc('increment_balance', { user_id: referrerId, amount: 10 });
                }
            }
            socket.emit('USER_DATA', user);
        }
    });

    // Список комнат
    socket.on('GET_ROOMS', () => {
        const publicRooms = Object.values(rooms)
            .filter(r => r.state === 'WAITING')
            .map(r => ({
                id: r.id,
                mode: r.mode,
                deckSize: r.deckSize,
                bet: r.bet,
                host: r.players[0].name,
                hostLevel: r.players[0].level
            }));
        socket.emit('ROOMS_LIST', publicRooms);
    });

    // Создание стола
    socket.on('CREATE_ROOM', ({ mode, deckSize, bet, user }) => {
        const roomId = `room_${Date.now()}`;
        rooms[roomId] = {
            id: roomId,
            mode, // 'podkidnoy' или 'perevodnoy'
            deckSize: parseInt(deckSize),
            bet: parseInt(bet),
            players: [{ id: user.id, name: user.first_name, level: user.level || 1, socketId: socket.id, hand: [] }],
            state: 'WAITING',
            turnTimer: null,
            deck: [],
            trumpCard: null,
            table: [],
            currentTurn: 0
        };
        socket.join(roomId);
        socket.emit('ROOM_CREATED', roomId);
        io.emit('ROOMS_UPDATED');
    });

    // Присоединение к столу
    socket.on('JOIN_ROOM', ({ roomId, user }) => {
        const room = rooms[roomId];
        if (room && room.players.length === 1 && room.state === 'WAITING') {
            room.players.push({ id: user.id, name: user.first_name, level: user.level || 1, socketId: socket.id, hand: [] });
            socket.join(roomId);
            startGame(room);
        }
    });

    // Ежедневный бонус
    socket.on('CLAIM_DAILY_BONUS', async (userId) => {
        if (!supabase) return;
        let { data: user } = await supabase.from('users').select('*').eq('telegram_id', userId).single();
        
        const now = new Date();
        const lastClaim = user.last_daily_claim ? new Date(user.last_daily_claim) : null;

        if (!lastClaim || (now - lastClaim) > 24 * 60 * 60 * 1000) {
            await supabase.from('users').update({
                bonus_balance: user.bonus_balance + 10,
                last_daily_claim: now.toISOString()
            }).eq('telegram_id', userId);
            
            socket.emit('BONUS_CLAIMED', { success: true, amount: 10 });
        } else {
            socket.emit('BONUS_CLAIMED', { success: false, message: 'Бонус уже получен сегодня!' });
        }
    });
});

// Запуск партий и таймера
function startGame(room) {
    room.state = 'PLAYING';
    room.deck = createDeck(room.deckSize);
    
    room.players[0].hand = room.deck.splice(0, 6);
    room.players[1].hand = room.deck.splice(0, 6);
    room.trumpCard = room.deck[room.deck.length - 1];
    
    const totalBank = room.bet * 2;
    const adminFee = Math.floor(totalBank * 0.10); // 10% комиссия
    const winPrize = totalBank - adminFee;

    room.winPrize = winPrize;
    room.adminFee = adminFee;

    io.to(room.id).emit('GAME_STARTED', {
        roomId: room.id,
        mode: room.mode,
        players: room.players.map(p => ({ id: p.id, name: p.name, level: p.level, cardCount: p.hand.length })),
        trumpCard: room.trumpCard,
        deckLeft: room.deck.length,
        winPrize,
        turnTime: 15
    });

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
            io.to(room.id).emit('TIMEOUT_ACTION', { playerIndex: room.currentTurn });
        }
    }, 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`CardFool Server running on port ${PORT}`);
});
              
