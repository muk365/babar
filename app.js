document.addEventListener('DOMContentLoaded', () => {
    const TWITCH_CLIENT_ID = "2e633lsofl6qejiyhpdkb2alkoy64u";
    const TWITCH_REDIRECT_URI = "http://localhost/babar";
    const TWITCH_SCOPES = 'chat:read';

    const dom = {
        loginButton: document.getElementById('login-button'), 
        loginScreen: document.getElementById('login-screen'),
        appWrapper: document.getElementById('app-wrapper'), 
        usernameDisplay: document.getElementById('username'),
        profilePic: document.getElementById('profile-pic'), 
        fontSelector: document.getElementById('font-selector'),
        goalsDisplay: document.querySelector('.goals-display'), 
        goalsList: document.getElementById('goals-list'),
        addGoalButton: document.getElementById('add-goal-button'), 
        goalTitleInput: document.getElementById('goal-title-input'),
        goalTargetInput: document.getElementById('goal-target-input'), 
        globalTitleInput: document.getElementById('global-title-input'),
        globalTargetInput: document.getElementById('global-target-input'), 
        globalTitleDisplay: document.getElementById('global-title-display'),
        globalTargetText: document.getElementById('global-target-text'), 
        manualAddAmountInput: document.getElementById('manual-add-amount'),
        manualAddButton: document.getElementById('manual-add-button'), 
        bitsRatio: document.getElementById('bits-ratio'), 
        primeRatio: document.getElementById('prime-ratio'), 
        subT1Ratio: document.getElementById('sub-t1-ratio'),
        subT2Ratio: document.getElementById('sub-t2-ratio'), 
        subT3Ratio: document.getElementById('sub-t3-ratio'),
        donationTrigger: document.getElementById('donation-trigger-text'), 
        globalColor: document.getElementById('global-color'),
        globalContour: document.getElementById('global-contour-color'), 
        globalProgressText: document.getElementById('global-progress-text'),
        botUsernameInput: document.getElementById('bot-username-input'),
        aboutToggle: document.getElementById('about-toggle'), 
        aboutSection: document.getElementById('about-section'),
        logoutButton: document.getElementById('logout-button'),
        tmiStatus: document.getElementById('tmi-status'),
        botStatus: document.getElementById('bot-status'),
        debugLog: document.getElementById('debug-log')
    };
    
    let twitchClient = null;
    let state = {};
    let currentChannel = null;
    let currentToken = null;
    
    // Stockage des fonctions de traitement des événements pour les tests
    const eventHandlers = {};

    function debugLog(message) {
        console.log(message);
        if (dom.debugLog) {
            const timestamp = new Date().toLocaleTimeString();
            dom.debugLog.innerHTML += `<div>[${timestamp}] ${message}</div>`;
            dom.debugLog.scrollTop = dom.debugLog.scrollHeight;
        }
    }

    function updateBotStatus(status) {
        if (dom.botStatus) {
            dom.botStatus.textContent = status;
            dom.botStatus.style.color = status === 'Connecté' ? '#27ae60' : '#e74c3c';
        }
    }

    function init() {
        // Vérifier si TMI.js est chargé
        if (dom.tmiStatus) {
            dom.tmiStatus.textContent = typeof tmi !== 'undefined' ? 'Chargé ✓' : 'Erreur ✗';
            dom.tmiStatus.style.color = typeof tmi !== 'undefined' ? '#27ae60' : '#e74c3c';
        }

        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        
        // Nettoyer l'URL
        history.pushState("", document.title, window.location.pathname + window.location.search);
        
        loadStateFromLocalStorage();
        setupEventListeners();
        renderAll();
        
        if (accessToken) {
            dom.loginScreen.classList.add('hidden');
            dom.appWrapper.classList.remove('hidden');
            getUserInfo(accessToken);
        }

        debugLog("Application initialisée");
    }

    function handleLogin() {
        const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${TWITCH_REDIRECT_URI}&response_type=token&scope=${TWITCH_SCOPES}`;
        window.location.href = authUrl;
    }

    async function getUserInfo(token) {
        try {
            debugLog("Récupération des informations utilisateur...");
            const response = await fetch('https://api.twitch.tv/helix/users', { 
                headers: { 
                    'Authorization': `Bearer ${token}`, 
                    'Client-Id': TWITCH_CLIENT_ID 
                } 
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            const userInfo = data.data[0];
            
            dom.usernameDisplay.textContent = userInfo.display_name;
            dom.profilePic.src = userInfo.profile_image_url;
            
            currentChannel = userInfo.login;
            currentToken = token;
            
            debugLog(`Utilisateur connecté: ${userInfo.display_name}`);
            connectToTwitchChat(userInfo.login, token);
        } catch (error) { 
            console.error("Erreur API Twitch:", error);
            debugLog(`Erreur API Twitch: ${error.message}`);
        }
    }

    function connectToTwitchChat(channel, token) {
        if (typeof tmi === 'undefined') {
            const errorMsg = "ERREUR CRITIQUE: La librairie TMI.js (bot de chat) n'a pas pu être chargée.";
            console.error(errorMsg);
            debugLog(errorMsg);
            updateBotStatus("Erreur TMI");
            return;
        }

        // Déconnecter l'ancien client si existant
        if (twitchClient) {
            debugLog("Déconnexion de l'ancien client...");
            twitchClient.disconnect();
        }

        debugLog(`Tentative de connexion au canal: ${channel}`);
        updateBotStatus("Connexion...");

        // Configuration du client TMI avec options étendues
        const clientConfig = {
            options: { 
                debug: false,
                messagesLogLevel: "info"
            },
            connection: {
                reconnect: true,
                secure: true
            },
            identity: { 
                username: channel, 
                password: `oauth:${token}` 
            }, 
            channels: [`#${channel}`] // Important: préfixer avec #
        };

        twitchClient = new tmi.Client(clientConfig);
        
        // Événements de connexion
        twitchClient.on('connected', (address, port) => {
            const msg = `✅ Bot connecté avec succès au chat de ${channel}`;
            console.log(msg);
            debugLog(msg);
            updateBotStatus("Connecté");
        });

        twitchClient.on('disconnected', (reason) => {
            const msg = `❌ Bot déconnecté: ${reason}`;
            console.log(msg);
            debugLog(msg);
            updateBotStatus("Déconnecté");
        });

        twitchClient.on('reconnect', () => {
            debugLog("🔄 Reconnexion en cours...");
            updateBotStatus("Reconnexion...");
        });

        // Gestion des erreurs
        twitchClient.on('notice', (channel, msgid, message) => {
            debugLog(`Notice: ${msgid} - ${message}`);
        });

        // ⚠️ CORRECTION PRINCIPALE: Définir les gestionnaires AVANT connect()
        setupEventHandlers();

        // Tentative de connexion
        twitchClient.connect().catch(err => {
            const errorMsg = `❌ Erreur de connexion du bot: ${err.message}`;
            console.error(errorMsg, err);
            debugLog(errorMsg);
            updateBotStatus("Erreur");
        });
    }

    function setupEventHandlers() {
        if (!twitchClient) {
            debugLog("❌ Impossible de configurer les gestionnaires: client TMI inexistant");
            return;
        }

        // Gestionnaire pour les messages (bits et donations)
        const onMessage = (channel, tags, message, self) => {
            if (self) return; // Ignorer nos propres messages

            debugLog(`📩 Message reçu de ${tags.username}: ${message.substring(0, 50)}...`);

            // Détection des bits
            if (tags.bits) {
                const bitsAmount = parseInt(tags.bits, 10);
                const username = tags['display-name'] || tags.username;
                console.log(`[BITS] ${bitsAmount} bits de ${username}`);
                debugLog(`💎 BITS: ${bitsAmount} de ${username}`);
                
                const value = (bitsAmount / 100) * parseFloat(state.settings.bitsRatio);
                updateGlobalTotal(value, `Bits de ${username}`);
                return;
            }

            // Détection des donations par mot-clé
            const trigger = state.settings.donationTrigger.toLowerCase().trim();
            const botUsername = state.settings.botUsername.toLowerCase().trim();
            const senderUsername = tags.username.toLowerCase();

            if (trigger && message.toLowerCase().includes(trigger)) {
                // Si un bot spécifique est défini, vérifier que le message vient de ce bot
                if (!botUsername || senderUsername === botUsername) {
                    const matches = message.match(/(\d+[.,]?\d*)/g);
                    const amount = matches?.map(n => parseFloat(n.replace(',', '.'))).find(n => !isNaN(n) && n > 0);
                    
                    if (amount) {
                        console.log(`[DONATION] ${amount}€ détectée de ${senderUsername}`);
                        debugLog(`💰 DONATION: ${amount}€ de ${senderUsername}`);
                        updateGlobalTotal(amount, `Donation de ${senderUsername}`);
                    }
                }
            }
        };

        // Gestionnaire pour les événements utilisateur (subs, subgifts, etc.)
        const onUserNotice = (channel, tags, message, self) => {
            const msgId = tags['msg-id'];
            const username = tags['display-name'] || 'Anonyme';
            const subPlan = tags['msg-param-sub-plan'] || '1000';
            
            console.log(`[USER_NOTICE] Type: ${msgId}, Plan: ${subPlan}, User: ${username}`);
            debugLog(`🎉 EVENT: ${msgId} (${subPlan}) de ${username}`);
            
            let value = 0;
            let eventType = '';

            switch (msgId) {
                case 'sub':
                case 'resub':
                    eventType = 'SUB';
                    if (subPlan === 'Prime') {
                        value = parseFloat(state.settings.primeRatio);
                    } else if (subPlan === '2000') {
                        value = parseFloat(state.settings.subT2Ratio);
                    } else if (subPlan === '3000') {
                        value = parseFloat(state.settings.subT3Ratio);
                    } else { // '1000' ou autres
                        value = parseFloat(state.settings.subT1Ratio);
                    }
                    break;

                case 'subgift':
                    eventType = 'SUBGIFT';
                    if (subPlan === '2000') {
                        value = parseFloat(state.settings.subT2Ratio);
                    } else if (subPlan === '3000') {
                        value = parseFloat(state.settings.subT3Ratio);
                    } else { // '1000' ou autres
                        value = parseFloat(state.settings.subT1Ratio);
                    }
                    break;

                case 'submysterygift':
                    // Pour les mystery gifts, on peut récupérer le nombre
                    const giftCount = parseInt(tags['msg-param-mass-gift-count'] || 1, 10);
                    eventType = 'MYSTERY_GIFTS';
                    debugLog(`🎁 MYSTERY GIFT: ${giftCount} subs de ${username}`);
                    
                    // Utiliser le ratio T1 par défaut pour les mystery gifts
                    value = parseFloat(state.settings.subT1Ratio) * giftCount;
                    break;

                default:
                    // Autres événements comme raids, etc.
                    debugLog(`ℹ️ Événement non traité: ${msgId}`);
                    return;
            }

            if (value > 0) {
                console.log(`[${eventType}] Valeur: ${value}€ de ${username}`);
                debugLog(`💸 ${eventType}: +${value}€ de ${username}`);
                updateGlobalTotal(value, `${eventType} de ${username}`);
            }
        };

        // Événement pour les raids (optionnel)
        const onRaided = (channel, username, viewers) => {
            console.log(`[RAID] ${username} a raid avec ${viewers} viewers`);
            debugLog(`🚀 RAID: ${username} (${viewers} viewers)`);
            // Vous pouvez ajouter une logique pour les raids si souhaité
        };

        // ⚠️ CORRECTION PRINCIPALE: Attacher directement au client TMI
        twitchClient.on('message', onMessage);
        twitchClient.on('usernotice', onUserNotice);
        twitchClient.on('raided', onRaided);

        // Stocker les références pour les tests
        eventHandlers.onMessage = onMessage;
        eventHandlers.onUserNotice = onUserNotice;
        eventHandlers.onRaided = onRaided;

        debugLog("✅ Gestionnaires d'événements configurés");
    }

    function updateGlobalTotal(amount, source) {
        if (isNaN(amount) || amount <= 0) return;
        
        const oldValue = state.global.current;
        state.global.current = Math.max(0, state.global.current + amount);
        
        debugLog(`📈 Total: ${oldValue.toFixed(2)}€ → ${state.global.current.toFixed(2)}€ (+${amount.toFixed(2)}€) - ${source}`);
        renderAll();
    }

    function renderAll() {
        if (!state || !state.global) return;
        
        // Appliquer la police
        dom.goalsDisplay.style.fontFamily = state.settings.font;
        
        // Mettre à jour les goals individuels
        state.goals.forEach(goal => { 
            goal.current = Math.min(state.global.current, goal.target); 
        });
        
        renderGlobalBar();
        renderGoals();
        saveStateToLocalStorage();
    }
    
    function renderGlobalBar() {
        const { current, target, title, fillColor, contourColor } = state.global;
        dom.globalTitleDisplay.textContent = `🌟 ${title} 🌟`;
        dom.globalTargetText.textContent = `${target.toFixed(2)}€`;
        
        const percentage = target > 0 ? Math.min(100, (current / target) * 100) : 0;
        const fillElement = dom.appWrapper.querySelector('#global-fill');
        
        if (fillElement) {
            fillElement.style.width = `${percentage.toFixed(2)}%`;
            fillElement.style.backgroundColor = fillColor;
        }
        
        const progressBar = dom.appWrapper.querySelector('.global-goal .progress-bar');
        if (progressBar) {
            progressBar.style.borderColor = contourColor;
        }
        
        dom.globalProgressText.textContent = `${current.toFixed(2)}€`;
    }

    function renderGoals() {
        dom.goalsList.innerHTML = '';
        
        state.goals.forEach(goal => {
            const percentage = goal.target > 0 ? Math.min(100, (goal.current / goal.target) * 100) : 0;
            const el = document.createElement('div');
            el.className = 'goal-container draggable';
            el.setAttribute('draggable', true);
            el.dataset.goalId = goal.id;
            
            el.innerHTML = `
                <h3>😍 ${goal.title}</h3>
                <div class="progress-bar-wrapper">
                    <span class="progress-label start">0€</span>
                    <div class="progress-bar" style="border-color:${goal.contourColor};">
                        <div class="progress-bar-fill" style="width: ${percentage.toFixed(2)}%; background-color:${goal.fillColor};"></div>
                        <span class="progress-bar-text">${goal.current.toFixed(2)}€</span>
                    </div>
                    <span class="progress-label end">${goal.target.toFixed(2)}€</span>
                </div>
                <div class="goal-config">
                    <label>Couleur</label> 
                    <input type="color" class="color-picker" data-id="${goal.id}" data-type="fill" value="${goal.fillColor}">
                    <label>Contour</label> 
                    <input type="color" class="color-picker" data-id="${goal.id}" data-type="contour" value="${goal.contourColor}">
                    <button class="delete-goal" data-id="${goal.id}">❌</button>
                </div>
            `;
            
            dom.goalsList.appendChild(el);
        });
    }

    function saveStateToLocalStorage() { 
        try {
            localStorage.setItem('projetBabarState', JSON.stringify(state)); 
        } catch (error) {
            console.error('Erreur sauvegarde localStorage:', error);
        }
    }
    
    function loadStateFromLocalStorage() {
        try {
            const savedState = JSON.parse(localStorage.getItem('projetBabarState'));
            const defaults = {
                global: { 
                    title: "Objectif Stream Global", 
                    target: 1000, 
                    current: 0, 
                    fillColor: "#ff8c00", 
                    contourColor: "#ffffff" 
                },
                goals: [],
                settings: { 
                    font: "'Montserrat', sans-serif", 
                    bitsRatio: 1, 
                    primeRatio: 2.5, 
                    subT1Ratio: 5, 
                    subT2Ratio: 10, 
                    subT3Ratio: 25, 
                    donationTrigger: "", 
                    botUsername: "" 
                }
            };
            
            state = {
               global: { ...defaults.global, ...(savedState?.global || {}) },
               goals: savedState?.goals || defaults.goals,
               settings: { ...defaults.settings, ...(savedState?.settings || {}) },
            };
            
            // Remplir les champs du formulaire
            dom.globalTitleInput.value = state.global.title; 
            dom.globalTargetInput.value = state.global.target;
            dom.globalColor.value = state.global.fillColor; 
            dom.globalContour.value = state.global.contourColor;
            dom.fontSelector.value = state.settings.font; 
            dom.bitsRatio.value = state.settings.bitsRatio;
            dom.primeRatio.value = state.settings.primeRatio; 
            dom.subT1Ratio.value = state.settings.subT1Ratio;
            dom.subT2Ratio.value = state.settings.subT2Ratio; 
            dom.subT3Ratio.value = state.settings.subT3Ratio;
            dom.donationTrigger.value = state.settings.donationTrigger; 
            dom.botUsernameInput.value = state.settings.botUsername;
        } catch (error) {
            console.error('Erreur chargement localStorage:', error);
            // Utiliser les valeurs par défaut en cas d'erreur
            loadStateFromLocalStorage.call(this);
        }
    }

    function handleLogout() {
        if (confirm("Voulez-vous vraiment vous déconnecter ?\nVos paramètres et barres de progression seront conservés.")) {
            if (twitchClient) {
                twitchClient.disconnect();
            }
            debugLog("Déconnexion utilisateur");
            window.location.href = TWITCH_REDIRECT_URI;
        }
    }
    
    function setupEventListeners() {
        // Boutons principaux
        dom.loginButton.addEventListener('click', handleLogin);
        dom.logoutButton.addEventListener('click', handleLogout);
        
        // Configuration des paramètres
        const settingsToUpdate = {
            globalTitleInput: (val) => state.global.title = val, 
            globalTargetInput: (val) => state.global.target = parseFloat(val) || 0,
            globalColor: (val) => state.global.fillColor = val, 
            globalContour: (val) => state.global.contourColor = val,
            fontSelector: (val) => state.settings.font = val, 
            bitsRatio: (val) => state.settings.bitsRatio = parseFloat(val) || 0,
            primeRatio: (val) => state.settings.primeRatio = parseFloat(val) || 0, 
            subT1Ratio: (val) => state.settings.subT1Ratio = parseFloat(val) || 0,
            subT2Ratio: (val) => state.settings.subT2Ratio = parseFloat(val) || 0, 
            subT3Ratio: (val) => state.settings.subT3Ratio = parseFloat(val) || 0,
            donationTrigger: (val) => state.settings.donationTrigger = val, 
            botUsernameInput: (val) => state.settings.botUsername = val
        };
        
        // Attacher les événements de mise à jour
        for (const [domKey, updateFn] of Object.entries(settingsToUpdate)) {
            const eventType = ['fontSelector', 'globalColor', 'globalContour'].includes(domKey) ? 'change' : 'input';
            if (dom[domKey]) {
                dom[domKey].addEventListener(eventType, (e) => { 
                    updateFn(e.target.value); 
                    renderAll(); 
                });
            }
        }

        // Ajouter un nouveau goal
        dom.addGoalButton.addEventListener('click', () => {
            const title = dom.goalTitleInput.value.trim(); 
            const target = parseFloat(dom.goalTargetInput.value);
            
            if (title && target > 0) {
                const newGoal = {
                    id: Date.now(), 
                    title, 
                    target, 
                    current: Math.min(state.global.current, target), 
                    fillColor: '#27ae60', 
                    contourColor: '#ffffff'
                };
                
                state.goals.push(newGoal);
                debugLog(`➕ Nouveau goal ajouté: ${title} (${target}€)`);
                renderAll(); 
                
                // Nettoyer les champs
                dom.goalTitleInput.value = ''; 
                dom.goalTargetInput.value = '';
            } else {
                alert('Veuillez saisir un titre et un montant valide.');
            }
        });

        // Gestion des goals (suppression et couleurs)
        dom.goalsList.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-goal')) {
                const goalId = parseInt(e.target.dataset.id, 10);
                const goal = state.goals.find(g => g.id === goalId);
                
                if (goal && confirm(`Voulez-vous supprimer le goal "${goal.title}" ?`)) { 
                    state.goals = state.goals.filter(g => g.id !== goalId); 
                    debugLog(`🗑️ Goal supprimé: ${goal.title}`);
                    renderAll(); 
                }
            }
        });

        // Changement de couleurs des goals
        dom.goalsList.addEventListener('input', (e) => {
            if (e.target.classList.contains('color-picker')) {
                const goalId = parseInt(e.target.dataset.id, 10);
                const goal = state.goals.find(g => g.id === goalId);
                
                if (goal) { 
                    if (e.target.dataset.type === 'fill') {
                        goal.fillColor = e.target.value;
                    } else {
                        goal.contourColor = e.target.value;
                    }
                    renderAll(); 
                }
            }
        });

        // Correction manuelle
        dom.manualAddButton.addEventListener('click', () => {
            const amount = parseFloat(dom.manualAddAmountInput.value);
            
            if (!isNaN(amount)) {
                updateGlobalTotal(amount, "Correction manuelle"); 
                dom.manualAddAmountInput.value = '';
            } else {
                alert('Veuillez saisir un montant valide.');
            }
        });

        // Section à propos
        dom.aboutToggle.addEventListener('click', () => {
            dom.aboutSection.classList.toggle('visible');
            const toggleText = dom.aboutToggle.textContent;
            
            if (dom.aboutSection.classList.contains('visible')) { 
                dom.aboutToggle.textContent = toggleText.replace('▼', '▲'); 
            } else { 
                dom.aboutToggle.textContent = toggleText.replace('▲', '▼'); 
            }
        });

        // Drag & Drop pour réorganiser les goals
        let draggedItem = null;
        
        dom.goalsList.addEventListener('dragstart', e => {
            if (e.target.classList.contains('draggable')) { 
                draggedItem = e.target; 
                setTimeout(() => draggedItem.classList.add('dragging'), 0); 
            }
        });

        dom.goalsList.addEventListener('dragend', () => {
            if(draggedItem) { 
                draggedItem.classList.remove('dragging'); 
                draggedItem = null; 
            }
        });

        dom.goalsList.addEventListener('dragover', e => {
            e.preventDefault();
            if(!draggedItem) return;
            
            const afterElement = [...dom.goalsList.querySelectorAll('.draggable:not(.dragging)')].reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = e.clientY - box.top - box.height / 2;
                
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
            
            if (afterElement == null) { 
                dom.goalsList.appendChild(draggedItem); 
            } else { 
                dom.goalsList.insertBefore(draggedItem, afterElement); 
            }
        });

        dom.goalsList.addEventListener('drop', e => {
            e.preventDefault();
            if (draggedItem) {
                const newOrderedIds = [...dom.goalsList.querySelectorAll('.draggable')].map(el => parseInt(el.dataset.goalId, 10));
                state.goals.sort((a, b) => newOrderedIds.indexOf(a.id) - newOrderedIds.indexOf(b.id));
                debugLog("📋 Ordre des goals réorganisé");
                saveStateToLocalStorage();
            }
        });
    }
    
    // --- ZONE DE TEST ACCESSIBLE DEPUIS LA CONSOLE ---
    window.BabarSimulateCheer = function(bits, username = 'TestUser') {
        console.log(`[TEST] Simulation de ${bits} BITS de ${username}`);
        debugLog(`🧪 TEST BITS: ${bits} de ${username}`);
        
        if (!eventHandlers.onMessage) { 
            const msg = "Le bot n'est pas connecté. Veuillez d'abord vous logger.";
            console.error(msg); 
            debugLog(`❌ ${msg}`);
            return; 
        }
        
        const fakeTags = { 
            bits: String(bits), 
            'display-name': username, 
            username: username.toLowerCase() 
        };
        
        eventHandlers.onMessage('#testchannel', fakeTags, `cheer${bits}`, false);
    };

    window.BabarSimulateSub = function(subPlan = '1000', username = 'TestUser') { 
        console.log(`[TEST] Simulation d'un SUB (${subPlan}) de ${username}`);
        debugLog(`🧪 TEST SUB: ${subPlan} de ${username}`);
        
        if (!eventHandlers.onUserNotice) { 
            const msg = "Le bot n'est pas connecté. Veuillez d'abord vous logger.";
            console.error(msg); 
            debugLog(`❌ ${msg}`);
            return; 
        }
        
        const fakeTags = { 
            'msg-id': 'sub', 
            'display-name': username, 
            'msg-param-sub-plan': subPlan 
        };
        
        eventHandlers.onUserNotice('#testchannel', fakeTags, 'A sub!', false);
    };

    window.BabarSimulateSubGift = function(subPlan = '1000', username = 'TestGifter') {
        console.log(`[TEST] Simulation d'un SUBGIFT (${subPlan}) de ${username}`);
        debugLog(`🧪 TEST SUBGIFT: ${subPlan} de ${username}`);
        
        if (!eventHandlers.onUserNotice) { 
            const msg = "Le bot n'est pas connecté. Veuillez d'abord vous logger.";
            console.error(msg); 
            debugLog(`❌ ${msg}`);
            return; 
        }
        
        const fakeTags = { 
            'msg-id': 'subgift', 
            'display-name': username, 
            'msg-param-sub-plan': subPlan 
        };
        
        eventHandlers.onUserNotice('#testchannel', fakeTags, 'A subgift!', false);
    };

    window.BabarSimulateDonation = function(amount, username = 'TestBot') {
        console.log(`[TEST] Simulation d'une DONATION (${amount}€) de ${username}`);
        debugLog(`🧪 TEST DONATION: ${amount}€ de ${username}`);
        
        if (!eventHandlers.onMessage) { 
            const msg = "Le bot n'est pas connecté. Veuillez d'abord vous logger.";
            console.error(msg); 
            debugLog(`❌ ${msg}`);
            return; 
        }
        
        const trigger = state.settings.donationTrigger || "a fait un don de";
        const fakeTags = { 
            username: username.toLowerCase(),
            'display-name': username
        };
        
        const fakeMessage = `${username} ${trigger} ${amount}€ !`;
        eventHandlers.onMessage('#testchannel', fakeTags, fakeMessage, false);
    };

    // Debug helper pour vider les logs
    window.BabarClearDebug = function() {
        if (dom.debugLog) {
            dom.debugLog.innerHTML = '';
            debugLog("Debug log vidé");
        }
    };

    // Debug helper pour afficher l'état actuel
    window.BabarShowState = function() {
        console.log("État actuel:", state);
        debugLog(`État: Global=${state.global.current}€/${state.global.target}€, Goals=${state.goals.length}`);
    };
    
    // Initialisation
    init();
});