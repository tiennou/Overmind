import { Colony } from "../Colony";
import { log } from "console/log";
import { RESOURCE_IMPORTANCE_ALL } from "resources/map_resources";
import { isStructure } from "declarations/typeGuards";
import { AnyZerg } from "zerg/AnyZerg";

type ManagedResourceStructure =
	| StructureStorage
	| StructureTerminal
	| StructureFactory;

interface TerminalBalance {
	target: number;
	tolerance: number;
}

type TerminalBalanceThresholds = Thresholds<TerminalBalance>;

/** Thresholds blueprint for storage/terminal balancing */
const TERMINAL_BALANCE_THRESHOLDS: TerminalBalanceThresholds = {
	default: {
		target: 1000,
		tolerance: 1000,
	},
	dontCare: {
		target: 1000,
		tolerance: 1000,
	},
	dontWant: {
		target: 0,
		tolerance: 0,
	},
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
	intermediates: {
		target: 3500, // LAB_MINERAL_CAPACITY + 500
		tolerance: 500,
	},
	boosts: {
		target: 3500, // LAB_MINERAL_CAPACITY + 500
		tolerance: 500,
	},
	commoditiesRaw: {
		target: 5000,
		tolerance: 1000,
	},
	commodities: {
		target: 5000,
		tolerance: 500,
	},
};

/**
 * Returns the threshold for a given resource from a generic threshold repository
 * @param resource The resource
 * @param thresholds The threshold repository
 * @returns
 */
export function getThresholds<T extends object>(
	resource: ResourceConstant,
	thresholds: Thresholds<T>
): T {
	// If we have an explicit threshold for that resource, use it
	if (thresholds[resource]) {
		return thresholds[resource]!;
	}

	// All mineral compounds below
	if (Abathur.isBaseMineral(resource)) {
		// base minerals get default treatment
		return thresholds.baseMinerals ?? thresholds.default;
	}
	if (Abathur.isIntermediateReactant(resource)) {
		// reaction intermediates get default
		return thresholds.intermediates ?? thresholds.default;
	}
	if (Abathur.isBoost(resource)) {
		const tier = Abathur.getBoostTier(resource);
		if (!tier) {
			return thresholds.dontCare;
		}
		const threshold = thresholds[`boosts${tier}`];
		return threshold ?? thresholds.dontCare;
	}
	if (Abathur.isMineralOrCompound(resource)) {
		// all other boosts and resources are default
		return thresholds.default;
	}
	// Base deposit resources
	if (Abathur.isRawCommodity(resource)) {
		return thresholds.commoditiesRaw ?? thresholds.dontCare;
	}
	// Everything else should be a commodity
	if (Abathur.isCommodity(resource)) {
		const tier = Abathur.getCommodityTier(resource);
		const threshold: T | undefined = thresholds[`commoditiesT${tier}`];
		return threshold ?? thresholds.dontCare;
	}

	// Shouldn't reach here since I've handled everything above
	log.error(
		`Shouldn't reach here! Unhandled resource ${resource} in getThresholds()!`
	);
	return thresholds.dontCare;
}

/** Per-resource thresholds for storage/terminal balancing */
const TERMINAL_BALANCE_THRESHOLDS_ALL: {
	[resource: string]: { target: number; tolerance: number } | undefined;
} = _.zipObject(
	RESOURCES_ALL,
	_.map(RESOURCES_ALL, (resource) =>
		getThresholds(resource, TERMINAL_BALANCE_THRESHOLDS)
	)
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
		factory: {
			overfill: 2000,
			dump: 500,
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

	static shouldDumpResource(
		colony: Colony,
		resource: ResourceConstant,
		amount = 0
	) {
		if (colony.storage && !this.shouldDump(colony.storage)) {
			// No need to dump if our storage isn't full
			return false;
		}
		if (colony.terminal && this.shouldDump(colony.terminal)) {
			// Terminal is over dump threshold, just dump the resource
			return true;
		}
		// Otherwise check the terminal network threshold
		const threshold = Overmind.terminalNetwork.thresholds(colony, resource);
		return (
			colony.assets[resource] + amount >= (threshold.surplus ?? Infinity)
		);
	}

	/** Get the next resource that can be dumped from the given structure */
	static getNextResourceToDump(
		colony: Colony,
		target: AnyZerg | ManagedResourceStructure
	) {
		// Gather the list of resource that aren't tracked or are over threshold and reverse-sort them by importance
		const contents = target.store.contents
			.filter(([resource, amount]) => {
				return this.shouldDumpResource(
					colony,
					resource,
					!isStructure(target) ? amount : 0
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

	static getBalancedThresholdForResource(
		colony: Colony,
		resource: ResourceConstant
	) {
		return TERMINAL_BALANCE_THRESHOLDS_ALL[resource];
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
			const thresholds = TERMINAL_BALANCE_THRESHOLDS_ALL[resource];
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
			if (this.isOverCapacity(colony.terminal)) {
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
			if (this.isOverCapacity(colony.storage)) {
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

	/**
	 * Returns the remaining amount of capacity in a colony.
	 *
	 * Optionally takes an additionalAssets argument that asks whether the
	 * colony would be near capacity if additionalAssets amount of resources were added.
	 */
	static getRemainingSpace(
		colony: Colony,
		includeFactoryCapacity = false
	): number {
		let totalAssets = _.sum(colony.assets);
		// Overfilled storage gets counted as just 100% full
		if (
			colony.storage &&
			colony.storage.store.getUsedCapacity() >
				this.getSafeCapacity(colony.storage)
		) {
			totalAssets -=
				colony.storage.store.getUsedCapacity() -
				this.getSafeCapacity(colony.storage);
		}

		const roomCapacity =
			(colony.terminal ? this.getSafeCapacity(colony.terminal) : 0) +
			(colony.storage ? this.getSafeCapacity(colony.storage) : 0) +
			(colony.factory && includeFactoryCapacity ?
				this.getSafeCapacity(colony.factory)
			:	0);

		return roomCapacity - totalAssets;
	}
}

// @ts-expect-error global
global.ResourceManager = ResourceManager;
