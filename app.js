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
        logoutButton: document.getElementById('logout-button')
    };
    
    let twitchClient = null;
    let state = {};

    function init() {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        history.pushState("", document.title, window.location.pathname + window.location.search);
        loadStateFromLocalStorage();
        setupEventListeners();
        renderAll();
        if (accessToken) {
            dom.loginScreen.classList.add('hidden');
            dom.appWrapper.classList.remove('hidden');
            getUserInfo(accessToken);
        }
    }

    function handleLogin() {
        const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${TWITCH_REDIRECT_URI}&response_type=token&scope=${TWITCH_SCOPES}`;
        window.location.href = authUrl;
    }

    async function getUserInfo(token) {
        try {
            const response = await fetch('https://api.twitch.tv/helix/users', { headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID } });
            const data = await response.json();
            const userInfo = data.data[0];
            dom.usernameDisplay.textContent = userInfo.display_name;
            dom.profilePic.src = userInfo.profile_image_url;
            connectToTwitchChat(userInfo.login, token);
        } catch (error) { console.error("Erreur API Twitch:", error); }
    }

    function connectToTwitchChat(channel, token) {
        if (typeof tmi === 'undefined') {
            console.error("ERREUR CRITIQUE: La librairie TMI.js (bot de chat) n'a pas pu être chargée. Vérifiez la connexion internet et le lien du script dans index.html.");
            return;
        }
        if (twitchClient) twitchClient.disconnect();
        twitchClient = new tmi.Client({ options: { debug: false }, identity: { username: channel, password: `oauth:${token}` }, channels: [channel] });
        twitchClient.connect().catch(console.error);

        twitchClient.on('message', (channel, tags, message, self) => {
            if (tags.bits) {
                const value = (parseInt(tags.bits, 10) / 100) * parseFloat(state.settings.bitsRatio);
                updateGlobalTotal(value, `Bits de ${tags['display-name']}`);
            }
            const trigger = state.settings.donationTrigger.toLowerCase().trim();
            const botUsername = state.settings.botUsername.toLowerCase().trim();
            const senderUsername = tags.username.toLowerCase();
            if (trigger && message.toLowerCase().includes(trigger) && (!botUsername || senderUsername === botUsername)) {
                const amount = message.match(/(\d+[.,]?\d*)/g)?.map(n => parseFloat(n.replace(',', '.'))).find(n => !isNaN(n));
                if (amount) updateGlobalTotal(amount, `Donation détectée de ${senderUsername}`);
            }
        });

        twitchClient.on('usernotice', (channel, tags, message, self) => {
            let value = 0;
            const subPlan = tags['msg-param-sub-plan'];
            if (tags['msg-id'] === 'sub' || tags['msg-id'] === 'resub') {
                if (subPlan === 'Prime') value = parseFloat(state.settings.primeRatio);
                else if (subPlan === '2000') value = parseFloat(state.settings.subT2Ratio);
                else if (subPlan === '3000') value = parseFloat(state.settings.subT3Ratio);
                else value = parseFloat(state.settings.subT1Ratio);
            } else if (tags['msg-id'] === 'subgift') {
                const plan = tags['msg-param-sub-plan'] || '1000';
                if (plan === '2000') value = parseFloat(state.settings.subT2Ratio);
                else if (plan === '3000') value = parseFloat(state.settings.subT3Ratio);
                else value = parseFloat(state.settings.subT1Ratio);
            }
            if (value > 0) updateGlobalTotal(value, `Sub de ${tags['display-name'] || 'Anonyme'}`);
        });
    }

    function updateGlobalTotal(amount, source) {
        if (isNaN(amount)) return;
        state.global.current = Math.max(0, state.global.current + amount);
        renderAll();
    }

    function renderAll() {
        if (!state || !state.global) return;
        dom.goalsDisplay.style.fontFamily = state.settings.font;
        state.goals.forEach(goal => { goal.current = Math.min(state.global.current, goal.target); });
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
        fillElement.style.width = `${percentage.toFixed(2)}%`;
        fillElement.style.backgroundColor = fillColor;
        dom.appWrapper.querySelector('.global-goal .progress-bar').style.borderColor = contourColor;
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
            el.innerHTML = `<h3>🐘 ${goal.title}</h3><div class="progress-bar-wrapper"><span class="progress-label start">0€</span><div class="progress-bar" style="border-color:${goal.contourColor};"><div class="progress-bar-fill" style="width: ${percentage.toFixed(2)}%; background-color:${goal.fillColor};"></div><span class="progress-bar-text">${goal.current.toFixed(2)}€</span></div><span class="progress-label end">${goal.target.toFixed(2)}€</span></div><div class="goal-config"><label>Couleur</label> <input type="color" class="color-picker" data-id="${goal.id}" data-type="fill" value="${goal.fillColor}"><label>Contour</label> <input type="color" class="color-picker" data-id="${goal.id}" data-type="contour" value="${goal.contourColor}"><button class="delete-goal" data-id="${goal.id}">❌</button></div>`;
            dom.goalsList.appendChild(el);
        });
    }

    function saveStateToLocalStorage() { 
        localStorage.setItem('projetBabarState', JSON.stringify(state)); 
    }
    
    function loadStateFromLocalStorage() {
        const savedState = JSON.parse(localStorage.getItem('projetBabarState'));
        const defaults = {
            global: { title: "Objectif Stream Global", target: 1000, current: 0, fillColor: "#ff8c00", contourColor: "#ffffff" },
            goals: [],
            settings: { font: "'Montserrat', sans-serif", bitsRatio: 1, primeRatio: 2.5, subT1Ratio: 5, subT2Ratio: 10, subT3Ratio: 25, donationTrigger: "", botUsername: "" }
        };
        state = {
           global: { ...defaults.global, ...(savedState?.global || {}) },
           goals: savedState?.goals || defaults.goals,
           settings: { ...defaults.settings, ...(savedState?.settings || {}) },
        };
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
    }
    
    // CORRIGÉ: Nouvelle fonction de déconnexion "douce"
    function handleLogout() {
        // Le message est mis à jour pour ne plus effrayer l'utilisateur.
        if (confirm("Voulez-vous vraiment vous déconnecter ?\nVos paramètres et barres de progression seront conservés.")) {
            // On ne touche PAS au localStorage.
            // On redirige simplement vers l'URL de base, ce qui efface le token de l'URL et force la réapparition de l'écran de login.
            window.location.href = TWITCH_REDIRECT_URI;
        }
    }
    
    function setupEventListeners() {
        dom.loginButton.addEventListener('click', handleLogin);
        dom.logoutButton.addEventListener('click', handleLogout); // Le listener appelle maintenant la nouvelle fonction.
        
        const settingsToUpdate = {
            globalTitleInput: (val) => state.global.title = val, globalTargetInput: (val) => state.global.target = parseFloat(val) || 0,
            globalColor: (val) => state.global.fillColor = val, globalContour: (val) => state.global.contourColor = val,
            fontSelector: (val) => state.settings.font = val, bitsRatio: (val) => state.settings.bitsRatio = parseFloat(val) || 0,
            primeRatio: (val) => state.settings.primeRatio = parseFloat(val) || 0, subT1Ratio: (val) => state.settings.subT1Ratio = parseFloat(val) || 0,
            subT2Ratio: (val) => state.settings.subT2Ratio = parseFloat(val) || 0, subT3Ratio: (val) => state.settings.subT3Ratio = parseFloat(val) || 0,
            donationTrigger: (val) => state.settings.donationTrigger = val, botUsernameInput: (val) => state.settings.botUsername = val
        };

        for (const [domKey, updateFn] of Object.entries(settingsToUpdate)) {
            const eventType = ['fontSelector', 'globalColor', 'globalContour'].includes(domKey) ? 'change' : 'input';
            dom[domKey].addEventListener(eventType, (e) => { 
                updateFn(e.target.value); 
                renderAll(); 
            });
        }
        
        dom.addGoalButton.addEventListener('click', () => {
            const title = dom.goalTitleInput.value.trim(); 
            const target = parseFloat(dom.goalTargetInput.value);
            if (title && target > 0) {
                state.goals.push({ id: Date.now(), title, target, current: Math.min(state.global.current, target), fillColor: '#27ae60', contourColor: '#ffffff' });
                renderAll(); 
                dom.goalTitleInput.value = ''; 
                dom.goalTargetInput.value = '';
            }
        });
        
        dom.goalsList.addEventListener('click', (e) => {
             if (e.target.classList.contains('delete-goal')) {
                const goalId = parseInt(e.target.dataset.id, 10);
                if (confirm("Voulez-vous supprimer ce goal ?")) {
                    state.goals = state.goals.filter(g => g.id !== goalId); 
                    renderAll();
                }
            }
        });
        
        dom.goalsList.addEventListener('input', (e) => {
            if (e.target.classList.contains('color-picker')) {
                const goal = state.goals.find(g => g.id === parseInt(e.target.dataset.id, 10));
                if (goal) { 
                    if (e.target.dataset.type === 'fill') goal.fillColor = e.target.value; 
                    else goal.contourColor = e.target.value; 
                    renderAll(); 
                }
            }
        });
        
        dom.manualAddButton.addEventListener('click', () => {
            const amount = parseFloat(dom.manualAddAmountInput.value); 
            updateGlobalTotal(amount, "Correction manuelle"); 
            dom.manualAddAmountInput.value = '';
        });
        
        dom.aboutToggle.addEventListener('click', () => {
            dom.aboutSection.classList.toggle('visible');
            const toggleText = dom.aboutToggle.textContent;
            if (dom.aboutSection.classList.contains('visible')) { 
                dom.aboutToggle.textContent = toggleText.replace('▼', '▲'); 
            } else { 
                dom.aboutToggle.textContent = toggleText.replace('▲', '▼'); 
            }
        });

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
                if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
                else return closest;
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
                saveStateToLocalStorage();
            }
        });
    }
    
    init();
});