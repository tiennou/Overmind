import { LogMessage, log } from "console/log";
import { Colony, getAllColonies } from "../Colony";
import { maxMarketPrices, TraderJoe } from "../logistics/TradeNetwork";
import { profile } from "../profiler/decorator";
import { entries, onPublicServer } from "../utilities/utils";
import {
	_baseResourcesLookup,
	_boostTierLookupAllTypes,
	_boostTypesTierLookup,
	_commoditiesLookup,
	_mineralCompoundsAllLookup,
	BASE_RESOURCES,
	BOOST_PARTS,
	BOOST_TIERS,
	BoostTier,
	DEPOSITS_ALL,
	INTERMEDIATE_REACTANTS,
	REAGENTS,
} from "./map_resources";

export const REACTION_PRIORITIES = [
	// T1 Boosts
	BOOST_TIERS.attack.T1,
	BOOST_TIERS.heal.T1,
	BOOST_TIERS.ranged.T1,
	BOOST_TIERS.move.T1,
	BOOST_TIERS.construct.T1,
	BOOST_TIERS.dismantle.T1,
	// BOOST_TIERS.carry.T1,
	// BOOST_TIERS.harvest.T1, // not used yet
	BOOST_TIERS.tough.T1,
	// BOOST_TIERS.upgrade.T1,

	// Reaction intermediates + ghodium
	RESOURCE_GHODIUM,
	RESOURCE_ZYNTHIUM_KEANITE,
	RESOURCE_UTRIUM_LEMERGITE,
	RESOURCE_HYDROXIDE,

	// T2 Boosts
	BOOST_TIERS.attack.T2,
	BOOST_TIERS.heal.T2,
	BOOST_TIERS.ranged.T2,
	BOOST_TIERS.move.T2,
	// BOOST_TIERS.construct.T2,
	BOOST_TIERS.dismantle.T2,
	// BOOST_TIERS.carry.T2,
	// BOOST_TIERS.harvest.T2, // not used yet
	BOOST_TIERS.tough.T2,
	// BOOST_TIERS.upgrade.T2,

	// T3 Boosts
	BOOST_TIERS.attack.T3,
	BOOST_TIERS.heal.T3,
	BOOST_TIERS.ranged.T3,
	BOOST_TIERS.move.T3,
	// BOOST_TIERS.construct.T3,
	BOOST_TIERS.dismantle.T3,
	// BOOST_TIERS.carry.T3,
	// BOOST_TIERS.harvest.T3, // not used yet
	BOOST_TIERS.tough.T3,
	// BOOST_TIERS.upgrade.T3,

	// Other boosts I don't use as much
	BOOST_TIERS.construct.T2,
	BOOST_TIERS.construct.T3,
	BOOST_TIERS.carry.T1,
	BOOST_TIERS.carry.T2,
	BOOST_TIERS.carry.T3,
	BOOST_TIERS.upgrade.T1,
	BOOST_TIERS.upgrade.T2,
	BOOST_TIERS.upgrade.T3,
];

export const priorityStockAmounts = <StoreContents>{
	XGHO2: 1000, // (-70 % dmg taken)
	XLHO2: 1000, // (+300 % heal)
	XZHO2: 1000, // (+300 % fat decr - speed)
	XZH2O: 1000, // (+300 % dismantle)
	XKHO2: 1000, // (+300 % ranged attack)
	XUH2O: 1000, // (+300 % attack)
	GHO2: 8000, // (-50 % dmg taken)
	LHO2: 8000, // (+200 % heal)
	ZHO2: 8000, // (+200 % fat decr - speed)
	ZH2O: 8000, // (+200 % dismantle)
	UH2O: 8000, // (+200 % attack)
	KHO2: 8000, // (+200 % ranged attack)
	GO: 1000, // (-30 % dmg taken)
	LO: 1000, // (+100 % heal)
	ZO: 1000, // (+100 % fat decr - speed)
	ZH: 1000, // (+100 % dismantle)
	UH: 1000, // (+100 % attack)
	KO: 1000, // (+100 % ranged attack)
	G: 2000, // For nukes and common compounds
};

export const wantedStockAmounts = <StoreContents>{
	UH: 3000, // (+100 % attack)
	KO: 3000, // (+100 % ranged attack)
	XGHO2: 10000, // (-70 % dmg taken)
	XLHO2: 20000, // (+300 % heal)
	XZHO2: 6000, // (+300 % fat decr - speed)
	XZH2O: 6000, // (+300 % dismantle)
	XKHO2: 20000, // (+300 % ranged attack)
	XUH2O: 20000, // (+300 % attack)
	G: 5000, // For nukes
	XLH2O: 8000, // (+100 % build and repair)
	LH: 3000, // (+50 % build and repair)
	XUHO2: 3000, // (+600 % harvest)
	XKH2O: 3000, // (+300 % carry)
	ZK: 800, // intermediate
	UL: 800, // intermediate
	GH: 800, // (+50 % upgrade)
	KH: 800, // (+100 % carry)
	OH: 800, // intermediate
	GH2O: 800, // (+80 % upgrade)
	LH2O: 800, // (+80 % build and repair)
	KH2O: 800, // (+200 % carry)
	XGH2O: 12000, // (+100 % upgrade)
};

export const baseStockAmounts: { [key: string]: number } = {
	[RESOURCE_CATALYST]: 5000,
	[RESOURCE_ZYNTHIUM]: 5000,
	[RESOURCE_LEMERGIUM]: 5000,
	[RESOURCE_KEANIUM]: 5000,
	[RESOURCE_UTRIUM]: 5000,
	[RESOURCE_OXYGEN]: 5000,
	[RESOURCE_HYDROGEN]: 5000,
};

/** Priorities for commodity production */
export const COMMODITY_PRIORITIES = [
	// Energy
	RESOURCE_BATTERY,
	RESOURCE_ENERGY,

	// Base resources
	RESOURCE_UTRIUM_BAR,
	RESOURCE_UTRIUM,
	RESOURCE_LEMERGIUM_BAR,
	RESOURCE_LEMERGIUM,
	RESOURCE_ZYNTHIUM_BAR,
	RESOURCE_ZYNTHIUM,
	RESOURCE_KEANIUM_BAR,
	RESOURCE_KEANIUM,
	RESOURCE_GHODIUM_MELT,
	RESOURCE_GHODIUM,
	RESOURCE_OXIDANT,
	RESOURCE_OXYGEN,
	RESOURCE_REDUCTANT,
	RESOURCE_HYDROGEN,
	RESOURCE_PURIFIER,
	RESOURCE_CATALYST,

	// Higher commodities
	RESOURCE_COMPOSITE,
	RESOURCE_CRYSTAL,
	RESOURCE_LIQUID,

	// Electronics/Silicon chain
	RESOURCE_DEVICE,
	RESOURCE_CIRCUIT,
	RESOURCE_MICROCHIP,
	RESOURCE_TRANSISTOR,
	RESOURCE_SWITCH,
	RESOURCE_WIRE,

	// Biological/Biomass chain
	RESOURCE_ORGANISM,
	RESOURCE_ORGANOID,
	RESOURCE_MUSCLE,
	RESOURCE_TISSUE,
	RESOURCE_PHLEGM,
	RESOURCE_CELL,

	// Mechanical/Metal chain
	RESOURCE_MACHINE,
	RESOURCE_HYDRAULICS,
	RESOURCE_FRAME,
	RESOURCE_FIXTURES,
	RESOURCE_TUBE,
	RESOURCE_ALLOY,

	// Mystical/Mist chain
	RESOURCE_ESSENCE,
	RESOURCE_EMANATION,
	RESOURCE_SPIRIT,
	RESOURCE_EXTRACT,
	RESOURCE_CONCENTRATE,
	RESOURCE_CONDENSATE,
];

const PRIORITIZED_COMMODITIES = entries(COMMODITIES).sort(
	([a], [b]) =>
		COMMODITY_PRIORITIES.indexOf(a) - COMMODITY_PRIORITIES.indexOf(b)
);

export interface Reaction {
	mineralType: string;
	amount: number;
}

export interface Production {
	/** The commodity to produce */
	commodityType: CommodityConstant;

	/** How many productions to make */
	requested: number;

	/** How much one production will output */
	size: number;
}

/**
 * Abathur is responsible for the evolution of the swarm and directs global production of minerals. Abathur likes
 * efficiency, XGHO2, and high lab uptime, and dislikes pronouns.
 */
@profile
export class _Abathur {
	memory = { debug: false };
	settings = {
		batchSize: 1600,
	};

	get print(): string {
		return "Abathur";
	}

	debug(...args: LogMessage[]) {
		if (this.memory.debug) {
			log.alert(this.print, ...args);
		}
	}

	// Helper methods for identifying different types of resources

	isMineralOrCompound(resource: ResourceConstant): boolean {
		return !!_mineralCompoundsAllLookup[resource];
	}

	isBaseMineral(resource: ResourceConstant): boolean {
		return !!_baseResourcesLookup[resource];
	}

	isIntermediateReactant(resource: ResourceConstant): boolean {
		return INTERMEDIATE_REACTANTS.includes(resource);
	}

	isBoost(resource: ResourceConstant): boolean {
		return !!BOOST_PARTS[resource];
	}

	isAttackBoost(resource: ResourceConstant): boolean {
		return !!_boostTypesTierLookup.attack[resource];
	}

	isRangedBoost(resource: ResourceConstant): boolean {
		return !!_boostTypesTierLookup.ranged[resource];
	}

	isHealBoost(resource: ResourceConstant): boolean {
		return !!_boostTypesTierLookup.heal[resource];
	}

	isToughBoost(resource: ResourceConstant): boolean {
		return !!_boostTypesTierLookup.tough[resource];
	}

	isMoveBoost(resource: ResourceConstant): boolean {
		return !!_boostTypesTierLookup.move[resource];
	}

	isDismantleBoost(resource: ResourceConstant): boolean {
		return !!_boostTypesTierLookup.dismantle[resource];
	}

	isConstructBoost(resource: ResourceConstant): boolean {
		return !!_boostTypesTierLookup.construct[resource];
	}

	isUpgradeBoost(resource: ResourceConstant): boolean {
		return !!_boostTypesTierLookup.upgrade[resource];
	}

	isHarvestBoost(resource: ResourceConstant): boolean {
		return !!_boostTypesTierLookup.harvest[resource];
	}

	isCarryBoost(resource: ResourceConstant): boolean {
		return !!_boostTypesTierLookup.carry[resource];
	}

	isDepositResource(resource: ResourceConstant): boolean {
		return DEPOSITS_ALL.includes(resource);
	}

	isCommodity(resource: ResourceConstant): boolean {
		return !!_commoditiesLookup[resource];
	}

	getBoostTier(boost: ResourceConstant): BoostTier | "notaboost" {
		return _boostTierLookupAllTypes[boost] || "notaboost";
	}

	/**
	 * Recursively enumerate the base ingredients required to synthesize a unit of the specified compound,
	 * e.g. Abathur.enumerateReactionBaseIngredients("XGH2O") = Z,K,U,L,H,O,H,X
	 */
	enumerateReactionBaseIngredients(
		mineral: ResourceConstant
	): ResourceConstant[] {
		if (BASE_RESOURCES.includes(mineral)) {
			return [mineral];
		} else if (REAGENTS[mineral]) {
			return Abathur.enumerateReactionBaseIngredients(
				REAGENTS[mineral][0]
			).concat(
				Abathur.enumerateReactionBaseIngredients(REAGENTS[mineral][1])
			);
		} else {
			return [];
		}
	}

	// Reaction scheduling =============================================================================================

	/**
	 * Compute the next reaction that a colony should undertake based on local and global stockpiles of all target
	 * compounds.
	 */
	getNextReaction(colony: Colony): Reaction | undefined {
		const BATCH_SIZE = Abathur.settings.batchSize;
		const globalAssets = Overmind.terminalNetwork.getAssets();
		const numColonies = _.filter(
			getAllColonies(),
			(colony) => !!colony.terminal
		).length;

		let possibleReactions = REACTION_PRIORITIES;
		if (colony.labs.length < 10) {
			// don't make the really long cooldown stuff if you don't have all labs
			possibleReactions = _.filter(
				possibleReactions,
				(resource) => ((<any>REACTION_TIME)[resource] || Infinity) <= 30
			);
		}

		// Want to build up a stockpile of high tier boosts, but also to maintain and utilize a stockpile of the
		// cheaper stuff before we start building up higher tier boosts, which have declining returns
		let nextTargetResource: ResourceConstant | undefined;
		const ingredientsUnavailable: { [resource: string]: boolean } = {}; // track what we can't make to save CPU
		const maxAmountOfEachBoostPerColony = 50000;
		const maxBatches = Math.ceil(
			maxAmountOfEachBoostPerColony / BATCH_SIZE
		);
		for (const batchNum of _.range(1, maxBatches)) {
			nextTargetResource = _.find(possibleReactions, (resource) => {
				// If we've already figured out we can't make this in a previous pass then skip it
				if (ingredientsUnavailable[resource]) {
					return false;
				}

				const tier = Abathur.getBoostTier(resource);
				// Get 2 labs' worth of a stockpile before you start making T2 boosts
				if (
					tier == "T2" &&
					batchNum * BATCH_SIZE < 2 * LAB_MINERAL_CAPACITY
				) {
					return false;
				}
				// Get 3 labs' worth of a stockpile before you start making T3 boosts
				if (
					tier == "T3" &&
					batchNum * BATCH_SIZE < 3 * LAB_MINERAL_CAPACITY
				) {
					return false;
				}

				// Don't need to stockpile a ton of reaction intermediates or ghodium
				if (
					resource == RESOURCE_GHODIUM ||
					Abathur.isIntermediateReactant(resource)
				) {
					// If the colony already has more of this this intermediate than it wants, skip it
					if (
						colony.assets[resource] >
						Overmind.terminalNetwork.thresholds(colony, resource)
							.target
					) {
						return false;
					}
				}

				// Otherwise, we're allowed to make more of this, so figure out what we should and can make
				const globalShortage =
					globalAssets[resource] / numColonies <
					(batchNum - 3) * BATCH_SIZE;
				const localShortage =
					colony.assets[resource] < batchNum * BATCH_SIZE;
				if (globalShortage || localShortage) {
					// Do we have enough ingredients (or can we obtain enough) to make this step of the reaction?
					const [reagent1, reagent2] = REAGENTS[resource];
					const reagent1Available =
						colony.assets[reagent1] >= BATCH_SIZE ||
						Overmind.terminalNetwork.canObtainResource(
							colony,
							reagent1,
							BATCH_SIZE
						);
					const reagent2Available =
						colony.assets[reagent2] >= BATCH_SIZE ||
						Overmind.terminalNetwork.canObtainResource(
							colony,
							reagent2,
							BATCH_SIZE
						);
					if (reagent1Available && reagent2Available) {
						return true;
					} else {
						ingredientsUnavailable[resource] = true; // canObtainResource() is expensive; cache it
					}
				}

				// We can't make this thing :(
				return false;
			});

			if (nextTargetResource) {
				break;
			}
		}

		if (nextTargetResource) {
			return { mineralType: nextTargetResource, amount: BATCH_SIZE };
		}
	}

	private canReceiveBasicMineralsForReaction(
		mineralQuantities: { [resourceType: string]: number },
		_amount: number
	): boolean {
		for (const mineral in mineralQuantities) {
			if (
				!Abathur.someColonyHasExcess(
					<ResourceConstant>mineral,
					mineralQuantities[mineral]
				)
			) {
				return false;
			}
		}
		return true;
	}

	private canBuyBasicMineralsForReaction(mineralQuantities: {
		[resourceType: string]: number;
	}): boolean {
		if (
			Game.market.credits < TraderJoe.settings.market.credits.canBuyAbove
		) {
			return false;
		}
		for (const mineral in mineralQuantities) {
			let maxPrice = maxMarketPrices[mineral] || maxMarketPrices.default;
			if (!onPublicServer()) {
				maxPrice = Infinity;
			}
			if (
				Overmind.tradeNetwork.priceOf(<ResourceConstant>mineral) >
				maxPrice
			) {
				return false;
			}
		}
		return true;
	}

	private stockAmount(resource: ResourceConstant): number {
		return (
			wantedStockAmounts[resource] ||
			priorityStockAmounts[resource] ||
			baseStockAmounts[resource] ||
			0
		);
	}

	private hasExcess(
		colony: Colony,
		mineralType: ResourceConstant,
		excessAmount = 0
	): boolean {
		return (
			colony.assets[mineralType] - excessAmount >
			Abathur.stockAmount(mineralType)
		);
	}

	private someColonyHasExcess(
		mineralType: ResourceConstant,
		excessAmount = 0
	): boolean {
		return _.any(getAllColonies(), (colony) =>
			Abathur.hasExcess(colony, mineralType, excessAmount)
		);
	}

	/**
	 * Build a reaction queue for a target compound
	 */
	private buildReactionQueue(
		colony: Colony,
		mineral: ResourceConstant,
		amount: number,
		verbose = false
	): Reaction[] {
		// amount = minMax(amount, Abathur.settings.minBatchSize, Abathur.settings.maxBatchSize);
		amount = Abathur.settings.batchSize;
		if (verbose) {
			console.log(
				`Abathur@${colony.room.print}: building reaction queue for ${amount} ${mineral}`
			);
		}
		let reactionQueue: Reaction[] = [];
		for (const ingredient of Abathur.enumerateReactionProducts(mineral)) {
			let productionAmount = amount;
			if (ingredient != mineral) {
				if (verbose) {
					console.log(
						`productionAmount: ${productionAmount}, assets: ${colony.assets[ingredient]}`
					);
				}
				productionAmount = Math.max(
					productionAmount - colony.assets[ingredient],
					0
				);
			}
			productionAmount = Math.min(
				productionAmount,
				Abathur.settings.batchSize
			);
			reactionQueue.push({
				mineralType: ingredient,
				amount: productionAmount,
			});
		}
		if (verbose) {
			console.log(`Pre-trim queue: ${JSON.stringify(reactionQueue)}`);
		}
		reactionQueue = Abathur.trimReactionQueue(reactionQueue);
		if (verbose) {
			console.log(`Post-trim queue: ${JSON.stringify(reactionQueue)}`);
		}
		reactionQueue = _.filter(reactionQueue, (rxn) => rxn.amount > 0);
		if (verbose) {
			console.log(`Final queue: ${JSON.stringify(reactionQueue)}`);
		}
		return reactionQueue;
	}

	/**
	 * Trim a reaction queue, reducing the amounts of precursor compounds which need to be produced
	 */
	private trimReactionQueue(reactionQueue: Reaction[]): Reaction[] {
		// Scan backwards through the queue and reduce the production amount of subsequently baser resources as needed
		reactionQueue.reverse();
		for (const reaction of reactionQueue) {
			const [ing1, ing2] = REAGENTS[reaction.mineralType];
			const precursor1 = _.findIndex(
				reactionQueue,
				(rxn) => rxn.mineralType == ing1
			);
			const precursor2 = _.findIndex(
				reactionQueue,
				(rxn) => rxn.mineralType == ing2
			);
			for (const index of [precursor1, precursor2]) {
				if (index != -1) {
					if (reactionQueue[index].amount == 0) {
						reactionQueue[index].amount = 0;
					} else {
						reactionQueue[index].amount = Math.min(
							reaction.amount,
							reactionQueue[index].amount
						);
					}
				}
			}
		}
		reactionQueue.reverse();
		return reactionQueue;
	}

	/**
	 * Figure out which basic minerals are missing and how much
	 */
	private getMissingBasicMinerals(
		colony: Colony,
		reactionQueue: Reaction[],
		verbose = false
	): { [resourceType: string]: number } {
		const requiredBasicMinerals =
			Abathur.getRequiredBasicMinerals(reactionQueue);
		if (verbose) {
			console.log(
				`Required basic minerals: ${JSON.stringify(
					requiredBasicMinerals
				)}`
			);
		}
		if (verbose) {
			console.log(`assets: ${JSON.stringify(colony.assets)}`);
		}
		const missingBasicMinerals = <StoreContents>{};
		for (const mineralType of <ResourceConstant[]>(
			Object.keys(requiredBasicMinerals)
		)) {
			const amountMissing =
				requiredBasicMinerals[mineralType] - colony.assets[mineralType];
			if (amountMissing > 0) {
				missingBasicMinerals[mineralType] = amountMissing;
			}
		}
		if (verbose) {
			console.log(
				`Missing basic minerals: ${JSON.stringify(
					missingBasicMinerals
				)}`
			);
		}
		return missingBasicMinerals;
	}

	/**
	 * Get the required amount of basic minerals for a reaction queue
	 */
	private getRequiredBasicMinerals(reactionQueue: Reaction[]): {
		[resourceType: string]: number;
	} {
		const requiredBasicMinerals: { [resourceType: string]: number } = {
			[RESOURCE_HYDROGEN]: 0,
			[RESOURCE_OXYGEN]: 0,
			[RESOURCE_UTRIUM]: 0,
			[RESOURCE_KEANIUM]: 0,
			[RESOURCE_LEMERGIUM]: 0,
			[RESOURCE_ZYNTHIUM]: 0,
			[RESOURCE_CATALYST]: 0,
		};
		for (const reaction of reactionQueue) {
			const ingredients = REAGENTS[reaction.mineralType];
			for (const ingredient of ingredients) {
				if (!REAGENTS[ingredient]) {
					// resource is base mineral
					requiredBasicMinerals[ingredient] += reaction.amount;
				}
			}
		}
		return requiredBasicMinerals;
	}

	/**
	 * Recursively generate a list of outputs from reactions required to generate a compound
	 */
	private enumerateReactionProducts(
		mineral: ResourceConstant
	): ResourceConstant[] {
		if (!REAGENTS[mineral] || _.isEmpty(mineral)) {
			return [];
		} else {
			return Abathur.enumerateReactionProducts(
				REAGENTS[mineral][0]
			).concat(
				Abathur.enumerateReactionProducts(REAGENTS[mineral][1]),
				mineral
			);
		}
	}

	// Production scheduling =========================================================================================

	/**
	 * Compute the next production that a colony should undertake based on local and global stockpiles of
	 * all target compounds.
	 */
	getNextProduction(colony: Colony): Production | undefined {
		if (!colony.factory) {
			return undefined;
		}

		const globalAssets = Overmind.terminalNetwork.getAssets();
		const numColonies = _.filter(
			getAllColonies(),
			(colony) => !!colony.terminal
		).length;

		/** How much of a product we can make given its components' availability */
		let batchAmount = Infinity;
		let possibleProductions = PRIORITIZED_COMMODITIES;
		possibleProductions = possibleProductions.filter(
			([_prod, data]) => (data.level ?? 0) <= (colony.factory!.level ?? 0)
		);

		this.debug(
			() =>
				`${colony.print}, possibleProductions: ${possibleProductions
					.map((p) => p[0])
					.join(", ")}`
		);

		// Want to build up a stockpile of high tier commodities, but also to maintain and utilize a stockpile of the
		// cheaper stuff before we start building up higher commodities, which have declining returns
		const ingredientsUnavailable: { [resource: string]: boolean } = {}; // track what we can't make to save CPU

		const nextTargetProduction = _.find(
			possibleProductions,
			([prodStr, data]) => {
				const product = <CommodityConstant>prodStr;
				const productThreshold = Overmind.terminalNetwork.thresholds(
					colony,
					product
				);
				if (
					colony.assets[product] >=
					(productThreshold.surplus ?? Infinity)
				) {
					this.debug(
						() =>
							`${
								colony.print
							}, checking ${product}: more than enough (stored: ${
								colony.assets[product]
							}, threshold: ${JSON.stringify(productThreshold)})`
					);
					return false;
				}

				batchAmount = Infinity;

				this.debug(
					() =>
						`${
							colony.print
						}, checking ${product}: threshold: ${JSON.stringify(
							productThreshold
						)}, components: ${JSON.stringify(data.components)}`
				);
				return entries(data.components).every(([resource, amount]) => {
					// If we've already figured out we can't make this in a previous pass then skip it
					if (ingredientsUnavailable[resource]) {
						return false;
					}

					// Check if the colony already has more of this resource than it needs
					const resourceThreshold =
						Overmind.terminalNetwork.thresholds(colony, resource);
					if (colony.assets[resource] < resourceThreshold.target) {
						this.debug(
							() =>
								`${
									colony.print
								}, checking ${product}>${resource}, not enough in stock (stored: ${
									colony.assets[resource]
								}, threshold: ${JSON.stringify(
									resourceThreshold
								)})`
						);
						return false;
					}

					// Otherwise, we're allowed to make more of this, so figure out what we should and can make
					const globalShortage =
						globalAssets[resource] / numColonies < amount;
					const localShortage = colony.assets[resource] < amount;
					if (globalShortage || localShortage) {
						// Do we have enough ingredients (or can we obtain enough) to make this step of the reaction?
						if (
							!Overmind.terminalNetwork.canObtainResource(
								colony,
								resource,
								amount
							)
						) {
							this.debug(
								`${colony.print}, checking ${product}>${resource} for ${amount}, shortage`
							);
							ingredientsUnavailable[resource] = true; // canObtainResource() is expensive; cache it
							return false;
						}
					}
					if (
						colony.assets[resource] <=
						(resourceThreshold.surplus ?? 0)
					) {
						this.debug(
							() =>
								`${
									colony.print
								}, checking ${product}>${resource}, not over surplus (stored: ${
									colony.assets[resource]
								}, threshold: ${JSON.stringify(
									resourceThreshold
								)})`
						);
						return false;
					}

					const maxBatch = Math.floor(
						(colony.assets[resource] -
							(resourceThreshold.surplus ?? 0)) /
							amount
					);
					batchAmount = Math.max(Math.min(maxBatch, batchAmount), 0);
					this.debug(
						() =>
							`${
								colony.print
							}, checking ${product}>${resource}, good to go for ${batchAmount} (${maxBatch}) batches, (local: ${
								colony.assets[resource]
							}, network: ${
								globalAssets[resource]
							}, threshold: ${JSON.stringify(resourceThreshold)})`
					);
					return true;
				});
			}
		);

		this.debug(
			() =>
				`${colony.print}: possible production ${JSON.stringify(
					nextTargetProduction
				)}, batch amount: ${batchAmount}`
		);

		if (nextTargetProduction && batchAmount > 0) {
			// Cap batches at 10 so we have a chance to switch production
			batchAmount = Math.min(batchAmount, 10);
			return {
				commodityType: <CommodityConstant>nextTargetProduction[0],
				requested: batchAmount,
				size: nextTargetProduction[1].amount,
			};
		}
	}
}

export const Abathur = new _Abathur();

global.Abathur = Abathur;
