// ==========================================
// 🤖 MOTEUR D'IA ÉVOLUTIVE (V22 - Mode Champion)
// ==========================================

let botEnabled = false;
let autoTrainEnabled = false;
let isChampionMode = false; // Le nouveau mode Démonstration
let botTimeout = null;

let botDNA = {
    prioPotagerUrgence: 750, prioVergerUrgence: 750, prioExtraPotager: 300, prioExtraVerger: 300, prioNature: 350,         
    prioComposteur: 400, prioSerre: 350, prioLocalOutils: 320,    
    prioPlanter: 700, prioAmender: 450,        
    prioJardinerieUrgence: 650, prioStockGraines: 300,      
    prioUpgradeBase: 380, prioUpTerrain: 100, prioUpEnergie: 90, prioUpSavoir: 80, prioUpSol: 110, prioUpClimat: 50, prioUpOutils: 70, prioUpVente: 60, prioUpVIP: 50            
};

const dbBrain = firebase.database().ref("bot-brain-v3");

dbBrain.once("value").then(snap => {
    if(snap.exists()) {
        botDNA = mutateDNA(snap.val().dna);
        console.log("🧠 Cerveau chargé (Record: " + snap.val().score + "💰). Nouvelle mutation générée.");
    }
});

function mutateDNA(parentDNA) {
    let newDNA = {};
    for (let gene in parentDNA) {
        let mutation = 1 + ((Math.random() * 0.2) - 0.1); 
        newDNA[gene] = Math.round(parentDNA[gene] * mutation);
    }
    return newDNA;
}

function toggleBot() {
    botEnabled = !botEnabled;
    isChampionMode = false; // Désactive le mode champion si on clique ici
    const btn = document.getElementById('bot-btn');
    if(btn) {
        btn.innerText = botEnabled ? "🤖 Bot: ON" : "🤖 Bot: OFF";
        btn.style.background = botEnabled ? "#4caf50" : "#9c27b0";
    }
    if(botEnabled && state && state.turn === myId && !state.gameOver) triggerBot(myId);
}

function toggleAutoTrain() {
    autoTrainEnabled = !autoTrainEnabled;
    isChampionMode = false; // Priorité à l'entraînement
    const btnTrain = document.getElementById('auto-train-btn');
    
    if(autoTrainEnabled) {
        if(btnTrain) { btnTrain.innerText = "🧬 Auto-Train: ON"; btnTrain.style.background = "#ff9800"; }
        if(!botEnabled) toggleBot(); 
    } else {
        if(btnTrain) { btnTrain.innerText = "🧬 Auto-Train: OFF"; btnTrain.style.background = "#009688"; }
    }
}

// NOUVELLE FONCTION : Lancer la démonstration du Champion !
function playChampion() {
    autoTrainEnabled = false; 
    isChampionMode = true;
    botEnabled = true;
    
    let btnTrain = document.getElementById('auto-train-btn');
    if(btnTrain) { btnTrain.innerText = "🧬 Auto-Train: OFF"; btnTrain.style.background = "#009688"; }
    
    let btnChamp = document.getElementById('champion-btn');
    if(btnChamp) { btnChamp.innerText = "🏆 Champion: ON"; btnChamp.style.background = "#f57f17"; }

    // On télécharge l'ADN exact sans le muter !
    dbBrain.once("value").then(snap => {
        if(snap.exists()) {
            botDNA = snap.val().dna; // Pas de fonction mutateDNA() ici !
            console.log(`🏆 MODE CHAMPION ACTIVÉ ! L'IA utilise l'ADN exact du record (${snap.val().score}💰).`);
        } else {
            console.log("⚠️ Aucun champion enregistré. Utilisation de l'ADN de base.");
        }
        
        if(state && state.turn === myId && !state.gameOver) triggerBot(myId);
    });
}

function triggerBot(botId) {
    if(botTimeout) clearTimeout(botTimeout);
    
    // GESTION INTELLIGENTE DE LA VITESSE
    let speed = 400; // Vitesse de base (quand on regarde le bot classique)
    if(autoTrainEnabled) speed = 20; // Hyper Turbo pour l'entraînement
    else if(isChampionMode) speed = 600; // Vitesse ralentie pour admirer le champion
    
    botTimeout = setTimeout(() => { botThinkAndAct(botId); }, speed); 
}

function botThinkAndAct(botId) {
    try {
        if(!state || state.turn !== botId) return;
        
        if(state.gameOver) {
            // SI ON EST EN MODE CHAMPION, ON ARRÊTE TOUT SIMPLEMENT
            if(isChampionMode) {
                console.log(`🏁 Démonstration du Champion terminée. Score final : ${state['p'+botId].money}💰.`);
                isChampionMode = false;
                botEnabled = false;
                let btnChamp = document.getElementById('champion-btn');
                if(btnChamp) { btnChamp.innerText = "🏆 Jouer Champion"; btnChamp.style.background = "#fbc02d"; }
                let btnBot = document.getElementById('bot-btn');
                if(btnBot) { btnBot.innerText = "🤖 Bot: OFF"; btnBot.style.background = "#9c27b0"; }
                return;
            }

            // SINON, C'EST L'ENTRAÎNEMENT CLASSIQUE (ÉVOLUTION)
            const finalScore = state['p'+botId].money;
            dbBrain.once("value").then(snap => {
                let currentBest = snap.exists() ? snap.val().score : -1;
                
                if(finalScore > currentBest) {
                    dbBrain.set({ score: finalScore, dna: botDNA });
                    console.log(`🏆 NOUVEAU RECORD IA ! ${finalScore}💰. ADN Sauvegardé.`);
                    autoTrainEnabled = false;
                    botEnabled = false;
                    
                    let btnTrain = document.getElementById('auto-train-btn');
                    if(btnTrain) { btnTrain.innerText = "🧬 Auto-Train: OFF"; btnTrain.style.background = "#009688"; }
                    let btnBot = document.getElementById('bot-btn');
                    if(btnBot
