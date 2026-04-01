let botEnabled = false;
let autoTrain = false;
let isBotThinking = false;
let botDelay = 800; // Vitesse de jeu du bot (800ms par défaut)

function toggleBot() {
    botEnabled = !botEnabled;
    let btn = document.getElementById('bot-btn');
    if(btn) {
        btn.innerText = botEnabled ? "🤖 Bot: ON" : "🤖 Bot: OFF";
        btn.style.background = botEnabled ? "#4caf50" : "#9c27b0";
    }
    if(botEnabled && state && state.turn === myId && !state.gameOver) triggerBot(state.turn);
}

function toggleAutoTrain() {
    autoTrain = !autoTrain;
    botDelay = autoTrain ? 100 : 800; // Mode turbo pour l'entrainement
    let btn = document.getElementById('auto-train-btn');
    if(btn) {
        btn.innerText = autoTrain ? "🧬 Auto-Train: ON" : "🧬 Auto-Train: OFF";
        btn.style.background = autoTrain ? "#4caf50" : "#009688";
    }
    if(autoTrain && !botEnabled) toggleBot();
}

function playChampion() {
    if(!state || state.gameOver) return;
    triggerBot(state.turn, true);
}

function triggerBot(pId, force = false) {
    if (isBotThinking || state.gameOver) {
        // En mode auto-train, on relance automatiquement une nouvelle partie quand c'est fini !
        if(state.gameOver && autoTrain) {
            setTimeout(() => confirmReset(true), 2500);
        }
        return;
    }
    
    let isIA = false;
    if (state.mode === 'IA_SOLO' || state.mode === 'IA_VS_IA') isIA = true;
    if (state.mode === 'VS_IA' && pId === 2) isIA = true;

    if (!force && !isIA) return;

    isBotThinking = true;
    setTimeout(() => {
        // CORRECTION MAJEURE : On libère le verrou AVANT d'exécuter l'action
        // Cela permet à Firebase de relancer le bot automatiquement et de manière fluide !
        isBotThinking = false; 
        try {
            executeBestAction(pId);
        } catch (error) {
            console.error("Erreur dans le cerveau du Bot :", error);
            actFin();
        }
    }, botDelay);
}

function executeBestAction(pId) {
    const me = state['p' + pId];
    const s = state.settings;

    // SÉCURITÉ : On s'assure que les tableaux vides existent toujours
    if (!me.hand) me.hand = [];
    if (!me.zones) me.zones = [];
    if (!me.auxActifs) me.auxActifs = [];
    if (!me.upgrades) me.upgrades = Array(8).fill(1);

    const listPetitsFruits = ["Fraise", "Melon", "Pastèque"]; 
    const listGrimpantes = ["Haricot", "Pois", "Concombre", "Cornichon", "Chayotte", "Vigne"];
    const listCompagnes = ["Ail", "Aneth", "Agastache", "Basilic", "Bleuet", "Bourrache", "Capucine", "Cébette", "Cerfeuil", "Ciboulette", "Coriandre", "Cosmos", "Echalote", "Épinard", "Estragon", "Lin", "Marguerite", "Mélilot Blanc", "Mélisse", "Menthe", "Moutarde", "Oignon", "Origan", "Oeillet d'Inde", "Persil", "Romarin", "Sarriette", "Sauge", "Serpolet", "Souci", "Tanaisie", "Thym", "Tournesol"];

    // --- PRIORITÉ 1 : RÉCOLTER ---
    for (let i = 0; i < me.zones.length; i++) {
        let z = me.zones[i];
        if (z && z.slots) {
            for (let j = 0; j < z.slots.length; j++) {
                let c = z.slots[j];
                if (c.eCur <= 0 && c.sCur <= 0 && me.time >= s.costRecolterTemps) {
                    localSelectedId = z.id; 
                    actionRecolter(z.id, j);
                    return;
                }
            }
        }
    }

    // --- PRIORITÉ 2 : JOUER UN OUTIL / AUXILIAIRE ---
    for (let i = 0; i < me.hand.length; i++) {
        let c = me.hand[i];
        let cost = Math.max(0, (c.t || 1) - (me.upgrades[2] - 1));
        if (me.time >= cost) {
            if (c.cat === 'X' || (c.cat === 'S' && !listCompagnes.includes(c.nom) && !c.nom.includes("Fumier") && !c.nom.includes("Ortie") && !c.nom.includes("Paillage") && !c.nom.includes("Corne"))) {
                playC(i, null);
                return;
            }
        }
    }

    // --- PRIORITÉ 3 : SOUTIENS CIBLÉS (Engrais / Compagnes) ---
    for (let i = 0; i < me.hand.length; i++) {
        let c = me.hand[i];
        let cost = Math.max(0, (c.t || 1) - (me.upgrades[2] - 1));
        if (me.time >= cost && c.cat === 'S') {
            if(c.nom.includes("Fumier")) {
                playC(i, null); return;
            } else if(listCompagnes.includes(c.nom)) {
                let tz = me.zones.find(z => z.slots && z.slots.some(pl => !pl.compagne));
                if(tz) { localSelectedId = tz.id; playC(i, tz.id); return; }
            } else {
                let tz = me.zones.find(z => z.slots && z.slots.length > 0);
                if(tz) { localSelectedId = tz.id; playC(i, tz.id); return; }
            }
        }
    }

    // --- PRIORITÉ 4 : ARROSER ---
    if (me.time >= s.costArroserTemps) {
        for (let i = 0; i < me.zones.length; i++) {
            let z = me.zones[i];
            if (z && z.slots && z.slots.some(c => c.eCur > 0)) {
                localSelectedId = z.id;
                actArr(z.id);
                return;
            }
        }
    }

    // --- PRIORITÉ 5 : PLANTER UN LÉGUME / ARBRE ---
    let curS = ["P","E","A","H"][state.saisonIdx];
    let hasTuteur = me.auxActifs.some(a => a && (a.includes("Tuteur") || a.includes("Treillage")));
    
    for (let i = 0; i < me.hand.length; i++) {
        let c = me.hand[i];
        let cost = Math.max(0, (c.t || 1) - (me.upgrades[2] - 1));
        if (me.time < cost) continue;

        if (c.cat === 'L' || c.cat === 'A') {
            let isPetitFruit = listPetitsFruits.some(pf => c.nom.includes(pf));
            let isGrimpante = listGrimpantes.some(g => c.nom.includes(g));

            for (let j = 0; j < me.zones.length; j++) {
                let z = me.zones[j];
                if (!z.type) continue; 
                
                let smValid = z.batiment === 'SERRE' ? (c.sm||[]).map(se => ["P","E","A","H"][(["P","E","A","H"].indexOf(se)+3)%4]).concat(c.sm||[]) : (c.sm||[]);
                if(!smValid.includes(curS)) continue; 

                if (c.cat === 'L' && z.type !== 'POTAGER' && !(z.type === 'VERGER' && isPetitFruit)) continue; 
                if (c.cat === 'A' && z.type !== 'VERGER') continue; 

                let maxSlots = z.type === 'POTAGER' ? 2 : 1;
                let occupied = 0;
                (z.slots || []).forEach(pl => {
                    if (!(listGrimpantes.some(g => pl.nom.includes(g)) && hasTuteur)) occupied++;
                });

                if (!(isGrimpante && hasTuteur) && occupied >= maxSlots) continue; 

                localSelectedId = z.id;
                playC(i, z.id);
                return;
            }
        }
    }

    // --- PRIORITÉ 6 : AMÉNAGER UN TERRAIN ---
    let wantsPotager = me.hand.some(c => c.cat === 'L' && !listPetitsFruits.some(pf => c.nom.includes(pf)));
    let wantsVerger = me.hand.some(c => c.cat === 'A' || listPetitsFruits.some(pf => c.nom.includes(pf)));
    let costP_Or = Math.max(0, s.costAmenagerPotagerOr - (me.upgrades[5] >= 2 ? (me.upgrades[5] === 3 ? 2 : 1) : 0));

    if (me.time >= s.costAmenagerPotagerTemps && me.money >= costP_Or) {
        if (wantsPotager) {
            let pz = me.zones.find(z => !z.type && (z.num == 1 || z.num == 2) && (typeof isAdjacent === 'function' && (isAdjacent(me, z.id) || z.num == 1 || z.num == 2)));
            if (pz) { localSelectedId = pz.id; actT('POTAGER', pz.id); return; }
        }
        if (wantsVerger) {
            let vz = me.zones.find(z => !z.type && z.num >= 2 && z.num <= 5 && (typeof isAdjacent === 'function' && (isAdjacent(me, z.id) || z.num == 1 || z.num == 2)));
            if (vz) { localSelectedId = vz.id; actT('VERGER', vz.id); return; }
        }
    }

    // --- PRIORITÉ 7 : AMÉLIORATIONS ---
    if (me.money >= 5 && me.time >= 4) {
        for(let i=0; i<8; i++) {
            let costH = me.upgrades[i]===1 ? s.costUp2Temps : s.costUp3Temps; 
            let costM = me.upgrades[i]===1 ? s.costUp2Or : s.costUp3Or;
            let isUpLocked = (me.upgrades[i] === 2 && (!state.coop || !state.coop.unlocks || !state.coop.unlocks.upgrades3));
            
            if (me.upgrades[i] < 3 && me.time >= costH && me.money >= costM && !isUpLocked) {
                upgr(i); return;
            }
        }
    }

    // --- PRIORITÉ 8 : VENTE FOIRE (Si Main pleine) ---
    if (me.hand.length >= 4 && me.time >= 1) {
        actFoireStand(0);
        return;
    }

    // --- PRIORITÉ 9 : OBJECTIFS FOIRE ---
    let costCons = 2 + (state.foire.conseiller || 0);
    if (state.annee >= 2 && me.time >= costCons && state.decks.O && state.decks.O.length > 0) {
        me.time -= costCons;
        state.foire.conseiller = (state.foire.conseiller || 0) + 1;
        let obj = state.decks.O.splice(Math.floor(Math.random() * state.decks.O.length), 1)[0];
        if(!me.objectives) me.objectives=[];
        me.objectives.push(obj);
        addLog(`🤖 Le bot a récupéré l'Objectif : ${obj.nom}`, pId);
        sync();
        return;
    }

    // --- PRIORITÉ 10 : JARDINERIE (MARCHÉ) ---
    let redJ = me.upgrades[6] >= 2 ? 1 : 0;
    let costJ = Math.max(0, s.jardSlot3Temps - redJ);
    if (me.time >= costJ && me.hand.length < 4) {
        let affordableCards = [];
        ['C', 'S', 'A'].forEach(cat => {
            if(state.market[cat]) {
                state.market[cat].forEach(card => {
                    if(card && me.money >= card.p) affordableCards.push({c: card, cat: cat});
                });
            }
        });
        
        if (affordableCards.length > 0) {
            let pick = affordableCards[Math.floor(Math.random() * affordableCards.length)];
            me.time -= costJ;
            me.money -= pick.c.p;
            me.hand.push(pick.c);
            
            let idx = state.market[pick.cat].findIndex(c => c.nom === pick.c.nom);
            if(idx !== -1) state.market[pick.cat].splice(idx, 1);
            
            addLog(`🤖 Le bot achète ${pick.c.nom}.`, pId);
            
            let maxCards = (state.coop && state.coop.unlocks && state.coop.unlocks.market3) ? 3 : 2;
            while(state.market[pick.cat].length < maxCards && state.decks[pick.cat].length > 0) { 
                state.market[pick.cat].push(state.decks[pick.cat].splice(Math.floor(Math.random()*state.decks[pick.cat].length), 1)[0]); 
            }
            sync();
            return;
        }
    }

    // --- PRIORITÉ 11 : FIN DE SAISON ---
    actFin();
}
