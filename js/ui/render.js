// /js/ui/render.js


function getSettlementLevel(pop) {
    let currentTier = SETTLEMENT_TIERS[0];
    let tIndex = 0;
    for (let i = 0; i < SETTLEMENT_TIERS.length; i++) {
        if (pop >= SETTLEMENT_TIERS[i].req) {
            currentTier = SETTLEMENT_TIERS[i];
            tIndex = i;
        } else {
            break;
        }
    }
    let prestige = 0;
    if (pop >= 50000) {
        prestige = Math.floor((pop - 50000) / 5000);
    }
    return { tier: currentTier, index: tIndex, prestige };
}

function render() {
    const { tier, index, prestige } = getSettlementLevel(state.population.total);
    let displayString = `- ${tier.name}`;
    if (prestige > 0) displayString += ` (Prestige ${prestige})`;
    document.getElementById('tier-display').textContent = displayString;

    let nextReq, currentBase;
    if (index < SETTLEMENT_TIERS.length - 1) {
        nextReq = SETTLEMENT_TIERS[index + 1].req;
        currentBase = tier.req;
    } else {
        currentBase = 50000 + (prestige * 5000);
        nextReq = currentBase + 5000;
    }
    
    const pop = state.population.total;
    const progressPercent = Math.max(0, Math.min(100, ((pop - currentBase) / (nextReq - currentBase)) * 100));
    
    document.getElementById('tier-progress-text').textContent = `${pop} / ${nextReq}`;
    document.getElementById('tier-progress-fill').style.width = `${progressPercent}%`;

    const btnSpecs = document.getElementById('btn-specs');
    if (state.tierIndex > 0 || state.availableSpecs > 0) {
        btnSpecs.classList.remove('hidden');
        document.getElementById('btn-specs-count').textContent = state.availableSpecs;
        if (state.availableSpecs > 0) {
            btnSpecs.classList.add('animate-pulse', 'border-green-500');
        } else {
            btnSpecs.classList.remove('animate-pulse', 'border-green-500');
        }
    }

    if (typeof syncLayoutOffsets === 'function') {
        syncLayoutOffsets();
    }
    if (typeof syncStockpilePanel === 'function') {
        syncStockpilePanel();
    }

    for (let res of ALL_RESOURCES) {
        const el = document.getElementById(`res-${res}`);
        const rateEl = document.getElementById(`res-${res}-rate`);
        if (el) el.textContent = Math.floor(state.resources[res]);
        if (rateEl) {
            const net = state.rates[res] || 0;
            rateEl.textContent = `${net > 0 ? '+' : ''}${net.toFixed(1)}`;
            rateEl.className = `text-xs font-bold ${net > 0 ? 'text-green-500' : (net < 0 ? 'text-red-500' : 'text-gray-500')}`;
        }
    }

    const idle = state.population.total - state.population.assigned;
    document.getElementById('pop-display').textContent = state.population.total;
    document.getElementById('pop-max-display').textContent = state.population.max;
    document.getElementById('idle-display').textContent = idle;

    const hudFood = document.getElementById('hud-food');
    const hudFoodRate = document.getElementById('hud-food-rate');
    const hudGold = document.getElementById('hud-gold');
    const hudGoldRate = document.getElementById('hud-gold-rate');

    if (hudFood) hudFood.textContent = Math.floor(state.resources.food || 0);
    if (hudGold) hudGold.textContent = Math.floor(state.resources.gold || 0);

    if (hudFoodRate) {
        const foodNet = state.rates.food || 0;
        hudFoodRate.textContent = `${foodNet > 0 ? '+' : ''}${foodNet.toFixed(1)}`;
        hudFoodRate.className = `hud-rate ${foodNet > 0 ? 'text-green-500' : (foodNet < 0 ? 'text-red-500' : 'text-gray-500')}`;
    }

    if (hudGoldRate) {
        const goldNet = state.rates.gold || 0;
        hudGoldRate.textContent = `${goldNet > 0 ? '+' : ''}${goldNet.toFixed(1)}`;
        hudGoldRate.className = `hud-rate ${goldNet > 0 ? 'text-green-500' : (goldNet < 0 ? 'text-red-500' : 'text-gray-500')}`;
    }

    const prestigeEl = document.getElementById('prestige-display');
    if (prestigeEl && typeof state.resources.prestige !== 'undefined') {
        prestigeEl.textContent = Math.floor(state.resources.prestige);
    }

    if (state.scene === 'estate') {
        renderEstate();
    } else if (state.scene === 'market') {
        renderMarket();
    } else if (state.scene === 'specs') {
        renderSpecs();
    } else if (state.scene === 'territories') {
        renderTerritories();
    } else if (state.scene === 'garrison') {
        renderGarrison();
    } else if (state.scene === 'castle') {
        if (typeof renderCastle === 'function') renderCastle();
    }
}
