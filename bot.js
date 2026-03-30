let hasEmptyPotager = false;
    let hasEmptyVerger = false;
    let hasEmptyNature = false;
    let emptyZoneId = null;
    let hasComposteur = me.zones.some(z => z.batiment === 'COMPOSTEUR');

    // 1. ANALYSE DES ZONES
    me.zones.forEach(z => {
        if(z.culture) {
            if(z.culture.eCur <= 0 && z.culture.sCur <= 0 && me.time >= 2) {
                if(1000 > bestAction.score) bestAction = { type: 'RECOLTER', zoneId: z.id, score: 1000 };
            } 
            else if(z.culture.eCur >= 2 && me.time >= 1) {
                if(800 > bestAction.score) bestAction = { type: 'ARROSER', zoneId: z.id, score: 800 + z.culture.eCur };
            }
            else if(hasComposteur && me.compost > 0 && me.time >= 1) {
                if(450 > bestAction.score) bestAction = { type: 'AMENDER', zoneId: z.id, score: 450 };
            }
        } else if (z.type && z.id !== 0) {
            if(z.type === 'POTAGER') hasEmptyPotager = true;
            if(z.type === 'VERGER') hasEmptyVerger = true;
            if(z.type === 'AMÉNAGEMENT' && !z.batiment) hasEmptyNature = true; // Détecte la zone Nature dispo

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

            // Le Bot construit le Composteur UNIQUEMENT sur une zone Nature (Aménagement)
            if(!z.batiment && z.type === 'AMÉNAGEMENT' && !hasComposteur && me.money >= 4 && me.time >= 4) {
                if(550 > bestAction.score) bestAction = { type: 'BATIMENT', zoneId: z.id, batiment: 'COMPOSTEUR', score: 550 };
            }

        } else if (!z.type && z.id !== 0 && z.id <= (me.upgrades[0] === 1 ? 3 : (me.upgrades[0] === 2 ? 4 : 5))) {
            emptyZoneId = z.id;
        }
    });

    // 2. PRÉPARATION DU TERRAIN
    if(emptyZoneId && me.time >= 3 && me.money >= costT) {
        let needsPotager = (me.hand||[]).some(c => c.cat === 'L' && (c.sm||[]).includes(curS));
        let needsVerger = (me.hand||[]).some(c => c.cat === 'A' && (c.sm||[]).includes(curS));
        
        // Nouvelle intelligence : Il prépare une zone Nature s'il veut un Composteur et qu'il a assez d'argent
        if(!hasComposteur && !hasEmptyNature && me.money >= (costT + 4) && 550 > bestAction.score) {
            bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'AMÉNAGEMENT', score: 550 };
        } else if(needsPotager && !hasEmptyPotager && 500 > bestAction.score) {
            bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'POTAGER', score: 500 };
        } else if(needsVerger && !hasEmptyVerger && 500 > bestAction.score) {
            bestAction = { type: 'AMENAGER', zoneId: emptyZoneId, terrain: 'VERGER', score: 500 };
        }
    }
