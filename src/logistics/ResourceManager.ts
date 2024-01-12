import { Abathur } from "resources/Abathur";
import { Colony } from "../Colony";
import { log } from "console/log";
import { RESOURCE_IMPORTANCE_ALL } from "resources/map_resources";
import { isStructure } from "declarations/typeGuards";

type ManagedResourceStructure = StructureStorage | StructureTerminal;

const TERMINAL_THRESHOLDS = {
	energy: {
		target: 50000,
		tolerance: 5000,
	},
	power: {
		target: 2500,
		tolerance: 2500,
	},
	ops: {
		target: 2500,
		tolerance: 2500,
	},
	baseMinerals: {
		target: 6500, // 2 * LAB_MINERAL_CAPACITY + 500
		tolerance: 500,
	},
	intermediateReactants: {
		target: 3500, // LAB_MINERAL_CAPACITY + 500
		tolerance: 500,
	},
	boosts: {
		target: 3500, // LAB_MINERAL_CAPACITY + 500
		tolerance: 500,
	},
	commodities_raw: {
		target: 5000,
		tolerance: 1000,
	},
	commodities: {
		target: 5000,
		tolerance: 500,
	},
};

function getTerminalThresholds(
	resource: ResourceConstant
): { target: number; tolerance: number } | undefined {
	let thresholds;
	if (resource == RESOURCE_ENERGY) {
		thresholds = TERMINAL_THRESHOLDS.energy;
	} else if (resource == RESOURCE_POWER) {
		thresholds = TERMINAL_THRESHOLDS.power;
	} else if (resource == RESOURCE_OPS) {
		thresholds = TERMINAL_THRESHOLDS.ops;
	} else if (Abathur.isBaseMineral(resource)) {
		thresholds = TERMINAL_THRESHOLDS.baseMinerals;
	} else if (
		Abathur.isIntermediateReactant(resource) ||
		resource == RESOURCE_GHODIUM
	) {
		thresholds = TERMINAL_THRESHOLDS.intermediateReactants;
	} else if (Abathur.isBoost(resource)) {
		thresholds = TERMINAL_THRESHOLDS.boosts;
	} else if (Abathur.isRawCommodity(resource)) {
		thresholds = TERMINAL_THRESHOLDS.commodities_raw;
	} else if (Abathur.isCommodity(resource)) {
		thresholds = TERMINAL_THRESHOLDS.commodities;
	}
	return thresholds;
}

// Needs to be after class declaration because fuck lack of class hoisting
const TERMINAL_THRESHOLDS_ALL: {
	[resource: string]: { target: number; tolerance: number } | undefined;
} = _.zipObject(
	RESOURCES_ALL,
	_.map(RESOURCES_ALL, (resource) => getTerminalThresholds(resource))
);

interface StructureOverfillThresholds {
	overfill: number;
	dump: number;
}

/**
 * Resource manager; makes high-level decisions based on resource amounts & capacity
 */
export class ResourceManager {
	static overfillThresholds: {
		[structureType: string]: StructureOverfillThresholds;
	} = {
		storage: {
			overfill: 100000,
			dump: 5000,
		},
		terminal: {
			overfill: 50000,
			dump: 5000,
		},
	};

	static settings = {
		/** Won't rebuild terminal until you have this much energy in storage */
		minimumEnergyTerminalRebuilding: 200000,
	};

	/** Returns the maximum capacity considered safe for the structure */
	static getSafeCapacity(store: ManagedResourceStructure) {
		return (
			store.store.getCapacity() -
			this.overfillThresholds[store.structureType].overfill
		);
	}

	/** Check if the given storage structure is getting close to full */
	static isOverCapacity(store: ManagedResourceStructure) {
		return store.store.getUsedCapacity() > this.getSafeCapacity(store);
	}

	/** Check if we should dump instead of trying to transfer to the given structure */
	static shouldDump(store: ManagedResourceStructure) {
		return (
			store.store.getUsedCapacity() >
			store.store.getCapacity() -
				this.overfillThresholds[store.structureType].dump
		);
	}

	/** Get the next resource that can be dumped from the given structure */
	static getNextResourceToDump(store: { store: StoreDefinition }) {
		// Gather the list of resource that aren't tracked or are over threshold and reverse-sort them by importance
		const contents = store.store.contents
			.filter(([resource, amount]) => {
				const threshold =
					(
						isStructure(store) &&
						store.structureType === STRUCTURE_TERMINAL
					) ?
						this.getTerminalThresholdForResource(resource)
					:	undefined;
				return (
					!threshold ||
					threshold.target + threshold.tolerance <= amount
				);
			})
			.map<[ResourceConstant, number, number]>(([res, amount]) => [
				res,
				amount,
				RESOURCE_IMPORTANCE_ALL.indexOf(res),
			])
			.sort(([_aRes, _aAmt, aId], [_bRes, _bAmt, bId]) => {
				return bId - aId;
			});

		return contents.length > 0 ? contents[0][0] : undefined;
	}

	static getTerminalThresholdForResource(resource: ResourceConstant) {
		return TERMINAL_THRESHOLDS_ALL[resource];
	}

	/**
	 * Pick a storage target that would not be overflowed by incoming resources
	 */
	static targetForResource(
		colony: Colony,
		resource: ResourceConstant,
		amount: number
	) {
		let target: StructureStorage | StructureTerminal | undefined;
		// Check if the terminal is below its target
		if (colony.terminal) {
			const thresholds = TERMINAL_THRESHOLDS_ALL[resource];
			if (!thresholds) {
				log.warning(
					`${colony.print}: ${colony.terminal} doesn't want ${resource}!`
				);
			} else if (
				colony.terminal.store[resource] + amount <=
				thresholds.target
			) {
				if (
					colony.terminal &&
					colony.terminal.store[resource] + amount <=
						thresholds.target + thresholds.tolerance
				) {
					if (colony.memory.debug) {
						log.alert(
							`${colony.terminal.print} can't accept ${amount} of ${resource} without exceeding thresholds`
						);
					}
				} else {
					if (colony.memory.debug) {
						log.alert(
							`${colony.terminal.print} is below target ${thresholds} of ${resource}, accepting ${amount}`
						);
					}
					target = colony.terminal;
				}
			}
			if (ResourceManager.isOverCapacity(colony.terminal)) {
				if (colony.memory.debug) {
					log.alert(
						`${colony.terminal.print} overfilled; can't accept ${amount} of ${resource}`
					);
				}
				target = undefined;
			}
		}
		// Check storage if it's below the cap
		if (!target && colony.storage) {
			if (ResourceManager.isOverCapacity(colony.storage)) {
				if (colony.memory.debug) {
					log.alert(
						`${colony.storage.print} overfilled; can't accept ${amount} of ${resource}`
					);
				}
			} else {
				if (colony.memory.debug) {
					log.alert(
						`${colony.storage.print} accepts ${amount} of ${resource}`
					);
				}
				target = colony.storage;
			}
		}

		return target;
	}
}

// @ts-expect-error global
global.ResourceManager = ResourceManager;
