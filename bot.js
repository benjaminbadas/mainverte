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
    
    // Le bot ne joue que si c'est une IA, sauf si on force (Mode Champion)
    let isIA = false;
    if (state.mode === 'IA_SOLO' || state.mode === 'IA_VS_IA') isIA = true;
    if (state.mode === 'VS_IA' && pId === 2) isIA = true;

    if (!force && !isIA) return;

    isBotThinking = true;
    setTimeout(() => {
        executeBestAction(pId);
        isBotThinking = false;
    }, botDelay);
}

function executeBestAction(pId) {
    const me = state['p' + pId];
    const s = state.settings;

    // --- PRIORITÉ 1 : RÉCOLTER ---
    // Le bot vérifie tous ses slots de culture pour voir si l'un d'eux est prêt (Eau = 0, Soleil = 0)
    for (let i = 0; i < me.zones.length; i++) {
        let z = me.zones[i];
        if (z && z.slots) {
            for (let j = 0; j < z.slots.length; j++) {
                let c = z.slots[j];
                if (c.eCur <= 0 && c.sCur <= 0 && me.time >= s.costRecolterTemps) {
                    localSelectedId = z.id; // Le bot "clique" virtuellement sur la zone
                    actionRecolter(z.id, j);
                    return;
                }
            }
        }
    }

    // --- PRIORITÉ 2 : JOUER UN OUTIL / AUXILIAIRE ---
    // Les cartes "X" ne nécessitent pas de zone ciblée
    for (let i = 0; i < me.hand.length; i++) {
        let c = me.hand[i];
        let cost = Math.max(0, (c.t || 1) - (me.upgrades[2] - 1));
        if (me.time >= cost && c.cat === 'X') {
            playC(i, null);
            return;
        }
    }

    // --- PRIORITÉ 3 : ARROSER ---
    // Si le bot a du temps et qu'une plante a soif
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

    // --- PRIORITÉ 4 : PLANTER UN LÉGUME / ARBRE ---
    for (let i = 0; i < me.hand.length; i++) {
        let c = me.hand[i];
        let cost = Math.max(0, (c.t || 1) - (me.upgrades[2] - 1));
        if (me.time < cost) continue;

        if (c.cat === 'L' || c.cat === 'A') {
            let isPetitFruit = ["Fraise", "Melon", "Pastèque"].some(pf => c.nom.includes(pf));
            let isGrimpante = ["Haricot", "Pois", "Concombre", "Cornichon", "Chayotte", "Vigne"].some(g => c.nom.includes(g));
            let hasTuteur = (me.auxActifs || []).some(a => a.includes("Tuteur") || a.includes("Treillage"));
            let curS = ["P","E","A","H"][state.saisonIdx];

            // Le bot cherche une zone valide pour planter
            for (let j = 0; j < me.zones.length; j++) {
                let z = me.zones[j];
                if (!z.type) continue; // Si la zone est vide, on passe
                
                let smValid = z.batiment === 'SERRE' ? (c.sm||[]).map(se => ["P","E","A","H"][(["P","E","A","H"].indexOf(se)+3)%4]).concat(c.sm||[]) : (c.sm||[]);
                if(!smValid.includes(curS)) continue; // Mauvaise saison

                if (c.cat === 'L' && z.type !== 'POTAGER' && !(z.type === 'VERGER' && isPetitFruit)) continue; // Légume hors potager
                if (c.cat === 'A' && z.type !== 'VERGER') continue; // Arbre hors verger

                let maxSlots = z.type === 'POTAGER' ? 2 : 1;
                let occupied = 0;
                (z.slots || []).forEach(pl => {
                    if (!(["Haricot", "Pois", "Concombre", "Cornichon", "Chayotte", "Vigne"].some(g => pl.nom.includes(g)) && hasTuteur)) occupied++;
                });

                if (!(isGrimpante && hasTuteur) && occupied >= maxSlots) continue; // Zone pleine

                // Si toutes les conditions sont remplies, le bot plante !
                localSelectedId = z.id;
                playC(i, z.id);
                return;
            }
        }
    }

    // --- PRIORITÉ 5 : AMÉNAGER UN TERRAIN ---
    // Si le bot a des plantes dans sa main mais pas de place sur le terrain, il aménage.
    let hasPlants = me.hand.some(c => c.cat === 'L' || c.cat === 'A');
    let costP_Or = Math.max(0, s.costAmenagerPotagerOr - (me.upgrades[5] >= 2 ? (me.upgrades[5] === 3 ? 2 : 1) : 0));
    
    if (hasPlants && me.time >= s.costAmenagerPotagerTemps && me.money >= costP_Or) {
        // Il cherche une zone vide adjacente (en utilisant ta fonction globale)
        let emptyAdj = me.zones.find(z => !z.type && typeof isAdjacent === 'function' && (isAdjacent(me, z.id) || z.num == 1 || z.num == 2));
        
        if (emptyAdj) {
            let num = parseInt(emptyAdj.num);
            localSelectedId = emptyAdj.id;
            
            // Le bot déduit logiquement s'il doit faire un Potager (1,2) ou un Verger
            if (num === 1 || num === 2) {
                actT('POTAGER', emptyAdj.id);
                return;
            } else if (num >= 3 && num <= 5) {
                actT('VERGER', emptyAdj.id);
                return;
            }
        }
    }

    // --- PRIORITÉ 6 : AMÉLIORER SON EXPLOITATION (UPGRADES) ---
    // Si le bot a de l'argent en trop, il améliore son matériel
    if (me.money >= 5 && me.time >= 4) {
        for(let i=0; i<8; i++) {
            let costH = me.upgrades[i]===1 ? s.costUp2Temps : s.costUp3Temps; 
            let costM = me.upgrades[i]===1 ? s.costUp2Or : s.costUp3Or;
            let isUpLocked = (me.upgrades[i] === 2 && (!state.coop || !state.coop.unlocks || !state.coop.unlocks.upgrades3));
            
            if (me.upgrades[i] < 3 && me.time >= costH && me.money >= costM && !isUpLocked) {
                upgr(i);
                return;
            }
        }
    }

    // --- PRIORITÉ 7 : FOIRE (ALLER CHERCHER DES OBJECTIFS) ---
    // À partir de l'année 2, le bot essaie d'accumuler des PV bonus.
    let costCons = 2 + (state.foire.conseiller || 0);
    if (state.annee >= 2 && me.time >= costCons && state.decks.O && state.decks.O.length > 0) {
        me.time -= costCons;
        state.foire.conseiller = (state.foire.conseiller || 0) + 1;
        
        // Le bot simule l'action (sans déclencher de popup à l'écran)
        let obj = state.decks.O.splice(Math.floor(Math.random() * state.decks.O.length), 1)[0];
        if(!me.objectives) me.objectives=[];
        me.objectives.push(obj);
        
        addLog(`🤖 Le bot a récupéré l'Objectif : ${obj.nom}`, pId);
        sync();
        return;
    }

    // --- PRIORITÉ 8 : JARDINERIE (MARCHÉ) ---
    // Si le bot n'a rien à faire et qu'il lui manque des cartes, il achète au marché
    let redJ = me.upgrades[6] >= 2 ? 1 : 0;
    let costJ = Math.max(0, s.jardSlot3Temps - redJ);
    
    if (me.time >= costJ && me.money >= 3 && me.hand.length < 4) {
        let cat = ['C', 'S', 'A'][Math.floor(Math.random() * 3)];
        if (state.market[cat] && state.market[cat].length > 0) {
            let card = state.market[cat][0]; // Prend la 1ère carte disponible
            if (me.money >= card.p) {
                me.time -= costJ;
                me.money -= card.p;
                me.hand.push(card);
                state.market[cat].splice(0, 1);
                addLog(`🤖 Le bot achète ${card.nom} au marché.`, pId);
                
                // Remplissage automatique pour le prochain joueur
                let maxCards = (state.coop && state.coop.unlocks && state.coop.unlocks.market3) ? 3 : 2;
                while(state.market[cat].length < maxCards && state.decks[cat].length > 0) { 
                    state.market[cat].push(state.decks[cat].splice(Math.floor(Math.random()*state.decks[cat].length), 1)[0]); 
                }
                sync();
                return;
            }
        }
    }

    // --- PRIORITÉ 9 : FIN DE SAISON ---
    // Si absolument aucune action ci-dessus n'est faisable, le bot termine son tour.
    actFin();
}
