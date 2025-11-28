class OnlineMinesGame {
    constructor() {
        this.socket = null;
        this.playerId = this.generatePlayerId();
        this.playerName = this.generatePlayerName();
        this.players = new Map();
        this.currentRoundPlayers = new Map();
        this.userBalance = 10;
        this.currentPlayerCell = null;
        this.currentBet = 0;
        
        // Состояние игры с сервера
        this.gameState = {
            isRoundActive: false, // false = между раундами, true = идет прием ставок
            roundStartTime: 0,
            roundEndTime: 0,
            roundNumber: 1,
            serverTimeOffset: 0
        };

        // Новые свойства для сохранения состояния
        this.currentRoundId = null;
        this.lastRoundState = null;

        this.stats = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            totalWagered: 0
        };

        this.timers = {
            ui: null
        };

        this.init();
    }

    generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9);
    }

    generatePlayerName() {
        const names = ['Алексей', 'Мария', 'Дмитрий', 'Анна', 'Сергей', 'Ольга', 'Иван', 'Елена'];
        return names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 1000);
    }

    getServerTime() {
        return Date.now() + this.gameState.serverTimeOffset;
    }

    async init() {
        this.createGrid();
        this.setupEventListeners();
        this.loadFromStorage();
        
        // Пытаемся восстановить состояние раунда
        if (this.loadRoundState()) {
            this.createGrid();
            this.updateUI();
            if (this.gameState.isRoundActive) {
                this.startRoundAnimations();
            }
        }
        
        await this.connectToServer();
        this.startUIUpdate();
    }

    async connectToServer() {
        try {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('✅ Подключено к серверу');
                this.showConnectionStatus(true);
                
                this.socket.emit('player_join', {
                    id: this.playerId,
                    name: this.playerName,
                    balance: this.userBalance
                });
            });

            this.socket.on('disconnect', () => {
                console.log('❌ Отключено от сервера');
                this.showConnectionStatus(false);
            });

            this.socket.on('online_players', (players) => {
                this.updateOnlinePlayers(players);
            });

            this.socket.on('game_state', (state) => {
                this.updateGameState(state);
            });

            this.socket.on('round_start', (roundData) => {
                this.handleRoundStart(roundData);
            });

            this.socket.on('round_result', (result) => {
                this.handleRoundResult(result);
            });

            this.socket.on('player_joined', (player) => {
                this.handlePlayerJoined(player);
            });

            this.socket.on('player_left', (playerId) => {
                this.handlePlayerLeft(playerId);
            });

            this.socket.on('player_bet', (betData) => {
                this.handlePlayerBet(betData);
            });

        } catch (error) {
            console.error('❌ Ошибка подключения:', error);
            this.showConnectionStatus(false);
        }
    }

    calculateServerTimeOffset(serverTime) {
        this.gameState.serverTimeOffset = serverTime - Date.now();
        console.log('⏰ Синхронизация времени с сервером:', this.gameState.serverTimeOffset + 'ms');
    }

    // Новые методы для сохранения состояния
    saveRoundState() {
        const roundState = {
            roundId: this.currentRoundId,
            isRoundActive: this.gameState.isRoundActive,
            startTime: this.gameState.roundStartTime,
            endTime: this.gameState.roundEndTime,
            roundNumber: this.gameState.roundNumber,
            serverTimeOffset: this.gameState.serverTimeOffset,
            saveTime: Date.now()
        };
        localStorage.setItem('current_round_state', JSON.stringify(roundState));
    }

    loadRoundState() {
        const saved = localStorage.getItem('current_round_state');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                const now = Date.now();
                
                // Проверяем, не устарели ли данные (больше 30 секунд)
                if (now - state.saveTime < 30000) {
                    this.currentRoundId = state.roundId;
                    this.gameState.isRoundActive = state.isRoundActive;
                    this.gameState.roundStartTime = state.startTime;
                    this.gameState.roundEndTime = state.endTime;
                    this.gameState.roundNumber = state.roundNumber;
                    this.gameState.serverTimeOffset = state.serverTimeOffset;
                    
                    console.log('🔄 Восстановлено состояние раунда');
                    return true;
                } else {
                    localStorage.removeItem('current_round_state');
                }
            } catch (e) {
                console.error('Ошибка загрузки состояния:', e);
            }
        }
        return false;
    }

    // Новые методы для анимаций
    startRoundAnimations() {
        // Анимация мигания ячеек
        const cells = document.querySelectorAll('.cell');
        cells.forEach((cell, index) => {
            // Случайные задержки для эффекта "волны"
            const delay = index * 100 + Math.random() * 200;
            
            setTimeout(() => {
                cell.style.animation = 'pulse-glow 2s infinite';
            }, delay);
        });

        // Анимация для таймера
        this.startTimerAnimation();
    }

    startTimerAnimation() {
        const timerElement = document.getElementById('roundTimer');
        if (timerElement) {
            timerElement.style.animation = 'timer-pulse 1s infinite alternate';
        }
    }

    updateOnlinePlayers(players) {
        this.players = new Map(players);
        this.updatePlayersList();
    }

    updateGameState(state) {
        this.gameState = { ...this.gameState, ...state };
        this.updateUI();
    }

    handleRoundStart(roundData) {
        console.log('🎯 Начало раунда с сервера:', roundData);
        
        // Синхронизируем время
        this.calculateServerTimeOffset(roundData.serverTime);
        
        this.gameState.isRoundActive = true; // Теперь раунд активен и принимает ставки
        this.gameState.roundStartTime = roundData.startTime;
        this.gameState.roundEndTime = roundData.endTime;
        this.gameState.roundNumber = roundData.roundNumber;
        this.currentRoundId = roundData.roundId;
        
        this.currentRoundPlayers.clear();
        
        // Сохраняем состояние в localStorage
        this.saveRoundState();
        
        this.createGrid();
        this.updateUI();
        this.startRoundAnimations();
    }

    handleRoundResult(result) {
        console.log('📊 Результат раунда:', result);
        this.gameState.isRoundActive = false; // Раунд завершен, ставки не принимаются
        
        // Очищаем сохраненное состояние
        localStorage.removeItem('current_round_state');
        
        this.processRoundResult(result);
        this.showRoundResults(result);
    }

    handlePlayerJoined(player) {
        this.players.set(player.id, player);
        this.updatePlayersList();
    }

    handlePlayerLeft(playerId) {
        this.players.delete(playerId);
        this.currentRoundPlayers.delete(playerId);
        this.updatePlayersList();
    }

    handlePlayerBet(betData) {
        this.currentRoundPlayers.set(betData.playerId, betData);
        this.updatePlayersList();
        
        if (betData.playerId === this.playerId) {
            this.userBalance -= betData.bet;
            this.currentBet = betData.bet;
            this.currentPlayerCell = betData.cell;
            
            // Анимация для нашей ставки
            const betButton = document.querySelector('.place-bet-btn');
            if (betButton) {
                betButton.classList.add('bet-placed');
                setTimeout(() => {
                    betButton.classList.remove('bet-placed');
                }, 300);
            }
        }
    }

    processRoundResult(result) {
        const userBet = this.currentRoundPlayers.get(this.playerId);
        if (!userBet) return;

        this.stats.gamesPlayed++;
        this.stats.totalWagered += userBet.bet;

        const isWinner = userBet.cell !== result.mineCell;
        
        if (isWinner) {
            const winAmount = userBet.bet * 1.45;
            this.userBalance += winAmount;
            this.stats.wins++;
            console.log('🎉 Вы выиграли:', winAmount);
        } else {
            this.stats.losses++;
            console.log('💥 Вы проиграли:', userBet.bet);
        }

        this.currentBet = 0;
        this.currentPlayerCell = null;
        this.updateStatsUI();
        this.saveToStorage();
    }

    showRoundResults(result) {
        this.highlightCells(result.mineCell);
        
        const userBet = this.currentRoundPlayers.get(this.playerId);
        if (!userBet) {
            setTimeout(() => {
                this.createGrid();
            }, 3000);
            return;
        }

        const isWinner = userBet.cell !== result.mineCell;
        
        setTimeout(() => {
            this.showResultsAnimation(isWinner, userBet.bet);
        }, 2000);
    }

    showResultsAnimation(isWinner, betAmount) {
        const animation = document.getElementById('resultsAnimation');
        const content = document.getElementById('animationContent');
        
        if (!animation || !content) return;
        
        if (isWinner) {
            const winAmount = (betAmount * 0.45).toFixed(2);
            content.innerHTML = `
                <div class="win-animation">🎉</div>
                <div class="result-text">ВЫ ВЫИГРАЛИ!</div>
                <div class="result-amount win-amount">+${winAmount} TON</div>
                <div class="auto-close-notice">Следующий раунд через 5 секунд</div>
            `;
        } else {
            content.innerHTML = `
                <div class="lose-animation">💥</div>
                <div class="result-text">ВЫ ПРОИГРАЛИ</div>
                <div class="result-amount lose-amount">-${betAmount} TON</div>
                <div class="auto-close-notice">Следующий раунд через 5 секунд</div>
            `;
        }
        
        animation.classList.add('active');
        
        setTimeout(() => {
            animation.classList.remove('active');
            this.createGrid();
        }, 5000);
    }

    startUIUpdate() {
        this.timers.ui = setInterval(() => {
            this.updateUI();
        }, 100);
    }

    updateUI() {
        // Баланс
        const userBalanceElement = document.getElementById('userBalance');
        if (userBalanceElement) {
            userBalanceElement.textContent = `${this.userBalance.toFixed(1)} TON`;
        }

        // Онлайн статистика
        const onlineCountElement = document.getElementById('onlineCount');
        const globalOnlineElement = document.getElementById('globalOnline');
        if (onlineCountElement && globalOnlineElement) {
            const onlineCount = this.players.size;
            onlineCountElement.textContent = onlineCount;
            globalOnlineElement.textContent = onlineCount;
        }

        // Улучшенный таймер раунда
        const timerElement = document.getElementById('roundTimer');
        const roundNumberElement = document.getElementById('roundNumber');
        
        if (timerElement && roundNumberElement) {
            if (this.gameState.isRoundActive) {
                const now = this.getServerTime();
                const timeLeft = Math.max(0, Math.floor((this.gameState.roundEndTime - now) / 1000));
                
                timerElement.textContent = `${timeLeft}с`;
                roundNumberElement.textContent = this.gameState.roundNumber;
                
                // Динамическое изменение цвета
                if (timeLeft <= 5) {
                    timerElement.style.color = 'var(--accent)';
                    timerElement.style.animation = 'emergency-pulse 0.5s infinite';
                } else if (timeLeft <= 10) {
                    timerElement.style.color = 'var(--warning)';
                    timerElement.style.animation = 'timer-pulse 0.8s infinite alternate';
                } else {
                    timerElement.style.color = 'var(--success)';
                    timerElement.style.animation = 'timer-pulse 1.5s infinite alternate';
                }
            } else {
                timerElement.textContent = 'ожидание...';
                timerElement.style.color = 'var(--text-secondary)';
                timerElement.style.animation = '';
                roundNumberElement.textContent = this.gameState.roundNumber;
            }
        }

        // Обновляем статус игроков в раунде с анимацией
        const playersInRoundElement = document.getElementById('playersInRound');
        if (playersInRoundElement) {
            const count = this.currentRoundPlayers.size;
            playersInRoundElement.textContent = count;
            
            // Анимация при изменении количества игроков
            if (count > parseInt(playersInRoundElement.dataset.lastCount || 0)) {
                playersInRoundElement.style.animation = 'celebrate 0.6s ease-out';
                setTimeout(() => {
                    playersInRoundElement.style.animation = '';
                }, 600);
            }
            playersInRoundElement.dataset.lastCount = count;
        }

        // Активные игры
        const activeGamesElement = document.getElementById('activeGames');
        if (activeGamesElement) {
            activeGamesElement.textContent = this.gameState.isRoundActive ? '1' : '0';
        }
    }

    createGrid() {
        const grid = document.getElementById('gameGrid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        for (let i = 1; i <= 9; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.innerHTML = `<span>${i}</span>`;
            cell.dataset.cell = i;
            cell.addEventListener('click', () => this.selectCell(i));
            grid.appendChild(cell);
        }
        
        // Восстанавливаем выбор ячейки если был
        this.updateCellSelectionUI();
    }

    selectCell(cellNumber) {
        // ИСПРАВЛЕНИЕ: Разрешаем выбор ячейки когда раунд НЕ активен (между раундами)
        if (this.gameState.isRoundActive) {
            alert('Раунд уже начался! Дождитесь следующего.');
            return;
        }
        
        this.currentPlayerCell = cellNumber;
        this.updateCellSelectionUI();
    }

    updateCellSelectionUI() {
        const selectedCellElement = document.getElementById('selectedCell');
        if (selectedCellElement) {
            selectedCellElement.textContent = this.currentPlayerCell ? this.currentPlayerCell : '-';
        }
        
        document.querySelectorAll('.cell').forEach(cell => {
            const cellNum = parseInt(cell.dataset.cell);
            const isSelected = cellNum === this.currentPlayerCell;
            cell.classList.toggle('selected', isSelected);
            
            // Добавляем анимацию для выбранной ячейки
            if (isSelected) {
                cell.style.animation = 'selected-pulse 1.5s infinite';
            } else {
                cell.style.animation = '';
            }
        });
    }

    placeBet() {
        // ИСПРАВЛЕНИЕ: Разрешаем ставки только когда раунд активен (идет прием ставок)
        if (!this.gameState.isRoundActive) {
            alert('Раунд еще не начался! Подождите начала следующего раунда.');
            return;
        }
        
        const betInput = document.getElementById('playerBet');
        const bet = parseInt(betInput.value);
        
        if (!bet || bet < 1) {
            alert('Введите корректную ставку (от 1 TON)');
            return;
        }
        
        if (bet > this.userBalance) {
            alert('Недостаточно средств на балансе');
            return;
        }
        
        if (!this.currentPlayerCell) {
            alert('Выберите ячейку для ставки');
            return;
        }
        
        if (this.socket) {
            this.socket.emit('place_bet', {
                playerId: this.playerId,
                bet: bet,
                cell: this.currentPlayerCell
            });
        }
        
        betInput.value = '';
        this.updateUI();
    }

    highlightCells(mineCell) {
        document.querySelectorAll('.cell').forEach(cell => {
            const cellNum = parseInt(cell.dataset.cell);
            cell.classList.remove('selected');
            cell.classList.add('revealing');
            
            setTimeout(() => {
                if (cellNum === mineCell) {
                    cell.classList.add('mine');
                    cell.innerHTML = '💣<br><small>' + cellNum + '</small>';
                } else {
                    cell.classList.add('safe');
                    cell.innerHTML = '💰<br><small>' + cellNum + '</small>';
                }
                
                setTimeout(() => {
                    cell.classList.remove('revealing');
                }, 600);
            }, 100);
        });
    }

    updatePlayersList() {
        const list = document.getElementById('playersList');
        if (!list) return;
        
        if (this.players.size === 0) {
            list.innerHTML = '<div class="empty-state">Игроки появятся здесь...</div>';
            return;
        }
        
        list.innerHTML = '';
        
        this.players.forEach((player, playerId) => {
            const playerEl = document.createElement('div');
            playerEl.className = `player-item ${playerId === this.playerId ? 'user' : ''}`;
            
            const inRound = this.currentRoundPlayers.has(playerId);
            const betInfo = inRound ? this.currentRoundPlayers.get(playerId) : null;
            
            playerEl.innerHTML = `
                <div class="player-name">${player.name} ${playerId === this.playerId ? '(Вы)' : ''}</div>
                <div class="player-bet">${inRound ? betInfo.bet + ' TON' : 'нет ставки'}</div>
                <div class="player-cell">${inRound ? '🎯 ' + betInfo.cell : '⏳'}</div>
            `;
            
            list.appendChild(playerEl);
        });
    }

    updateStatsUI() {
        document.getElementById('playerId').textContent = this.playerId.substring(0, 8) + '...';
        document.getElementById('profileBalance').textContent = `${this.userBalance.toFixed(1)} TON`;
        document.getElementById('gamesPlayed').textContent = this.stats.gamesPlayed;
        document.getElementById('winsCount').textContent = this.stats.wins;
        document.getElementById('lossesCount').textContent = this.stats.losses;
        document.getElementById('totalWagered').textContent = this.stats.totalWagered;
        
        const winRate = this.stats.gamesPlayed > 0 ? (this.stats.wins / this.stats.gamesPlayed * 100).toFixed(1) : 0;
        document.getElementById('winRate').textContent = `${winRate}%`;
    }

    showConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            const indicator = statusElement.querySelector('.connection-indicator');
            const text = statusElement.querySelector('span');
            
            if (connected) {
                indicator.className = 'connection-indicator connected';
                text.textContent = 'Подключено к серверу';
                statusElement.style.display = 'flex';
            } else {
                indicator.className = 'connection-indicator disconnected';
                text.textContent = 'Нет подключения';
                statusElement.style.display = 'flex';
            }
        }
    }

    saveToStorage() {
        const gameData = {
            stats: this.stats,
            userBalance: this.userBalance,
            playerId: this.playerId,
            playerName: this.playerName
        };
        localStorage.setItem('mines_game_data', JSON.stringify(gameData));
    }

    loadFromStorage() {
        const saved = localStorage.getItem('mines_game_data');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.stats = data.stats || this.stats;
                this.userBalance = data.userBalance || this.userBalance;
                this.playerId = data.playerId || this.playerId;
                this.playerName = data.playerName || this.playerName;
                this.updateStatsUI();
                this.updateUI();
            } catch (e) {
                console.error('Ошибка загрузки данных:', e);
            }
        }
    }

    resetStats() {
        if (confirm('Вы уверены, что хотите сбросить статистику?')) {
            this.stats = {
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                totalWagered: 0
            };
            this.updateStatsUI();
            this.saveToStorage();
        }
    }

    resetGame() {
        if (confirm('Вы уверены, что хотите начать новую игру? Весь прогресс будет сброшен.')) {
            this.userBalance = 10;
            this.resetStats();
            this.updateUI();
            this.saveToStorage();
        }
    }

    exportData() {
        const data = {
            playerId: this.playerId,
            playerName: this.playerName,
            stats: this.stats,
            balance: this.userBalance,
            exportTime: new Date().toISOString()
        };
        
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `mines_game_data_${this.playerId}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        alert('Данные экспортированы в файл!');
    }

    setupEventListeners() {
        document.querySelectorAll('.quick-bet').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const bet = parseInt(e.target.dataset.bet);
                document.getElementById('playerBet').value = bet;
            });
        });
        
        document.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
        
        document.addEventListener('wheel', (e) => {
            e.preventDefault();
        }, { passive: false });
    }
}

let game;

// Глобальные функции
function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    document.getElementById(screenId).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelector(`[data-screen="${screenId}"]`).classList.add('active');
    
    if (screenId === 'profileScreen') {
        game.updateStatsUI();
    }
}

function placeBet() {
    game.placeBet();
}

function resetStats() {
    game.resetStats();
}

function resetGame() {
    game.resetGame();
}

function exportData() {
    game.exportData();
}

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    game = new OnlineMinesGame();
    
    window.placeBet = placeBet;
    window.switchScreen = switchScreen;
    window.resetStats = resetStats;
    window.resetGame = resetGame;
    window.exportData = exportData;
});