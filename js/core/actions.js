// /js/core/actions.js

function buySpec(specId) {
    if (state.availableSpecs > 0) {
        state.specs[specId]++;
        state.availableSpecs--;
        notify("Specialization acquired.", "#4ade80");
        render();
    }
}

function buyTerritory(id) {
    const t = state.territories.find(x => x.id === id);
    if (t && t.owner !== 'player' && state.resources.gold >= t.cost) {
        state.resources.gold -= t.cost;
        t.owner = 'player';
        notify(`You have annexed ${t.name}! Its specialty bonus is now active.`, "#fbbf24");
        
        const priorOrders = state.orders.length;
        state.orders = state.orders.filter(o => o.territoryId !== id);
        if (state.orders.length < priorOrders) {
            notify("Prior trade orders with this region have been dissolved.", "#a3a3a3");
        }
        
        checkTerritoryGeneration();
        
        render();
    } else {
        notify("Insufficient gold.", "#ef4444");
    }
}

function submitOrder() {
    const tId = document.getElementById('order-territory').value;
    const type = document.getElementById('order-type').value;
    const res = document.getElementById('order-resource').value;
    const amount = parseInt(document.getElementById('order-amount').value, 10);
    const price = parseFloat(document.getElementById('order-price').value);

    if(!tId || !type || !res || isNaN(amount) || amount <= 0 || isNaN(price) || price <= 0) {
        return notify("Invalid order terms.", "#ef4444");
    }

    const territory = state.territories.find(t => t.id === tId);
    if(!territory || territory.owner === 'player') return notify("Invalid territory.", "#ef4444");

    let priceRatio;
    if (type === 'import') {
        const marketBuy = state.market[res].buy;
        priceRatio = price / marketBuy;
    } else {
        const marketSell = state.market[res].sell;
        priceRatio = marketSell / price;
    }

    const ownedCount = state.territories.filter(t => t.owner === 'player').length;
    const wealthFactor = Math.min(1.0, state.resources.gold / 100000); 
    
    let finalChance = priceRatio + (ownedCount * 0.05) + (wealthFactor * 0.1);

    if (state.castle && state.castle.hiredCouncil && state.castle.hiredCouncil.chancellor) {
        const chancellorId = state.castle.hiredCouncil.chancellor;
        const chancellor = state.castle.councilMembers.find(c => c.id === chancellorId);
        if (chancellor) {
            finalChance += (chancellor.skill * 0.01);
        }
    }

    if (finalChance < 0.8 || Math.random() > finalChance) {
        notify(`${territory.name} rejected your offer. They demand a fairer price.`, "#ef4444");
    } else {
        state.orders.push({
            id: Date.now(),
            territoryId: tId,
            territoryName: territory.name,
            type: type,
            resource: res,
            amount: amount,
            price: price,
            status: 'active'
        });
        notify(`${territory.name} accepted the trade agreement!`, "#4ade80");
        renderMarket(); 
    }
}

function cancelOrder(id) {
    state.orders = state.orders.filter(o => o.id !== id);
    renderMarket();
}

function calculateCost(bldKey) {
    const bld = state.buildings[bldKey];
    const data = BUILDING_DATA[bldKey];
    const costs = {};
    
    let bldCostMult = 1;
    const { tier } = getSettlementLevel(state.population.total);
    if (tier.bonus.bldCost) bldCostMult *= tier.bonus.bldCost;
    if (state.specs.bldCost) bldCostMult *= (1 - (state.specs.bldCost * 0.05));

    for (let [res, val] of Object.entries(data.baseCost)) {
        costs[res] = Math.floor(val * Math.pow(data.costMult, bld.level) * bldCostMult);
    }
    return costs;
}

function canAfford(costs) {
    for (let [res, val] of Object.entries(costs)) {
        if (state.resources[res] < val) return false;
    }
    return true;
}

function assignWorker(taskKey, delta) {
    const idle = state.population.total - state.population.assigned;
    if (delta > 0 && idle <= 0) return;
    if (delta < 0 && state.assignments[taskKey] <= 0) return;

    const bldKey = TASK_DATA[taskKey].bld;
    if (!state.buildings[bldKey].built) {
        notify("Building required.", "#ef4444");
        return;
    }

    state.assignments[taskKey] += delta;
    state.population.assigned += delta;
    render();
}

function buildOrUpgrade(bldKey) {
    const costs = calculateCost(bldKey);
    if (!canAfford(costs)) {
        notify("Insufficient resources.", "#ef4444");
        return;
    }

    for (let [res, val] of Object.entries(costs)) {
        state.resources[res] -= val;
    }

    state.buildings[bldKey].level++;
    state.buildings[bldKey].built = true;
    
    if (bldKey === 'housing') {
        state.population.max = 5 + BUILDING_DATA.housing.benefit(state.buildings.housing.level - 1);
    }

    notify(`${BUILDING_DATA[bldKey].name} Upgrade Complete.`, "#fbbf24");
    render();
}

function recruitUnit(unitId) {
    const unit = UNIT_DATA[unitId];
    const idle = state.population.total - state.population.assigned;

    if (idle < unit.workers) {
        return notify(`Need ${unit.workers} idle workers to recruit ${unit.name}.`, "#ef4444");
    }
    
    let costMult = 1;
    if (state.castle && state.castle.rooms && state.castle.rooms.barracks) {
        costMult = 0.8;
    }

    const actualCost = Math.floor(unit.cost.weaponry * costMult);

    if (state.resources.weaponry < actualCost) {
        return notify(`Insufficient Weaponry. Need ${actualCost}.`, "#ef4444");
    }

    state.resources.weaponry -= actualCost;
    state.population.assigned += unit.workers;
    state.armyWorkers += unit.workers;
    state.garrison[unitId]++;
    
    notify(`Recruited a regiment of ${unit.name}!`, "#fbbf24");
    render();
}

function exportSaveToFile() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "estatesim_save_" + Date.now() + ".json");
    document.body.appendChild(downloadAnchorNode); // Required for Firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    if (typeof notify === 'function') notify("Game saved to file.", "#4ade80");
}

function importSaveFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const loadedState = JSON.parse(e.target.result);
            if (loadedState && loadedState.resources && loadedState.population) {
                // Soft merge state objects to avoid breaking changes on future updates
                for (let key in loadedState) {
                    if (typeof loadedState[key] === 'object' && !Array.isArray(loadedState[key]) && loadedState[key] !== null) {
                        state[key] = { ...state[key], ...loadedState[key] };
                    } else {
                        state[key] = loadedState[key];
                    }
                }
                if (state.scene !== 'menu') {
                    document.getElementById('menu-screen')?.classList.add('hidden');
                    document.getElementById('game-container')?.classList.remove('hidden');
                }
                
                const estateNameInput = document.getElementById('estate-name-input');
                if (estateNameInput) estateNameInput.value = state.estateName;
                
                const displayEstateName = document.getElementById('display-estate-name');
                if (displayEstateName) displayEstateName.textContent = state.estateName;
                
                switchScene(state.scene);
                render();
                if (typeof notify === 'function') notify("Game loaded successfully.", "#4ade80");
            } else {
                if (typeof notify === 'function') notify("Invalid save file.", "#ef4444");
            }
        } catch (error) {
            if (typeof notify === 'function') notify("Error parsing save file.", "#ef4444");
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Clear the input field for future uploads
}

function saveGameToSlot(slot) {
    if (!slot) return;
    const saveData = {
        ...state,
        saveDate: new Date().toISOString()
    };
    localStorage.setItem(`estatesim_save_${slot}`, JSON.stringify(saveData));
    notify(`Game saved to slot ${slot}.`, "#4ade80");
    if (typeof renderSaveLoadModal === 'function') {
        renderSaveLoadModal();
    }
}

function loadGameFromSlot(slot) {
    if (!slot) return;
    const savedData = localStorage.getItem(`estatesim_save_${slot}`);
    if (!savedData) {
        return notify(`Slot ${slot} is empty.`, "#ef4444");
    }

    try {
        const loadedState = JSON.parse(savedData);
        if (loadedState && loadedState.resources && loadedState.population) {
            // Replicate the soft merge from the original file-based load function
            for (let key in loadedState) {
                if (Object.prototype.hasOwnProperty.call(loadedState, key)) {
                    if (typeof loadedState[key] === 'object' && !Array.isArray(loadedState[key]) && loadedState[key] !== null) {
                        state[key] = { ...state[key], ...loadedState[key] };
                    } else {
                        state[key] = loadedState[key];
                    }
                }
            }

            if (state.scene !== 'menu') {
                document.getElementById('menu-screen')?.classList.add('hidden');
                document.getElementById('game-container')?.classList.remove('hidden');
            }
            
            const estateNameInput = document.getElementById('estate-name-input');
            if (estateNameInput) estateNameInput.value = state.estateName;
            
            const displayEstateName = document.getElementById('display-estate-name');
            if (displayEstateName) displayEstateName.textContent = state.estateName;
            
            if (typeof closeSaveLoadModal === 'function') {
                closeSaveLoadModal();
            }
            switchScene(state.scene);
            render();
            notify(`Game loaded from slot ${slot}.`, "#4ade80");
        } else {
            notify("Invalid save data in slot.", "#ef4444");
        }
    } catch (error) {
        console.error("Error loading from slot:", error);
        notify("Error parsing save data from slot.", "#ef4444");
    }
}

function deleteSaveSlot(slot) {
    if (!slot) return;
    const key = `estatesim_save_${slot}`;
    if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        notify(`Save slot ${slot} deleted.`, "#a3a3a3");
        if (typeof renderSaveLoadModal === 'function') {
            renderSaveLoadModal();
        }
    } else {
        notify(`Slot ${slot} is already empty.`, "#ef4444");
    }
}

function attackTerritory(id) {
    const t = state.territories.find(x => x.id === id);
    if (!t || t.owner === 'player') return;

    let playerAtt = 0;
    let playerDef = 0;
    for (let [uId, data] of Object.entries(UNIT_DATA)) {
        const count = state.garrison[uId] || 0;
        playerAtt += data.att * count;
        playerDef += data.def * count;
    }
    const playerPower = playerAtt + playerDef;

    if (playerPower <= 0) {
        return notify("You have no army to attack with!", "#ef4444");
    }

    const { index } = getSettlementLevel(state.population.total);
    const minArmy = Math.max(1, index * 5);
    const maxArmy = Math.max(10, index * 15);
    const enemyAtt = Math.floor(Math.random() * (maxArmy - minArmy + 1)) + minArmy;
    const enemyDef = Math.floor(Math.random() * (maxArmy - minArmy + 1)) + minArmy;
    const enemyPower = enemyAtt + enemyDef;

    notify(`Enemy Garrison Encountered - ATT: ${enemyAtt}, DEF: ${enemyDef}`, "#a3a3a3");

    if (playerPower >= enemyPower) {
        t.owner = 'player';
        t.conquered = true;
        notify(`Victory! You have conquered ${t.name}!`, "#4ade80");
        applyBattleCasualties(0.1 + Math.random() * 0.15); // 10-25% casualties on win
        
        const priorOrders = state.orders.length;
        state.orders = state.orders.filter(o => o.territoryId !== id);
        if (state.orders.length < priorOrders) {
            notify("Prior trade orders with this region have been forcefully dissolved.", "#a3a3a3");
        }

        checkTerritoryGeneration();
    } else {
        notify(`Defeat! Your army was repelled at ${t.name}.`, "#ef4444");
        applyBattleCasualties(0.3 + Math.random() * 0.2); // 30-50% casualties on loss
    }
    render();
}

function applyBattleCasualties(percent) {
    let totalLost = 0;
    for (let [uId, data] of Object.entries(UNIT_DATA)) {
        const count = state.garrison[uId];
        if (count > 0) {
            let lost = Math.floor(count * percent);
            if (lost === 0 && Math.random() < percent) lost = 1;
            
            if (lost > 0) {
                state.garrison[uId] -= lost;
                const workersLost = lost * data.workers;
                state.population.assigned -= workersLost;
                state.armyWorkers -= workersLost;
                state.population.total -= workersLost;
                totalLost += lost;
            }
        }
    }
    if (totalLost > 0) notify(`You lost ${totalLost} regiments in the conflict.`, "#ef4444");
}

function checkTerritoryGeneration() {
    if (state.hasGeneratedNewRegions) return;
    const owned = state.territories.filter(t => t.owner === 'player').length;
    if (owned >= 3) {
        state.hasGeneratedNewRegions = true;
        const { index } = getSettlementLevel(state.population.total);
        
        let availableNames = [...TERRITORY_NAMES];
        for (let i = 0; i < 6; i++) {
            const nameIndex = Math.floor(Math.random() * availableNames.length);
            const tName = availableNames.splice(nameIndex, 1)[0] || `Region ${i}`;
            
            // Avoid gold for resource specialties to prevent OP infinite gold regions
            const validSpecs = ALL_RESOURCES.filter(r => r !== 'gold');
            const tSpec = validSpecs[Math.floor(Math.random() * validSpecs.length)];
            
            state.territories.push({
                id: 'gen_' + Date.now() + '_' + i,
                name: tName,
                specialty: tSpec,
                owner: 'independent',
                cost: 25000 + (index * 15000)
            });
        }
        notify("6 new independent regions have been discovered!", "#a855f7");
    }
}

function startCastleConstruction() {
    if (state.castle.built || state.castle.building) return;
    if (state.resources.gold >= CASTLE_COST.gold && state.resources.planks >= CASTLE_COST.planks && state.resources.stone >= CASTLE_COST.stone) {
        state.resources.gold -= CASTLE_COST.gold;
        state.resources.planks -= CASTLE_COST.planks;
        state.resources.stone -= CASTLE_COST.stone;
        state.castle.building = true;
        state.castle.buildTicks = 0;
        notify("Castle construction has begun!", "#a855f7");
        render();
    } else {
        notify("Insufficient resources for Castle.", "#ef4444");
    }
}

function buildCastleRoom(roomId) {
    if (state.castle.rooms[roomId]) return;
    const room = CASTLE_ROOMS[roomId];
    for (let [res, val] of Object.entries(room.cost)) {
        if (state.resources[res] < val) return notify("Insufficient resources.", "#ef4444");
    }
    for (let [res, val] of Object.entries(room.cost)) {
        state.resources[res] -= val;
    }
    state.castle.rooms[roomId] = true;
    notify(`${room.name} constructed!`, "#a855f7");
    
    if (roomId === 'councilChamber') generateCouncilMembers();
    
    render();
}

function issueEdict(edictId) {
    if (state.castle.activeEdict) return notify("An Edict is already active.", "#ef4444");
    const edict = EDICTS.find(e => e.id === edictId);
    if (!edict) return;
    
    if (state.resources.prestige >= edict.cost.prestige && state.resources.gold >= edict.cost.gold) {
        if (edictId === 'wood_boost' && (!state.buildings.woodcutter.built || state.assignments.woodcutting <= 0)) return notify("Requires Woodcutter's Hut and active worker.", "#ef4444");
        if (edictId === 'stone_boost' && (!state.buildings.quarry.built || state.assignments.mining_stone <= 0)) return notify("Requires Stone Quarry and active worker.", "#ef4444");
        if (edictId === 'food_boost' && (!state.buildings.farm.built || state.assignments.farming <= 0)) return notify("Requires Village Farm and active worker.", "#ef4444");
        
        state.resources.prestige -= edict.cost.prestige;
        state.resources.gold -= edict.cost.gold;
        
        state.castle.activeEdict = edictId;
        state.castle.edictTicksLeft = edict.duration;
        notify(`${edict.name} issued!`, "#a855f7");
        render();
    } else {
        notify("Insufficient Prestige or Gold.", "#ef4444");
    }
}

function generateCouncilMembers() {
    if (state.castle.councilMembers.length === 0) {
        for (let i = 0; i < 3; i++) {
            state.castle.councilMembers.push({
                id: 'cm_' + Date.now() + '_' + i,
                name: COUNCIL_NAMES[Math.floor(Math.random() * COUNCIL_NAMES.length)] + " " + (i + 1),
                skill: Math.floor(Math.random() * 5) + 5
            });
        }
    }
}

function assignCouncilMember(memberId, position) {
    for (let pos in state.castle.hiredCouncil) {
        if (state.castle.hiredCouncil[pos] === memberId) {
            state.castle.hiredCouncil[pos] = null;
        }
    }
    state.castle.hiredCouncil[position] = memberId;
    notify(`Assigned to ${position}.`, "#a855f7");
    render();
}

function unassignCouncilMember(position) {
    state.castle.hiredCouncil[position] = null;
    notify(`Dismissed from ${position}.`, "#a3a3a3");
    render();
}