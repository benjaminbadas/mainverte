// ==========================================
// 🤖 MOTEUR D'IA ÉVOLUTIVE TOTALE (V20 - ADN Complet)
// ==========================================

let botEnabled = false;
let botTimeout = null;

// Le TOUT NOUVEL ADN (Chaque action a son propre gène)
let botDNA = {
    // 1. Terrain
    prioPotagerUrgence: 750, 
    prioVergerUrgence: 750,  
    prioExtraPotager: 300,   
    prioExtraVerger: 300,    
    prioNature: 350,         
    
    // 2. Bâtiments
    prioComposteur: 400,     
    prioSerre: 350,          
    prioLocalOutils: 320,    
    
    // 3. Culture
    prioPlanter: 700,        
    prioAmender: 450,        

    // 4. Marché / Jardinerie
    prioJardinerieUrgence: 650, 
    prioStockGraines: 300,      
    
    // 5. Améliorations (Base + Bonus par type)
    prioUpgradeBase: 380,    
    prioUpTerrain: 100,      
    prioUpEnergie: 90,       
    prioUpSavoir: 80,        
    prioUpSol: 110,          
    prioUpClimat: 50,        
    prioUpOutils: 70,        
    prioUpVente: 60,         
    prioUpVIP: 50            
};

const dbBrain = firebase.database().ref("bot-brain-v3");

dbBrain.once("value").then(snap => {
    if(snap.exists()) {
        let bestBrain = snap.val();
        botDNA = mutateDNA(bestBrain.dna);
        console.log("🧠 Cerveau V3 chargé (Record: " + bestBrain.score + "💰). Nouvelle mutation générée.");
    }
});

function mutateDNA(parentDNA) {
    let newDNA = {};
    for (let gene in parentDNA) {
        let mutation = 1 + ((Math.random() * 0.2) - 0.1); // +/- 10%
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
    botTimeout = setTimeout(() => { botThinkAndAct(botId); }, 50); // HYPER TURBO
}

function botThinkAndAct(botId) {
    try {
        if(!state || state.turn !== botId) return;
        
        if(state.gameOver) {
            const finalScore = state['p'+botId].money;
            dbBrain.once("value").then(snap => {
                let currentBest = snap.exists() ? snap.val().score : -1;
                if(finalScore > currentBest) {
                    dbBrain.set({ score: finalScore, dna: botDNA });
                    console.log(`🏆 NOUVEAU RECORD IA ! ${finalScore}💰. ADN V3 Sauvegardé.`);
                } else {
                    console.log(`❌ Mutation rejetée. Score: ${finalScore}💰. Le record reste à ${currentBest}💰.`);
                }
            });
            botEnabled = false; 
            return;
        }
        
        const me = state['p'+botId];
        let bestAction = { type: 'FIN_TOUR', score: 10 };
        let curS = ALL_SEASONS[state.saisonIdx];
        const costT = me.upgrades[5] >= 2 ? (me.upgrades[5] === 3 ? 0 : 1) : 2;

        let hasEmptyPotager = false; let hasEmptyVerger = false; let hasEmptyNature = false;
        let nbPotagers = 0; let nbVergers = 0;
        let emptyZoneId = null; 
        let hasComposteur = me.zones.some(z => z.batiment === 'COMPOSTEUR');
        let nbPlantesEnCroissance = 0;

        // 1. ANALYSE DES ZONES & BÂTIMENTS
        me.zones.forEach(z => {
            if(z.culture) {
                nbPlantesEnCroissance++;
                // INSTINCTS DE SURVIE (Fixes)
                if(z.culture.eCur <= 0 && z.culture.sCur <= 0 && me.time >= 2) {
                    if(1000 > bestAction.score) bestAction = { type: 'RECOLTER', zoneId: z.id, score: 1000 };
                } else if(z.culture.eCur >= 2 && me.time >= 1) {
                    if(800 > bestAction.score) bestAction = { type: 'ARROSER', zoneId: z.id, score: 800 + z.culture.eCur };
                } 
                // AMENDEMENT (ADN)
                else if(hasComposteur && me.compost > 0 && me.time >= 1) {
                    if(botDNA.prioAmender > bestAction.score) bestAction = { type: 'AMENDER', zoneId: z.id, score: botDNA.prioAmender };
                }
            } else if (z.type && z.id !== 0) {
                if(z.type === 'POTAGER') { nbPotagers++; if(!z.culture) hasEmptyPotager = true; }
                if(z.type === 'VERGER') { nbVergers++; if(!z.culture) hasEmptyVerger = true; }
                if(z.type === 'AMÉNAGEMENT' && !z.batiment) hasEmptyNature = true;

                // PLANTER (ADN)
                (me.hand || []).forEach((c, idx) => {
                    const costH = Math.max(0, (c.t||1)-(me.upgrades[2]-1));
                    let smValid = z.batiment === 'SERRE' ? (c.sm||[]).map(s => ALL_SEASONS[(ALL_SEASONS.indexOf(s)+3)%4]).concat(c.sm||[]) : (c.sm||[]);
                    if((c.cat === 'L' && z.type === 'POTAGER') || (c.cat === 'A' && z.type === 'VERGER')) {
                        if(smValid.includes(curS) && me.time >= costH && !z.culture) {
                            if(botDNA.prioPlanter > bestAction.score) bestAction = { type: 'PLANTER', handIdx: idx, zoneId: z.id, score: botDNA.prioPlanter };
                        }
                    }
                });

                // BÂTIMENTS (ADN)
                if(!z.batiment && z.type === 'AMÉNAGEMENT' && !hasComposteur && me.money >= 4 && me.time >= 4) {
                    if(botDNA.prioComposteur > bestAction.score) bestAction = { type: 'BATIMENT', zoneId: z.id, batiment: 'COMPOSTEUR', score: botDNA.prioComposteur };
                }
                if(!z.batiment && z.type === 'AMÉNAGEMENT' && me.money >= 5 && me.time >= 4) {
                    if(botDNA.prioLocalOutils > bestAction.score) bestAction = { type: 'BATIMENT', zoneId: z.id, batiment: 'LOCAL OUTILS', score: botDNA.prioLocalOutils };
                }
                if(!z.batiment && z.type === 'POTAGER' && me.money >= 3 && me.time >= 4) {
                    if(botDNA.prioSerre > bestAction.score) bestAction = { type: 'BATIMENT', zoneId: z.id, batiment: 'SERRE', score: botDNA.prioSerre };
                }

            } else if (!z.type && z.id !== 0 && z.id <= (me.upgrades[0] === 1 ? 3 : (me.upgrades[0] === 2 ? 4 : 5))) { 
                emptyZoneId = z.id; 
            }
        });

        // 2. GESTION DU TERRAIN (ADN)
        if(emptyZoneId && me.time >= 3 && me.money >= costT) {
            let needsPotager = (me.hand||[]).some(c => c.cat === 'L' && (c.sm||[]).includes(curS));
            let needsVerger = (me.hand||[]).some(c => c.cat === 'A' && (c.sm||[]).includes(curS));
            
            if(needsPotager && nbPotagers === 0 && botDNA.prioPotagerUrgence > bestAction.score) {
                bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'POTAGER', score: botDNA.prioPotagerUrgence };
            } else if(needsVerger && nbVergers === 0 && botDNA.prioVergerUrgence > bestAction.score) {
                bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'VERGER', score: botDNA.prioVergerUrgence };
            } else if(needsPotager && !hasEmptyPotager && botDNA.prioExtraPotager > bestAction.score) {
                bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'POTAGER', score: botDNA.prioExtraPotager };
            } else if(needsVerger && !hasEmptyVerger && botDNA.prioExtraVerger > bestAction.score) {
                bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'VERGER', score: botDNA.prioExtraVerger };
            } else if(!hasComposteur && !hasEmptyNature && me.money >= (costT + 4) && botDNA.prioNature > bestAction.score) {
                bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'AMÉNAGEMENT', score: botDNA.prioNature };
            }
        }

        // 3. UPGRADES (ADN Spécifique)
        let redJ = me.upgrades[6] >= 2 ? 1 : 0;
        let costJard = Math.max(0, 3 - redJ); 
        
        let upDnaScores = [ botDNA.prioUpTerrain, botDNA.prioUpEnergie, botDNA.prioUpSavoir, botDNA.prioUpSol, botDNA.prioUpClimat, botDNA.prioUpOutils, botDNA.prioUpVente, botDNA.prioUpVIP ];

        UP_NAMES.forEach((n, i) => {
            const costUpH = me.upgrades[i] === 1 ? 3 : 5;
            const costUpM = me.upgrades[i] === 1 ? 2 : 4; 
            let safeBudget = 2 + (nbPotagers === 0 && nbVergers === 0 ? costT : 0);

            if(me.upgrades[i] < 3 && me.time >= costUpH && (me.money - safeBudget) >= costUpM && state.annee < 3) {
                let prio = botDNA.prioUpgradeBase + upDnaScores[i];
                if(prio > bestAction.score) bestAction = { type: 'UPGRADE', upIdx: i, score: prio };
            }
        });

        // 4. JARDINERIE (ADN)
        let plantableCards = (me.hand||[]).filter(c => (c.cat === 'L' || c.cat === 'A') && (c.sm||[]).includes(curS)).length;
        if(me.time >= costJard && me.money >= 1) {
            let maxPrice = me.money;
            if (nbPotagers === 0 && nbVergers === 0) maxPrice = me.money - costT; 
            let cartesAchetables = (state.market['C'] || []).filter(c => c.p <= maxPrice);
            
            if(cartesAchetables.length > 0) {
                let bestCard = cartesAchetables.sort((a,b) => (b.g - b.p) - (a.g - a.p))[0];
                
                if((me.hand || []).length === 0 && nbPlantesEnCroissance === 0 && botDNA.prioJardinerieUrgence > bestAction.score) {
                    bestAction = { type: 'JARDINERIE', cardTarget: bestCard, score: botDNA.prioJardinerieUrgence };
                } 
                else if (plantableCards === 0 && botDNA.prioStockGraines > bestAction.score) {
                    bestAction = { type: 'JARDINERIE', cardTarget: bestCard, score: botDNA.prioStockGraines };
                }
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
            me.money -= (bestAction.batiment === 'LOCAL OUTILS' ? 5 : (bestAction.batiment === 'COMPOSTEUR' ? 4 : 3)); 
            me.time -= 4; 
            me.zones[bestAction.zoneId].batiment = bestAction.batiment; 
            addLog(`🤖 Bâtiment ${bestAction.batiment} construit sur Zone ${bestAction.zoneId}.`, botId);
            sync();
        }
        else if(bestAction.type === 'JARDINERIE') {
            me.time -= costJard; 
            let c = (state.market['C'] || []).find(mc => mc.nom === bestAction.cardTarget.nom);
            if(c) {
                me.money -= c.p; 
                if(!me.hand) me.hand = []; 
                me.hand.push(c);
                state.market['C'] = (state.market['C'] || []).filter(mc => mc.nom !== c.nom);
                if(!state.market['C']) state.market['C'] = [];
                while(state.market['C'].length < 2) { 
                    let nv = draw('C'); 
                    if(nv) state.market['C'].push(nv); 
                    else break; 
                }
                addLog(`🤖 Achat au Marché : ${c.nom} (-${c.p}💰).`, botId);
                sync();
            } else { actFin(); }
        }
        else { actFin(); }

    } catch (e) { console.error("Détail de l'erreur IA:", e); botEnabled = false; }
}
