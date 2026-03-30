// ==========================================
// 🤖 MOTEUR D'INTELLIGENCE ARTIFICIELLE (BOT)
// ==========================================

let botEnabled = false;
let botTimeout = null;

function toggleBot() {
    botEnabled = !botEnabled;
    const btn = document.getElementById('bot-btn');
    if(btn) {
        btn.innerText = botEnabled ? "🤖 Mon Bot: ON" : "🤖 Mon Bot: OFF";
        btn.style.background = botEnabled ? "#4caf50" : "#9c27b0";
    }
    
    if(botEnabled) addLog("🤖 Assistant IA activé pour vous.", myId);
    else addLog("🤖 Mode manuel repris.", myId);
    
    // Relance immédiate si c'est mon tour
    if(botEnabled && state && state.turn === myId && !state.gameOver) triggerBot(myId);
}

function triggerBot(botId) {
    if(botTimeout) clearTimeout(botTimeout);
    botTimeout = setTimeout(() => { botThinkAndAct(botId); }, 1200); // 1.2s de réflexion
}

function botThinkAndAct(botId) {
    if(!state || state.turn !== botId || state.gameOver) return;
    
    const me = state['p'+botId];
    let bestAction = { type: 'FIN_TOUR', score: 10 };
    
    let curS = ALL_SEASONS[state.saisonIdx];
    const costT = me.upgrades[5] >= 2 ? (me.upgrades[5] === 3 ? 0 : 1) : 2;

    let hasEmptyPotager = false;
    let hasEmptyVerger = false;
    let emptyZoneId = null;

    // 1. ANALYSE DES ZONES
    me.zones.forEach(z => {
        if(z.culture) {
            if(z.culture.eCur <= 0 && z.culture.sCur <= 0 && me.time >= 2) {
                if(1000 > bestAction.score) bestAction = { type: 'RECOLTER', zoneId: z.id, score: 1000 };
            } else if(z.culture.eCur >= 2 && me.time >= 1) {
                if(800 > bestAction.score) bestAction = { type: 'ARROSER', zoneId: z.id, score: 800 + z.culture.eCur };
            }
        } else if (z.type && z.id !== 0) {
            if(z.type === 'POTAGER') hasEmptyPotager = true;
            if(z.type === 'VERGER') hasEmptyVerger = true;

            (me.hand || []).forEach((c, idx) => {
                const costH = Math.max(0, (c.t||1)-(me.upgrades[2]-1));
                let smValid = z.batiment === 'SERRE' ? (c.sm||[]).map(s => ALL_SEASONS[(ALL_SEASONS.indexOf(s)+3)%4]).concat(c.sm||[]) : (c.sm||[]);
                
                if((c.cat === 'L' && z.type === 'POTAGER') || (c.cat === 'A' && z.type === 'VERGER')) {
                    if(smValid.includes(curS) && me.time >= costH) {
                        let score = 600 + (c.g || 0); 
                        if(score > bestAction.score) bestAction = { type: 'PLANTER', handIdx: idx, zoneId: z.id, score: score };
                    }
                }
            });
        } else if (!z.type && z.id !== 0 && z.id <= (me.upgrades[0] === 1 ? 3 : (me.upgrades[0] === 2 ? 4 : 5))) {
            emptyZoneId = z.id;
        }
    });

    // 2. PRÉPARATION DU TERRAIN
    if(emptyZoneId && me.time >= 3 && me.money >= costT) {
        let needsPotager = (me.hand||[]).some(c => c.cat === 'L' && (c.sm||[]).includes(curS));
        let needsVerger = (me.hand||[]).some(c => c.cat === 'A' && (c.sm||[]).includes(curS));
        
        if(needsPotager && !hasEmptyPotager && 500 > bestAction.score) {
            bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'POTAGER', score: 500 };
        } else if(needsVerger && !hasEmptyVerger && 500 > bestAction.score) {
            bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'VERGER', score: 500 };
        } else if(!hasEmptyPotager && bestAction.type === 'FIN_TOUR' && 200 > bestAction.score) {
            bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'POTAGER', score: 200 };
        }
    }

    // 3. ACHAT D'AMÉLIORATIONS
    let redJ = me.upgrades[6] >= 2 ? 1 : 0;
    let costJard = Math.max(0, 3 - redJ); 

    UP_NAMES.forEach((n, i) => {
        const costUp = me.upgrades[i] === 1 ? 3 : 5;
        if(me.upgrades[i] < 3 && me.time >= costUp && me.time > costJard) {
            let prio = 300 + (10 - i*10); 
            if(i===0) prio += 50; 
            if(prio > bestAction.score) bestAction = { type: 'UPGRADE', upIdx: i, score: prio };
        }
    });

    // 4. ACHETER DES CARTES
    let plantableCards = (me.hand||[]).filter(c => (c.cat === 'L' || c.cat === 'A') && (c.sm||[]).includes(curS)).length;
    if(plantableCards === 0 && me.time >= costJard && me.money >= 1) {
        let cartesAchetables = (state.market['C'] || []).filter(c => c.p <= me.money);
        if(cartesAchetables.length > 0) {
            let bestCard = cartesAchetables.sort((a,b) => (b.g - b.p) - (a.g - a.p))[0];
            if(400 > bestAction.score) bestAction = { type: 'JARDINERIE', cardTarget: bestCard, score: 400 };
        }
    }

    // --- EXECUTION DE L'ACTION ---
    if(bestAction.type === 'RECOLTER') {
        actionRecolter(bestAction.zoneId);
    }
    else if(bestAction.type === 'ARROSER') {
        actArr(bestAction.zoneId);
    }
    else if(bestAction.type === 'AMENAGER') {
        actT(bestAction.terrain, bestAction.zoneId);
    }
    else if(bestAction.type === 'PLANTER') {
        playC(bestAction.handIdx, bestAction.zoneId);
    }
    else if(bestAction.type === 'UPGRADE') {
        upgr(bestAction.upIdx);
    }
    else if(bestAction.type === 'JARDINERIE') {
        me.time -= costJard;
        let c = state.market['C'].find(mc => mc.nom === bestAction.cardTarget.nom);
        if(c) {
            me.money -= c.p;
            if(!me.hand) me.hand = [];
            me.hand.push(c);
            state.market['C'] = state.market['C'].filter(mc => mc.nom !== c.nom);
            addLog(`🤖 Achat Marché : ${c.nom}`, botId);
            while(state.market['C'].length < 2) { let nv = draw('C'); if(nv) state.market['C'].push(nv); else break; }
            sync();
        } else {
            actFin();
        }
    }
    else {
        addLog("🤖 Fin de tour stratégique.", botId);
        actFin();
    }
}
