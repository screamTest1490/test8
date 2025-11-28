const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Константы времени
const ROUND_DURATION = 15000; // 15 секунд полный цикл
const BETTING_DURATION = 10000; // 10 секунд на ставки
const RESULT_DURATION = 5000; // 5 секунд на результаты

// Статичные файлы
app.use(express.static(path.join(__dirname, 'public')));

// Состояние игры
const gameState = {
    players: new Map(),
    currentRound: {
        isActive: false,
        startTime: 0,
        endTime: 0,
        mineCell: null,
        roundNumber: 1,
        bets: new Map(),
        roundId: Date.now() // уникальный ID раунда
    },
    nextRoundTimer: null
};

// Запуск игры
function startGame() {
    console.log('🎮 Запуск автоматической игры 24/7');
    
    // Запускаем первый раунд сразу
    startNewRound();
    
    // Настраиваем интервал для следующих раундов
    gameState.nextRoundTimer = setInterval(() => {
        startNewRound();
    }, ROUND_DURATION);
}

function startNewRound() {
    if (gameState.currentRound.isActive) {
        console.log('⚠️ Раунд уже активен, пропускаем');
        return;
    }

    const now = Date.now();
    gameState.currentRound.isActive = true;
    gameState.currentRound.startTime = now;
    gameState.currentRound.endTime = now + BETTING_DURATION;
    gameState.currentRound.bets.clear();
    gameState.currentRound.mineCell = null;
    gameState.currentRound.roundNumber++;
    gameState.currentRound.roundId = now; // новый ID

    console.log(`🎯 Начало раунда #${gameState.currentRound.roundNumber}`);
    console.log(`⏰ Ставки до: ${new Date(gameState.currentRound.endTime).toLocaleTimeString()}`);
    console.log(`👥 Игроков онлайн: ${gameState.players.size}`);

    // Уведомляем всех игроков о начале раунда
    io.emit('round_start', {
        roundNumber: gameState.currentRound.roundNumber,
        startTime: gameState.currentRound.startTime,
        endTime: gameState.currentRound.endTime,
        roundId: gameState.currentRound.roundId, // отправляем ID
        serverTime: now
    });

    // Автоматическое завершение раунда через BETTING_DURATION
    setTimeout(() => {
        finishRound();
    }, BETTING_DURATION);
}

function finishRound() {
    if (!gameState.currentRound.isActive) {
        console.log('⚠️ Раунд уже завершен, пропускаем');
        return;
    }

    console.log('📊 Завершение раунда');
    gameState.currentRound.isActive = false;

    // Генерируем мину
    const mineCell = generateMine();
    gameState.currentRound.mineCell = mineCell;

    // Рассчитываем результаты
    const results = calculateResults(mineCell);

    // Отправляем результаты всем игрокам
    io.emit('round_result', {
        mineCell: mineCell,
        results: results,
        roundNumber: gameState.currentRound.roundNumber,
        serverTime: Date.now()
    });

    console.log(`💣 Мина в ячейке: ${mineCell}`);
    console.log(`🎯 Игроков в раунде: ${gameState.currentRound.bets.size}`);
    console.log(`📈 Победителей: ${results.filter(r => r.isWinner).length}`);

    // Следующий раунд запустится автоматически через ROUND_DURATION
}

function generateMine() {
    const bets = Array.from(gameState.currentRound.bets.values());
    
    if (bets.length === 0) {
        const randomCell = Math.floor(Math.random() * 9) + 1;
        console.log(`🎲 Случайная мина (нет ставок): ${randomCell}`);
        return randomCell;
    }

    // Группируем ставки по ячейкам
    const cellStats = {};
    for (let i = 1; i <= 9; i++) {
        cellStats[i] = { totalBet: 0, players: 0, cellNumber: i };
    }

    bets.forEach(bet => {
        cellStats[bet.cell].totalBet += bet.bet;
        cellStats[bet.cell].players += 1;
    });

    const usedCells = Object.values(cellStats).filter(stats => stats.players > 0);

    console.log('📊 Статистика ячеек:');
    usedCells.forEach(cell => {
        console.log(`  Ячейка ${cell.cellNumber}: ${cell.players} игрок(ов), ${cell.totalBet} TON`);
    });

    // Если только одна ячейка с игроками
    if (usedCells.length === 1) {
        console.log(`🎯 Одна ячейка с игроками: ${usedCells[0].cellNumber}`);
        return usedCells[0].cellNumber;
    }

    // Если две ячейки с игроками
    if (usedCells.length === 2) {
        const cell1 = usedCells[0];
        const cell2 = usedCells[1];

        // Сортируем по номеру ячейки (меньшая первая)
        const sortedByNumber = [cell1, cell2].sort((a, b) => a.cellNumber - b.cellNumber);
        const smallerCell = sortedByNumber[0];
        const largerCell = sortedByNumber[1];

        // Вычисляем разницу в ставках
        const totalBet1 = cell1.totalBet;
        const totalBet2 = cell2.totalBet;
        const ratio = Math.max(totalBet1, totalBet2) / Math.min(totalBet1, totalBet2);

        console.log(`⚖️ Две ячейки: ${cell1.cellNumber} (${totalBet1} TON) vs ${cell2.cellNumber} (${totalBet2} TON)`);
        console.log(`📐 Разница в ставках: ${ratio.toFixed(2)}x`);

        // Если разница в ставках не больше 1.7, выбираем меньшую ячейку
        if (ratio <= 1.7) {
            console.log(`🔽 Разница <= 1.7, выбираем меньшую ячейку: ${smallerCell.cellNumber}`);
            return smallerCell.cellNumber;
        } else {
            // Иначе выбираем ячейку с большим балансом
            const chosenCell = totalBet1 > totalBet2 ? cell1.cellNumber : cell2.cellNumber;
            console.log(`🔼 Разница > 1.7, выбираем ячейку с большим балансом: ${chosenCell}`);
            return chosenCell;
        }
    }

    // Если три и более ячеек с игроками
    if (usedCells.length >= 3) {
        // Находим ячейку с минимальным количеством игроков
        const minPlayers = Math.min(...usedCells.map(cell => cell.players));
        const leastPopularCells = usedCells.filter(cell => cell.players === minPlayers);

        console.log(`👥 Ячейки с минимальным количеством игроков (${minPlayers}):`, 
            leastPopularCells.map(c => c.cellNumber));

        // Если несколько ячеек с минимальным количеством игроков
        if (leastPopularCells.length > 1) {
            // Выбираем ячейку с наименьшим номером
            const smallestCell = leastPopularCells.reduce((min, cell) => 
                cell.cellNumber < min.cellNumber ? cell : min
            );
            console.log(`🔽 Несколько ячеек с мин. игроками, выбираем меньшую: ${smallestCell.cellNumber}`);
            return smallestCell.cellNumber;
        } else {
            // Иначе выбираем единственную ячейку с минимальным количеством игроков
            console.log(`🎯 Одна ячейка с мин. игроками: ${leastPopularCells[0].cellNumber}`);
            return leastPopularCells[0].cellNumber;
        }
    }

    // Резервный вариант - случайный выбор
    const randomCell = usedCells[Math.floor(Math.random() * usedCells.length)].cellNumber;
    console.log(`🎲 Резервный выбор: ${randomCell}`);
    return randomCell;
}

function calculateResults(mineCell) {
    const results = [];
    const bets = Array.from(gameState.currentRound.bets.values());

    bets.forEach(bet => {
        const isWinner = bet.cell !== mineCell;
        const winAmount = isWinner ? bet.bet * 1.45 : 0;
        
        results.push({
            playerId: bet.playerId,
            playerName: bet.playerName,
            bet: bet.bet,
            cell: bet.cell,
            isWinner: isWinner,
            winAmount: winAmount
        });

        // Логируем результат для каждого игрока
        if (isWinner) {
            console.log(`🎉 ${bet.playerName} выиграл ${winAmount} TON (ставка: ${bet.bet} TON)`);
        } else {
            console.log(`💥 ${bet.playerName} проиграл ${bet.bet} TON`);
        }
    });

    return results;
}

// Socket.io соединения
io.on('connection', (socket) => {
    console.log('🔗 Новое подключение:', socket.id);

    // Отправляем текущее состояние новому игроку
    socket.emit('game_state', {
        isRoundActive: gameState.currentRound.isActive,
        roundStartTime: gameState.currentRound.startTime,
        roundEndTime: gameState.currentRound.endTime,
        roundNumber: gameState.currentRound.roundNumber,
        roundId: gameState.currentRound.roundId,
        serverTime: Date.now()
    });

    socket.emit('online_players', Array.from(gameState.players.entries()));

    socket.on('player_join', (playerData) => {
        const player = {
            id: playerData.id,
            name: playerData.name,
            balance: playerData.balance,
            socketId: socket.id,
            joinedAt: Date.now()
        };

        gameState.players.set(player.id, player);

        console.log(`👤 Игрок присоединился: ${player.name} (${player.id})`);
        console.log(`👥 Всего игроков онлайн: ${gameState.players.size}`);

        // Уведомляем всех о новом игроке
        socket.broadcast.emit('player_joined', player);
        
        // Обновляем список онлайн для всех
        io.emit('online_players', Array.from(gameState.players.entries()));
    });

    socket.on('place_bet', (betData) => {
        if (!gameState.currentRound.isActive) {
            socket.emit('error', { message: 'Раунд не активен' });
            console.log(`❌ ${betData.playerId}: Попытка ставки в неактивном раунде`);
            return;
        }

        const player = gameState.players.get(betData.playerId);
        if (!player) {
            socket.emit('error', { message: 'Игрок не найден' });
            console.log(`❌ Неизвестный игрок: ${betData.playerId}`);
            return;
        }

        // Проверяем, не делал ли игрок уже ставку в этом раунде
        if (gameState.currentRound.bets.has(betData.playerId)) {
            socket.emit('error', { message: 'Вы уже сделали ставку в этом раунде' });
            console.log(`❌ ${player.name}: Повторная ставка`);
            return;
        }

        // Сохраняем ставку
        gameState.currentRound.bets.set(betData.playerId, {
            playerId: betData.playerId,
            playerName: player.name,
            bet: betData.bet,
            cell: betData.cell,
            timestamp: Date.now()
        });

        console.log(`🎯 Ставка принята: ${player.name} поставил ${betData.bet} TON на ячейку ${betData.cell}`);
        console.log(`📊 Всего ставок в раунде: ${gameState.currentRound.bets.size}`);

        // Уведомляем всех о ставке
        io.emit('player_bet', {
            playerId: betData.playerId,
            playerName: player.name,
            bet: betData.bet,
            cell: betData.cell
        });
    });

    socket.on('disconnect', () => {
        // Находим игрока по socket.id
        let disconnectedPlayer = null;
        for (let [playerId, player] of gameState.players) {
            if (player.socketId === socket.id) {
                disconnectedPlayer = player;
                gameState.players.delete(playerId);
                gameState.currentRound.bets.delete(playerId);
                break;
            }
        }

        if (disconnectedPlayer) {
            console.log(`👋 Игрок вышел: ${disconnectedPlayer.name}`);
            console.log(`👥 Осталось игроков онлайн: ${gameState.players.size}`);
            
            // Уведомляем всех о выходе игрока
            io.emit('player_left', disconnectedPlayer.id);
            io.emit('online_players', Array.from(gameState.players.entries()));
        }
    });

    socket.on('error', (error) => {
        console.error('❌ Ошибка сокета:', error);
    });
});

// Обработка ошибок сервера
server.on('error', (error) => {
    console.error('❌ Ошибка сервера:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Остановка сервера...');
    if (gameState.nextRoundTimer) {
        clearInterval(gameState.nextRoundTimer);
    }
    server.close(() => {
        console.log('✅ Сервер остановлен');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, остановка сервера...');
    if (gameState.nextRoundTimer) {
        clearInterval(gameState.nextRoundTimer);
    }
    server.close(() => {
        console.log('✅ Сервер остановлен');
        process.exit(0);
    });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Открой в браузере: http://localhost:${PORT}`);
    console.log(`⏰ Раунды каждые: ${ROUND_DURATION/1000} секунд`);
    console.log(`🎯 Ставки: ${BETTING_DURATION/1000} секунд`);
    console.log(`📊 Результаты: ${RESULT_DURATION/1000} секунд`);
    
    startGame();
});

// Экспорт для тестирования
module.exports = {
    app,
    server,
    gameState,
    startGame,
    startNewRound,
    finishRound,
    generateMine
};