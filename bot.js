// ==========================================
// 🤖 MOTEUR D'IA ÉVOLUTIVE (Algorithme Génétique)
// ==========================================

let botEnabled = false;
let botTimeout = null;

// L'ADN de base du Bot (ses "poids" de décision)
let botDNA = {
    prioPotager: 700,
    prioVerger: 700,
    prioNature: 350,
    prioComposteur: 400,
    prioUpgradeBase: 380,
    prioJardinerie: 400,
    prioSol: 110,     // Bonus de priorité pour l'upgrade Sol
    prioTerrain: 100, // Bonus de priorité pour l'upgrade Terrain
    prioEnergie: 90   // Bonus de priorité pour l'upgrade Energie
};

// Connexion à la base de données du Cerveau
const dbBrain = firebase.database().ref("bot-brain-v1");

// Charger le meilleur cerveau existant avant de jouer
dbBrain.once("value").then(snap => {
    if(snap.exists()) {
        let bestBrain = snap.val();
        // On charge le meilleur ADN et on le "mute" légèrement (variation de -10% à +10%)
        botDNA = mutateDNA(bestBrain.dna);
        console.log("🧠 Meilleur cerveau chargé (Record: " + bestBrain.score + "💰). Nouvelle mutation générée.");
    }
});

function mutateDNA(parentDNA) {
    let newDNA = {};
    for (let gene in parentDNA) {
        // Aléatoire entre -10% et +10%
        let mutation = 1 + ((Math.random() * 0.2) - 0.1); 
        newDNA[gene] = Math.round(parentDNA[gene] * mutation);
    }
    return newDNA;
}

function toggleBot() {
    botEnabled = !botEnabled;
    const btn = document.getElementById('bot-btn');
    if(btn) {
        btn.innerText = botEnabled ? "🤖 Bot Évolutif: ON" : "🤖 Bot: OFF";
        btn.style.background = botEnabled ? "#4caf50" : "#9c27b0";
    }
    if(botEnabled && state && state.turn === myId && !state.gameOver) triggerBot(myId);
}

function triggerBot(botId) {
    if(botTimeout) clearTimeout(botTimeout);
    botTimeout = setTimeout(() => { botThinkAndAct(botId); }, 50); // Mode HYPER TURBO pour apprendre vite
}

function botThinkAndAct(botId) {
    try {
        if(!state || state.turn !== botId) return;
        
        // --- SAUVEGARDE DE L'APPRENTISSAGE À LA FIN DE LA PARTIE ---
        if(state.gameOver) {
            const finalScore = state['p'+botId].money;
            dbBrain.once("value").then(snap => {
                let currentBest = snap.exists() ? snap.val().score : -1;
                // Si le bot a battu son propre record, il sauvegarde cet ADN comme étant le nouveau "Standard" !
                if(finalScore > currentBest) {
                    dbBrain.set({ score: finalScore, dna: botDNA });
                    console.log(`🏆 NOUVEAU RECORD IA ! ${finalScore}💰. ADN Sauvegardé.`);
                } else {
                    console.log(`❌ Échec de la mutation. Score: ${finalScore}💰. Record à battre: ${currentBest}💰.`);
                }
            });
            botEnabled = false; // On l'arrête pour relancer une partie
            return;
        }
        
        const me = state['p'+botId];
        let bestAction = { type: 'FIN_TOUR', score: 10 };
        let curS = ALL_SEASONS[state.saisonIdx];
        const costT = me.upgrades[5] >= 2 ? (me.upgrades[5] === 3 ? 0 : 1) : 2;

        let hasEmptyPotager = false; let hasEmptyVerger = false; let hasEmptyNature = false;
        let emptyZoneId = null; let hasComposteur = me.zones.some(z => z.batiment === 'COMPOSTEUR');

        // 1. ZONES (La récolte et l'arrosage sont des réflexes vitaux, on ne les mute pas)
        me.zones.forEach(z => {
            if(z.culture) {
                if(z.culture.eCur <= 0 && z.culture.sCur <= 0 && me.time >= 2) {
                    if(1000 > bestAction.score) bestAction = { type: 'RECOLTER', zoneId: z.id, score: 1000 };
                } else if(z.culture.eCur >= 2 && me.time >= 1) {
                    if(800 > bestAction.score) bestAction = { type: 'ARROSER', zoneId: z.id, score: 800 + z.culture.eCur };
                } else if(hasComposteur && me.compost > 0 && me.time >= 1) {
                    if(450 > bestAction.score) bestAction = { type: 'AMENDER', zoneId: z.id, score: 450 };
                }
            } else if (z.type && z.id !== 0) {
                if(z.type === 'POTAGER' && !z.culture) hasEmptyPotager = true;
                if(z.type === 'VERGER' && !z.culture) hasEmptyVerger = true;
                if(z.type === 'AMÉNAGEMENT' && !z.batiment) hasEmptyNature = true;

                (me.hand || []).forEach((c, idx) => {
                    const costH = Math.max(0, (c.t||1)-(me.upgrades[2]-1));
                    let smValid = z.batiment === 'SERRE' ? (c.sm||[]).map(s => ALL_SEASONS[(ALL_SEASONS.indexOf(s)+3)%4]).concat(c.sm||[]) : (c.sm||[]);
                    if((c.cat === 'L' && z.type === 'POTAGER') || (c.cat === 'A' && z.type === 'VERGER')) {
                        if(smValid.includes(curS) && me.time >= costH && !z.culture) {
                            let score = 600 + (c.g || 0); 
                            if(score > bestAction.score) bestAction = { type: 'PLANTER', handIdx: idx, zoneId: z.id, score: score };
                        }
                    }
                });

                if(!z.batiment && z.type === 'AMÉNAGEMENT' && !hasComposteur && me.money >= 4 && me.time >= 4) {
                    if(botDNA.prioComposteur > bestAction.score) bestAction = { type: 'BATIMENT', zoneId: z.id, batiment: 'COMPOSTEUR', score: botDNA.prioComposteur };
                }
            } else if (!z.type && z.id !== 0 && z.id <= (me.upgrades[0] === 1 ? 3 : (me.upgrades[0] === 2 ? 4 : 5))) { emptyZoneId = z.id; }
        });

        // 2. PRÉPARATION DU TERRAIN (Utilise l'ADN)
        if(emptyZoneId && me.time >= 3 && me.money >= costT) {
            let needsPotager = (me.hand||[]).some(c => c.cat === 'L' && (c.sm||[]).includes(curS));
            let needsVerger = (me.hand||[]).some(c => c.cat === 'A' && (c.sm||[]).includes(curS));
            
            if(needsPotager && !hasEmptyPotager && botDNA.prioPotager > bestAction.score) {
                bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'POTAGER', score: botDNA.prioPotager };
            } else if(needsVerger && !hasEmptyVerger && botDNA.prioVerger > bestAction.score) {
                bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'VERGER', score: botDNA.prioVerger };
            } else if(!hasComposteur && !hasEmptyNature && me.money >= (costT * 2 + 4) && botDNA.prioNature > bestAction.score) {
                bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'AMÉNAGEMENT', score: botDNA.prioNature };
            }
        }

        // 3. UPGRADES (Utilise l'ADN)
        let redJ = me.upgrades[6] >= 2 ? 1 : 0;
        let costJard = Math.max(0, 3 - redJ); 
        UP_NAMES.forEach((n, i) => {
            const costUpH = me.upgrades[i] === 1 ? 3 : 5;
            const costUpM = me.upgrades[i] === 1 ? 2 : 4; 
            let safeBudget = 2 + (!hasEmptyPotager && !hasEmptyVerger ? costT : 0);

            if(me.upgrades[i] < 3 && me.time >= costUpH && (me.money - safeBudget) >= costUpM && state.annee < 3) {
                let prio = botDNA.prioUpgradeBase; 
                if(n === "Sol") prio += botDNA.prioSol;
                if(n === "Terrain") prio += botDNA.prioTerrain;
                if(n === "Énergie") prio += botDNA.prioEnergie;

                if(prio > bestAction.score) bestAction = { type: 'UPGRADE', upIdx: i, score: prio };
            }
        });

        // 4. JARDINERIE (Utilise l'ADN)
        let plantableCards = (me.hand||[]).filter(c => (c.cat === 'L' || c.cat === 'A') && (c.sm||[]).includes(curS)).length;
        if(plantableCards === 0 && me.time >= costJard && me.money >= 1) {
            let maxPrice = me.money;
            if (!hasEmptyPotager && !hasEmptyVerger) maxPrice = me.money - costT; 
            let cartesAchetables = (state.market['C'] || []).filter(c => c.p <= maxPrice);
            if(cartesAchetables.length > 0) {
                let bestCard = cartesAchetables.sort((a,b) => (b.g - b.p) - (a.g - a.p))[0];
                if(botDNA.prioJardinerie > bestAction.score) bestAction = { type: 'JARDINERIE', cardTarget: bestCard, score: botDNA.prioJardinerie };
            }
        }

        // --- EXECUTION DE L'ACTION ---
        if(bestAction.type === 'RECOLTER') { actionRecolter(bestAction.zoneId); }
        else if(bestAction.type === 'ARROSER') { actArr(bestAction.zoneId); }
        else if(bestAction.type === 'AMENDER') { actAmd(bestAction.zoneId); }
        else if(bestAction.type === 'AMENAGER') { actT(bestAction.terrain, bestAction.zoneId); }
        else if(bestAction.type === 'PLANTER') { playC(bestAction.handIdx, bestAction.zoneId); }
        else if(bestAction.type === 'UPGRADE') { upgr(bestAction.upIdx); }
        else if(bestAction.type === 'BATIMENT') {
            me.money -= 4; me.time -= 4; me.zones[bestAction.zoneId].batiment = 'COMPOSTEUR'; sync();
        }
        else if(bestAction.type === 'JARDINERIE') {
            me.time -= costJard; let c = state.market['C'].find(mc => mc.nom === bestAction.cardTarget.nom);
            if(c) {
                me.money -= c.p; if(!me.hand) me.hand = []; me.hand.push(c);
                state.market['C'] = state.market['C'].filter(mc => mc.nom !== c.nom);
                while(state.market['C'].length < 2) { let nv = draw('C'); if(nv) state.market['C'].push(nv); else break; }
                sync();
            } else { actFin(); }
        }
        else { actFin(); }

    } catch (e) {
        console.error(e); botEnabled = false; 
    }
}
