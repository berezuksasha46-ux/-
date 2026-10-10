const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// Хранилище комнат и игроков
const rooms = {};

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Создание/Присоединение к игре
      if (data.type === 'JOIN_GAME') {
        const { roomId, betAmount, userId } = data;
        
        if (!rooms[roomId]) {
          rooms[roomId] = { players: [], bet: betAmount, state: 'WAITING' };
        }

        const room = rooms[roomId];
        if (room.players.length < 2) {
          room.players.push({ ws, userId });
          ws.roomId = roomId;

          if (room.players.length === 2) {
            // Расчет комиссии 10%
            const totalBank = room.bet * 2;
            const adminFee = Math.floor(totalBank * 0.10); // Твоя комиссия 10%
            const winPrize = totalBank - adminFee;

            room.state = 'PLAYING';
            room.winPrize = winPrize;
            room.adminFee = adminFee;

            // Уведомляем игроков о начале игры
            room.players.forEach((player) => {
              player.ws.send(JSON.stringify({
                type: 'GAME_START',
                bank: totalBank,
                prize: winPrize,
                fee: adminFee
              }));
            });
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  });

  ws.on('close', () => {
    if (ws.roomId && rooms[ws.roomId]) {
      delete rooms[ws.roomId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
    
