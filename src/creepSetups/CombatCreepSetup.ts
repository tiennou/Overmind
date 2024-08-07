import { dump } from "utilities/utils";
import { Colony } from "../Colony";
import { log } from "../console/log";
import { profile } from "../profiler/decorator";
import { BoostType, CONSTRUCT, DISMANTLE, HARVEST, UPGRADE } from "../resources/map_resources";
import { Roles } from "./setups";

type PartNonMove = Exclude<BodyPartConstant, MOVE>;
export interface BodyCounts {
	move?: number;
	attack?: number;
	ranged_attack?: number;
	heal?: number;
	tough?: number;
	work?: number;
	carry?: number;
	claim?: number;
}

const allZeroParts: () => Full<BodyCounts> = () => ({
	move: 0,
	attack: 0,
	ranged_attack: 0,
	heal: 0,
	tough: 0,
	work: 0,
	carry: 0,
	claim: 0,
});

export interface BodyOpts {
	moveSpeed?: number;
	putMoveFirstInBody?: boolean;
	bodyRatio?: Omit<BodyCounts, MOVE>;
	maxParts?: Omit<BodyCounts, MOVE>;
	boosts?: BoostType[];
}

export interface SimpleBodyOpts {
	moveSpeed?: number;
	boosted?: boolean;
	armored?: boolean;
	healing?: boolean;
	withRanged?: boolean;
	bodyOpts?: BodyOpts;
}

export interface BodyGeneratorReturn {
	body: BodyPartConstant[];
	boosts: MineralBoostConstant[];
}

interface AvailableBoosts {
	attack?: MineralBoostConstant;
	carry?: MineralBoostConstant;
	ranged?: MineralBoostConstant;
	heal?: MineralBoostConstant;
	tough?: MineralBoostConstant;
	harvest?: MineralBoostConstant;
	dismantle?: MineralBoostConstant;
	upgrade?: MineralBoostConstant;
	construct?: MineralBoostConstant;
	move?: MineralBoostConstant;
}

// This re-declaration is needed to get typings to work since typed-screeps has a hard-on for over-typing things
const BOOST_EFFECTS: {
	[part: string]: { [boost: string]: { [action: string]: number } };
} = BOOSTS;

/**
 * This class creates body plans for combat creeps, especially ones where the body may depend on the available boosts.
 * It extends my old CreepSetup class for backward compatibility; going forward, I will use this class for most
 * CombatOverlord creep requests while I use the old system for standard Overlord creep requests.
 */
@profile
export class CombatCreepSetup /* extends CreepSetup */ {
	role: string;
	private bodyGenerator: (
		colony: Colony,
		opts: Full<BodyOpts>
	) => BodyGeneratorReturn;
	private opts: Full<BodyOpts>;
	private cache: {
		[colonyName: string]: {
			result: BodyGeneratorReturn;
			expiration: number;
		};
	};

	constructor(
		roleName: string,
		opts: Full<BodyOpts>,
		bodyGenerator: (
			colony: Colony,
			opts: Full<BodyOpts>
		) => BodyGeneratorReturn
	) {
		// super(roleName, {}, []);
		this.role = roleName;
		this.opts = opts;
		this.bodyGenerator = bodyGenerator;
		this.cache = {};
	}

	/**
	 * Generate the body and boosts for a requested creep
	 */
	create(colony: Colony, useCache = false): BodyGeneratorReturn {
		// If you're allowed to use a cached result (e.g. for estimating wait times), return that
		if (
			useCache &&
			this.cache[colony.name] &&
			Game.time < this.cache[colony.name].expiration
		) {
			return this.cache[colony.name].result;
		}

		// Otherwise recompute
		const result = this.bodyGenerator(colony, this.opts);
		this.cache[colony.name] = {
			result: result,
			expiration: Game.time + 20,
		};

		return result;
	}

	// /**
	//  * Here for legacy purposes to that this can extend the old CreepSetup class, but you never want to use this!
	//  */
	// generateBody(availableEnergy: number): BodyPartConstant[] {
	// 	log.error(`CombatCreepSetup.generateBody() should not be used!`);
	// 	return [];
	// }

	/**
	 * Returns an object with the best boosts available for each type of boost requested. The object will only have
	 * keys for boosts which are requested in opts.boosts and for which opts.bodyRatio has non-zero entries, and
	 * if a boost is requested but not available, the key will be present but the value will be undefined.
	 */
	private static getBestBoostsAvailable(
		colony: Colony,
		opts: Full<BodyOpts>
	): AvailableBoosts {
		const availableBoosts: AvailableBoosts = {};
		if (colony.evolutionChamber) {
			if (opts.bodyRatio.tough && opts.boosts.includes(TOUGH)) {
				const toughBoostNeeded =
					LAB_BOOST_MINERAL * (opts.maxParts.tough || 0);
				availableBoosts.tough =
					colony.evolutionChamber.bestBoostAvailable(
						TOUGH,
						toughBoostNeeded
					);
			}
			if (opts.bodyRatio.heal && opts.boosts.includes(HEAL)) {
				const healBoostNeeded =
					LAB_BOOST_MINERAL * (opts.maxParts.heal || 0);
				availableBoosts.heal =
					colony.evolutionChamber.bestBoostAvailable(
						HEAL,
						healBoostNeeded
					);
			}
			if (
				opts.bodyRatio.ranged_attack &&
				opts.boosts.includes(RANGED_ATTACK)
			) {
				const rangedBoostNeeded =
					LAB_BOOST_MINERAL * (opts.maxParts.ranged_attack || 0);
				availableBoosts.ranged =
					colony.evolutionChamber.bestBoostAvailable(
						RANGED_ATTACK,
						rangedBoostNeeded
					);
			}
			if (opts.bodyRatio.attack && opts.boosts.includes(ATTACK)) {
				const attackBoostNeeded =
					LAB_BOOST_MINERAL * (opts.maxParts.attack || 0);
				availableBoosts.attack =
					colony.evolutionChamber.bestBoostAvailable(
						ATTACK,
						attackBoostNeeded
					);
			}
			if (opts.bodyRatio.carry && opts.boosts.includes(CARRY)) {
				const carryBoostNeeded =
					LAB_BOOST_MINERAL * (opts.maxParts.carry || 0);
				availableBoosts.carry =
					colony.evolutionChamber.bestBoostAvailable(
						CARRY,
						carryBoostNeeded
					);
			}
			if (opts.bodyRatio.work && opts.boosts.includes(DISMANTLE)) {
				const dismantleBoostNeeded =
					LAB_BOOST_MINERAL * (opts.maxParts.work || 0);
				availableBoosts.dismantle =
					colony.evolutionChamber.bestBoostAvailable(
						DISMANTLE,
						dismantleBoostNeeded
					);
			}
			if (opts.bodyRatio.work && opts.boosts.includes(UPGRADE)) {
				const upgradeBoostNeeded =
					LAB_BOOST_MINERAL * (opts.maxParts.work || 0);
				availableBoosts.upgrade =
					colony.evolutionChamber.bestBoostAvailable(
						UPGRADE,
						upgradeBoostNeeded
					);
			}
			if (opts.bodyRatio.work && opts.boosts.includes(CONSTRUCT)) {
				const constructBoostNeeded =
					LAB_BOOST_MINERAL * (opts.maxParts.work || 0);
				availableBoosts.construct =
					colony.evolutionChamber.bestBoostAvailable(
						CONSTRUCT,
						constructBoostNeeded
					);
			}
			if (opts.bodyRatio.work && opts.boosts.includes(HARVEST)) {
				const harvestBoostNeeded =
					LAB_BOOST_MINERAL * (opts.maxParts.work || 0);
				availableBoosts.harvest =
					colony.evolutionChamber.bestBoostAvailable(
						HARVEST,
						harvestBoostNeeded
					);
			}
			if (opts.boosts.includes(MOVE)) {
				const moveBoostNeeded = (LAB_BOOST_MINERAL * 50) / 3; // T1 most boost lets you do move ratio of 2 : 1
				availableBoosts.move =
					colony.evolutionChamber.bestBoostAvailable(
						MOVE,
						moveBoostNeeded
					);
			}
		}
		if (
			_.sum(opts.boosts, (b) =>
				[DISMANTLE, UPGRADE, CONSTRUCT, HARVEST].includes(b) ? 1
				:	0
			) > 1
		) {
			log.warning(
				`Multiple boost types requested for work part! opts.boosts: ${dump(
					opts.boosts
				)}`
			);
		}
		return availableBoosts;
	}

	/**
	 * Generates a body counts based on a body ratio and a required move ratio (which depends on the available boosts
	 * for the generating colony). If carryPartsAreWeighted=true, all carry parts are assumed to be full for the
	 * purposes of computing move speed.
	 */
	private static generateBodyCounts(
		colony: Colony,
		opts: Full<BodyOpts>,
		moveRatio: number,
		rootPart: PartNonMove,
		partPriorities: PartNonMove[],
		unweightedCarryParts = false
	): Full<BodyCounts> {
		if (partPriorities.includes(rootPart)) {
			log.error(
				`generateBodyCounts() error: part priorities ${partPriorities} cannot ` +
					`include root part ${rootPart}`
			);
			return allZeroParts();
		}

		const bodyRatio = _.defaults<Full<BodyCounts>>(
			_.clone(opts.bodyRatio),
			allZeroParts()
		);
		const maxParts = _.defaults<Full<BodyCounts>>(
			_.clone(opts.maxParts),
			allZeroParts()
		);

		// Compute the most expensive part you may need to add to the body
		const nonZeroParts = _.filter(
			_.keys(opts.bodyRatio),
			(part) => (<{ [p: string]: number }>opts.bodyRatio)[part] > 0
		);
		const maxPartCost = _.max(
			_.map(
				nonZeroParts,
				(part) => (<{ [p: string]: number }>BODYPART_COST)[part]
			)
		);

		// Initialize body counts object
		const bodyCounts = {
			[MOVE]: 1,
			[ATTACK]: bodyRatio.attack > 0 ? 1 : 0,
			[RANGED_ATTACK]: bodyRatio.ranged_attack > 0 ? 1 : 0,
			[HEAL]: bodyRatio.heal > 0 ? 1 : 0,
			[TOUGH]: bodyRatio.tough > 0 ? 1 : 0,
			[WORK]: bodyRatio.work > 0 ? 1 : 0,
			[CARRY]: bodyRatio.carry > 0 ? 1 : 0,
			[CLAIM]: bodyRatio.claim > 0 ? 1 : 0,
		} as Full<BodyCounts>;

		// Initialize cost of starting body counts
		let cost = 0;
		// for (const part in bodyCounts) {
		for (const p in bodyCounts) {
			const part = p as BodyPartConstant;
			cost += bodyCounts[part] * BODYPART_COST[part];
		}

		// Keep adding stuff until you run out of space on the body or out of energy capacity in the room
		while (
			_.sum(bodyCounts) < MAX_CREEP_SIZE &&
			cost <= colony.room.energyCapacityAvailable - maxPartCost
		) {
			// Highest priority is add move parts to maintain the target move speed
			const weightedParts =
				unweightedCarryParts ?
					_.sum(bodyCounts) - bodyCounts.move - bodyCounts.carry
				:	_.sum(bodyCounts) - bodyCounts.move;
			if (weightedParts >= moveRatio * bodyCounts.move) {
				bodyCounts.move++;
				cost += BODYPART_COST[MOVE];
			} else {
				// If any non-root parts are below the target ratio and below the maxParts limit, add them
				let nonRootPartAdded = false;
				for (const p of partPriorities) {
					const part = p as BodyPartConstant;
					if (
						bodyCounts[part] < maxParts[part] &&
						bodyCounts[part] / bodyCounts[rootPart] <
							bodyRatio[part] / bodyRatio[rootPart]
					) {
						bodyCounts[part]++;
						cost += BODYPART_COST[part];
						nonRootPartAdded = true;
						break;
					}
				}
				// Otherwise add another root part
				if (!nonRootPartAdded) {
					bodyCounts[rootPart]++;
					cost += BODYPART_COST[rootPart];
				}
			}
		}

		return bodyCounts;
	}

	/**
	 * Generate a body array from a count of body parts. Body is ordered as:
	 * - TOUGH -> CARRY -> MOVE -> RANGED -> WORK -> ATTACK -> CLAIM -> HEAL if opts.putMoveFirstInBody is true
	 * - TOUGH -> CARRY -> RANGED -> WORK -> ATTACK -> HEAL -> CLAIM -> MOVE if opts.putMoveFirstInBody is false
	 * - The final MOVE part is always put at the end of the body array
	 */
	private static arrangeBodyParts(
		partialBodyCounts: BodyCounts,
		opts: BodyOpts
	): BodyPartConstant[] {
		const defaultCounts: Full<BodyCounts> = {
			move: 1,
			attack: 0,
			ranged_attack: 0,
			heal: 0,
			tough: 0,
			work: 0,
			carry: 0,
			claim: 0,
		};
		const bodyCounts: Full<BodyCounts> = _.defaults(
			partialBodyCounts,
			defaultCounts
		);

		const body: BodyPartConstant[] = [];
		_.forEach(_.range(bodyCounts.tough), () => body.push(TOUGH));
		if (opts.putMoveFirstInBody) {
			_.forEach(_.range(bodyCounts.carry), () => body.push(CARRY));
			_.forEach(_.range(bodyCounts.move - 1), () => body.push(MOVE));
			_.forEach(_.range(bodyCounts.ranged_attack), () =>
				body.push(RANGED_ATTACK)
			);
			_.forEach(_.range(bodyCounts.work), () => body.push(WORK));
			_.forEach(_.range(bodyCounts.attack), () => body.push(ATTACK));
			_.forEach(_.range(bodyCounts.claim), () => body.push(CLAIM));
			_.forEach(_.range(bodyCounts.heal), () => body.push(HEAL));
		} else {
			_.forEach(_.range(bodyCounts.carry), () => body.push(CARRY));
			_.forEach(_.range(bodyCounts.ranged_attack), () =>
				body.push(RANGED_ATTACK)
			);
			_.forEach(_.range(bodyCounts.work), () => body.push(WORK));
			_.forEach(_.range(bodyCounts.attack), () => body.push(ATTACK));
			_.forEach(_.range(bodyCounts.claim), () => body.push(CLAIM));
			_.forEach(_.range(bodyCounts.move - 1), () => body.push(MOVE));
			_.forEach(_.range(bodyCounts.heal), () => body.push(HEAL));
		}
		body.push(MOVE);
		return body;
	}

	/**
	 * Creates a body plan for a creep with body ratios based around melee attack parts. The method will try to create
	 * the largest creep which can be spawned from a colony, which has a target move speed after the best available
	 * requested move boosts are applied, which has a body ratio specified by opts.bodyRatio, and where max part
	 * counts are capped by opts.maxParts.
	 */
	static generateMeleeAttackerBody(
		colony: Colony,
		opts: Full<BodyOpts>
	): BodyGeneratorReturn {
		if (!opts.bodyRatio.attack) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; No attack!`);
			return { body: [], boosts: [] };
		}
		if (opts.bodyRatio.work) {
			log.error(
				`Bad opts.bodyRatio: ${opts.bodyRatio}; using work parts requires dismantler body!`
			);
			return { body: [], boosts: [] };
		}
		if (opts.bodyRatio.ranged_attack) {
			log.error(
				`Bad opts.bodyRatio: ${opts.bodyRatio}; using ranged parts requires ranged body!`
			);
			return { body: [], boosts: [] };
		}

		const DEFAULT_MAX_PARTS_MELEE = { attack: 50, tough: 10, heal: 2 };
		opts.maxParts.attack =
			opts.maxParts.attack || DEFAULT_MAX_PARTS_MELEE.attack;
		opts.maxParts.tough =
			opts.maxParts.tough || DEFAULT_MAX_PARTS_MELEE.tough;
		opts.maxParts.heal = opts.maxParts.heal || DEFAULT_MAX_PARTS_MELEE.heal;

		const availableBoosts = CombatCreepSetup.getBestBoostsAvailable(
			colony,
			opts
		);

		if (!availableBoosts.tough) {
			// no point in adding tough parts if they can't be boosted
			opts.bodyRatio.tough = 0;
		}

		const moveRatio =
			(availableBoosts.move ?
				BOOST_EFFECTS.move[availableBoosts.move].fatigue
			:	1) * opts.moveSpeed;

		// We need attack to be defined for bodyRatio and maxParts
		opts.bodyRatio.attack = opts.bodyRatio.attack || 1;
		opts.bodyRatio.tough = opts.bodyRatio.tough || 0;
		opts.bodyRatio.heal = opts.bodyRatio.heal || 0;

		const rootPart: PartNonMove = ATTACK;
		const partPriorities: PartNonMove[] = [TOUGH, HEAL];
		const bodyCounts = CombatCreepSetup.generateBodyCounts(
			colony,
			opts,
			moveRatio,
			rootPart,
			partPriorities
		);

		const body = CombatCreepSetup.arrangeBodyParts(bodyCounts, opts);
		const boosts = _.compact(
			_.values<MineralBoostConstant>(availableBoosts)
		);
		return { body: body, boosts: boosts };
	}

	/**
	 * Creates a body plan for a creep with body ratios based around ranged attack parts. The method will try to create
	 * the largest creep which can be spawned from a colony, which has a target move speed after the best available
	 * requested move boosts are applied, which has a body ratio specified by opts.bodyRatio, and where max part
	 * counts are capped by opts.maxParts.
	 */
	static generateRangedAttackerBody(
		colony: Colony,
		opts: Full<BodyOpts>
	): BodyGeneratorReturn {
		if (!opts.bodyRatio.ranged_attack) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; No ranged!`);
			return { body: [], boosts: [] };
		}
		if (opts.bodyRatio.work) {
			log.error(
				`Bad opts.bodyRatio: ${opts.bodyRatio}; using work parts requires dismantler body!`
			);
			return { body: [], boosts: [] };
		}
		if (opts.bodyRatio.attack) {
			log.error(
				`Bad opts.bodyRatio: ${opts.bodyRatio}; using ranged parts requires melee body!`
			);
			return { body: [], boosts: [] };
		}

		const DEFAULT_MAX_PARTS_RANGED = { ranged: 40, tough: 10, heal: 20 };
		opts.maxParts.ranged_attack ??= DEFAULT_MAX_PARTS_RANGED.ranged;
		opts.maxParts.tough ??= DEFAULT_MAX_PARTS_RANGED.tough;
		opts.maxParts.heal ??= DEFAULT_MAX_PARTS_RANGED.heal;

		const availableBoosts = CombatCreepSetup.getBestBoostsAvailable(
			colony,
			opts
		);

		if (!availableBoosts.tough) {
			// no point in adding tough parts if they can't be boosted
			opts.bodyRatio.tough = 0;
		}

		const moveRatio =
			(availableBoosts.move ?
				BOOST_EFFECTS.move[availableBoosts.move].fatigue
			:	1) * opts.moveSpeed;

		// We need ranged to be defined for bodyRatio and maxParts
		opts.bodyRatio.ranged_attack ??= 1;

		const rootPart: PartNonMove = RANGED_ATTACK;
		const partPriorities: PartNonMove[] = [TOUGH, HEAL];
		const bodyCounts = CombatCreepSetup.generateBodyCounts(
			colony,
			opts,
			moveRatio,
			rootPart,
			partPriorities
		);

		const body = CombatCreepSetup.arrangeBodyParts(bodyCounts, opts);
		const boosts = _.compact<MineralBoostConstant>(
			_.values(availableBoosts)
		);
		return { body: body, boosts: boosts };
	}

	/**
	 * Creates a body plan for a creep with body ratios based around heal parts. The method will try to create
	 * the largest creep which can be spawned from a colony, which has a target move speed after the best available
	 * requested move boosts are applied, which has a body ratio specified by opts.bodyRatio, and where max part
	 * counts are capped by opts.maxParts.
	 */
	static generateHealerBody(
		colony: Colony,
		opts: Full<BodyOpts>
	): BodyGeneratorReturn {
		if (!opts.bodyRatio.heal) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; No heal!`);
			return { body: [], boosts: [] };
		}
		if (opts.bodyRatio.work) {
			log.error(
				`Bad opts.bodyRatio: ${opts.bodyRatio}; using work parts requires dismantler body!`
			);
			return { body: [], boosts: [] };
		}
		if (opts.bodyRatio.attack) {
			log.error(
				`Bad opts.bodyRatio: ${opts.bodyRatio}; using ranged parts requires melee body!`
			);
			return { body: [], boosts: [] };
		}

		const DEFAULT_MAX_PARTS_HEAL = { heal: 40, tough: 10, ranged: 30 };
		opts.maxParts.heal ??= DEFAULT_MAX_PARTS_HEAL.heal;
		opts.maxParts.ranged_attack ??= DEFAULT_MAX_PARTS_HEAL.ranged;
		opts.maxParts.tough ??= DEFAULT_MAX_PARTS_HEAL.tough;

		const availableBoosts = CombatCreepSetup.getBestBoostsAvailable(
			colony,
			opts
		);

		if (!availableBoosts.tough) {
			// no point in adding tough parts if they can't be boosted
			opts.bodyRatio.tough = 0;
		}

		const moveRatio =
			(availableBoosts.move ?
				BOOST_EFFECTS.move[availableBoosts.move].fatigue
			:	1) * opts.moveSpeed;

		// We need heal to be defined for bodyRatio and maxParts
		opts.bodyRatio.heal = opts.bodyRatio.heal || 1;

		const rootPart: PartNonMove = HEAL;
		const partPriorities: PartNonMove[] = [TOUGH, RANGED_ATTACK];
		const bodyCounts = CombatCreepSetup.generateBodyCounts(
			colony,
			opts,
			moveRatio,
			rootPart,
			partPriorities
		);

		const body = CombatCreepSetup.arrangeBodyParts(bodyCounts, opts);
		const boosts = _.compact<MineralBoostConstant>(
			_.values(availableBoosts)
		);
		return { body: body, boosts: boosts };
	}

	/**
	 * Creates a body plan for a creep with body ratios based around work parts. The method will try to create
	 * the largest creep which can be spawned from a colony, which has a target move speed after the best available
	 * requested move boosts are applied, which has a body ratio specified by opts.bodyRatio, and where max part
	 * counts are capped by opts.maxParts.
	 */
	static generateDismantlerBody(
		colony: Colony,
		opts: Full<BodyOpts>
	): BodyGeneratorReturn {
		if (!opts.bodyRatio.work) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; No dismantle!`);
			return { body: [], boosts: [] };
		}
		if (opts.bodyRatio.attack) {
			log.error(
				`Bad opts.bodyRatio: ${opts.bodyRatio}; using attack parts requires melee body!`
			);
			return { body: [], boosts: [] };
		}

		const DEFAULT_MAX_PARTS_DISMANTLER = {
			work: 40,
			tough: 10,
			ranged: 10,
			heal: 2,
		};
		opts.maxParts.work =
			opts.maxParts.work || DEFAULT_MAX_PARTS_DISMANTLER.work;
		opts.maxParts.ranged_attack ??= DEFAULT_MAX_PARTS_DISMANTLER.ranged;
		opts.maxParts.tough ??= DEFAULT_MAX_PARTS_DISMANTLER.tough;
		opts.maxParts.heal ??= DEFAULT_MAX_PARTS_DISMANTLER.heal;

		const availableBoosts = CombatCreepSetup.getBestBoostsAvailable(
			colony,
			opts
		);

		if (!availableBoosts.tough) {
			// no point in adding tough parts if they can't be boosted
			opts.bodyRatio.tough = 0;
		}

		const moveRatio =
			(availableBoosts.move ?
				BOOST_EFFECTS.move[availableBoosts.move].fatigue
			:	1) * opts.moveSpeed;

		// We need work to be defined for bodyRatio and maxParts
		opts.bodyRatio.work = opts.bodyRatio.work || 1;

		const rootPart: PartNonMove = WORK;
		const partPriorities: PartNonMove[] = [TOUGH, RANGED_ATTACK, HEAL];
		const bodyCounts = CombatCreepSetup.generateBodyCounts(
			colony,
			opts,
			moveRatio,
			rootPart,
			partPriorities
		);

		const body = CombatCreepSetup.arrangeBodyParts(bodyCounts, opts);
		const boosts = _.compact<MineralBoostConstant>(
			_.values(availableBoosts)
		);
		return { body: body, boosts: boosts };
	}

	/**
	 * Creates a body plan for a creep with body ratios based around work parts. Move speed for this method
	 * assumes that all carry parts are empty, as you won't move an upgrader with energy. The method will try to create
	 * the largest creep which can be spawned from a colony, which has a target move speed after the best available
	 * requested move boosts are applied, which has a body ratio specified by opts.bodyRatio, and where max part
	 * counts are capped by opts.maxParts.
	 */
	static generateUpgraderBody(
		colony: Colony,
		opts: Full<BodyOpts>
	): BodyGeneratorReturn {
		if (!opts.bodyRatio.work) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; No dismantle!`);
			return { body: [], boosts: [] };
		}

		const DEFAULT_MAX_PARTS_UPGRADER = {
			work: 50,
			tough: 10,
			carry: 20,
			heal: 2,
		};
		opts.maxParts.work =
			opts.maxParts.work || DEFAULT_MAX_PARTS_UPGRADER.work;
		opts.maxParts.tough =
			opts.maxParts.tough || DEFAULT_MAX_PARTS_UPGRADER.tough;
		opts.maxParts.carry =
			opts.maxParts.carry || DEFAULT_MAX_PARTS_UPGRADER.carry;
		opts.maxParts.heal =
			opts.maxParts.heal || DEFAULT_MAX_PARTS_UPGRADER.heal;

		const availableBoosts = CombatCreepSetup.getBestBoostsAvailable(
			colony,
			opts
		);

		if (!availableBoosts.tough) {
			// no point in adding tough parts if they can't be boosted
			opts.bodyRatio.tough = 0;
		}

		const moveRatio =
			(availableBoosts.move ?
				BOOST_EFFECTS.move[availableBoosts.move].fatigue
			:	1) * opts.moveSpeed;

		// We need work to be defined for bodyRatio and maxParts
		opts.bodyRatio.work = opts.bodyRatio.work || 1;

		const rootPart: PartNonMove = WORK;
		const partPriorities: PartNonMove[] = [TOUGH, CARRY, HEAL];
		const bodyCounts = CombatCreepSetup.generateBodyCounts(
			colony,
			opts,
			moveRatio,
			rootPart,
			partPriorities,
			true
		);

		const body = CombatCreepSetup.arrangeBodyParts(bodyCounts, opts);
		const boosts = _.compact<MineralBoostConstant>(
			_.values(availableBoosts)
		);
		return { body: body, boosts: boosts };
	}

	/**
	 * Creates a body plan for a creep with body ratios based around carry parts. The method will try to create
	 * the largest creep which can be spawned from a colony, which has a target move speed after the best available
	 * requested move boosts are applied, which has a body ratio specified by opts.bodyRatio, and where max part
	 * counts are capped by opts.maxParts.
	 */
	static generateCarrierBody(
		colony: Colony,
		opts: Full<BodyOpts>
	): BodyGeneratorReturn {
		if (!opts.bodyRatio.carry) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; No carry!`);
			return { body: [], boosts: [] };
		}

		const DEFAULT_MAX_PARTS_CARRIER = { carry: 50, tough: 10, heal: 3 };
		opts.maxParts.carry =
			opts.maxParts.attack || DEFAULT_MAX_PARTS_CARRIER.carry;
		opts.maxParts.tough =
			opts.maxParts.tough || DEFAULT_MAX_PARTS_CARRIER.tough;
		opts.maxParts.heal =
			opts.maxParts.heal || DEFAULT_MAX_PARTS_CARRIER.heal;

		const availableBoosts = CombatCreepSetup.getBestBoostsAvailable(
			colony,
			opts
		);

		if (!availableBoosts.tough) {
			// no point in adding tough parts if they can't be boosted
			opts.bodyRatio.tough = 0;
		}

		const moveRatio =
			(availableBoosts.move ?
				BOOST_EFFECTS.move[availableBoosts.move].fatigue
			:	1) * opts.moveSpeed;

		// We need carry to be defined for bodyRatio and maxParts
		opts.bodyRatio.carry = opts.bodyRatio.carry || 1;
		opts.bodyRatio.tough = opts.bodyRatio.tough || 0;
		opts.bodyRatio.heal = opts.bodyRatio.heal || 0;

		const rootPart: PartNonMove = CARRY;
		const partPriorities: PartNonMove[] = [TOUGH, HEAL];
		const bodyCounts = CombatCreepSetup.generateBodyCounts(
			colony,
			opts,
			moveRatio,
			rootPart,
			partPriorities
		);

		const body = CombatCreepSetup.arrangeBodyParts(bodyCounts, opts);
		const boosts = _.compact<MineralBoostConstant>(
			_.values(availableBoosts)
		);
		return { body: body, boosts: boosts };
	}
}

/**
 * Creates a body for a zergling (melee attacker). Takes an object of possible options:
 * - If opts.boosted is true, all parts are requested to be boosted
 * - If opts.armored is true, a 3:1 attack:tough ratio will be used up to 10 tough parts
 * - If opts.healing is true, up to 2 heal parts will be added
 * - Specifying opts.bodyOpts may override any of the behaviors above
 */
export class ZerglingSetup extends CombatCreepSetup {
	constructor(opts: SimpleBodyOpts = {}) {
		_.defaults(opts, {
			moveSpeed: 1,
			boosted: false,
			armored: false,
			healing: false,
			bodyOpts: {},
		});
		const zerglingBodyOpts: Full<BodyOpts> = {
			moveSpeed: opts.moveSpeed || 1,
			putMoveFirstInBody: true,
			bodyRatio: {
				attack: 30,
				tough: opts.armored ? 10 : 0,
				heal: opts.healing ? 2 : 0,
			},
			maxParts: { attack: 50, tough: 10, heal: 2 },
			boosts: opts.boosted ? [ATTACK, TOUGH, HEAL, MOVE] : [],
		};
		const bodyOpts: Full<BodyOpts> = _.defaults(
			opts.bodyOpts || {},
			zerglingBodyOpts
		);
		super(Roles.melee, bodyOpts, (c, o) =>
			CombatCreepSetup.generateMeleeAttackerBody(c, o)
		);
	}
}

/**
 * Creates a body for a hydralisk (ranged attacker which may have some healing). Possible optoins:
 * - If opts.boosted is true, all parts are requested to be boosted
 * - If opts.armored is true, a 4:1 ranged:tough ratio will be used up to 8 tough parts
 * - If opts.healing is true (default), a 3:1 ranged:heal ratio will be used up to 10 heal parts
 * - Specifying opts.bodyOpts may override any of the behaviors above
 */
export class HydraliskSetup extends CombatCreepSetup {
	constructor(opts: SimpleBodyOpts = {}) {
		_.defaults(opts, {
			moveSpeed: 1,
			boosted: false,
			armored: false,
			healing: true,
			bodyOpts: {},
		});
		const hydraliskBodyOpts: Full<BodyOpts> = {
			moveSpeed: opts.moveSpeed || 1,
			putMoveFirstInBody: false,
			bodyRatio: {
				ranged_attack: 12,
				tough: opts.armored ? 3 : 0,
				heal: opts.healing ? 4 : 0,
			},
			maxParts: { ranged_attack: 30, tough: 8, heal: 10 },
			boosts: opts.boosted ? [RANGED_ATTACK, TOUGH, HEAL, MOVE] : [],
		};
		const bodyOpts: Full<BodyOpts> = _.defaults(
			opts.bodyOpts || {},
			hydraliskBodyOpts
		);
		super(Roles.ranged, bodyOpts, (c, o) =>
			CombatCreepSetup.generateRangedAttackerBody(c, o)
		);
	}
}

/**
 * Creates a body for a transfuser (healer which may have some ranged attack parts). Possible optoins:
 * - If opts.boosted is true, all parts are requested to be boosted
 * - If opts.armored is true, a 4:1 heal:tough ratio will be used up to 8 tough parts
 * - If opts.withRanged is true, a 3:1 heal:ranged ratio will be used up to 10 ranged parts
 * - Specifying opts.bodyOpts may override any of the behaviors above
 */
export class TransfuserSetup extends CombatCreepSetup {
	constructor(opts: SimpleBodyOpts = {}) {
		_.defaults(opts, {
			moveSpeed: 1,
			boosted: false,
			armored: false,
			withRanged: false,
			bodyOpts: {},
		});
		const healerBodyOpts: Full<BodyOpts> = {
			moveSpeed: opts.moveSpeed || 1,
			putMoveFirstInBody: false,
			bodyRatio: {
				heal: 12,
				tough: opts.armored ? 3 : 0,
				ranged_attack: opts.withRanged ? 4 : 0,
			},
			maxParts: { heal: 30, tough: 8, ranged_attack: 10 },
			boosts: opts.boosted ? [RANGED_ATTACK, TOUGH, HEAL, MOVE] : [],
		};
		const bodyOpts: Full<BodyOpts> = _.defaults(
			opts.bodyOpts || {},
			healerBodyOpts
		);
		super(Roles.healer, bodyOpts, (c, o) =>
			CombatCreepSetup.generateHealerBody(c, o)
		);
	}
}

/**
 * Creates a body for a lurker (dismantler which may have some ranged or healing). Possible optoins:
 * - If opts.boosted is true, all parts are requested to be boosted
 * - If opts.armored is true, a 4:1 work:tough ratio will be used up to 10 tough parts
 * - If opts.withRanged is true, a 3:1 work:ranged ratoi will be used up to 10 ranged parts
 * - If opts.healing is true, up to 2 heal parts may be added
 * - Specifying opts.bodyOpts may override any of the behaviors above
 */
export class LurkerSetup extends CombatCreepSetup {
	constructor(opts: SimpleBodyOpts = {}) {
		_.defaults(opts, {
			moveSpeed: 1,
			boosted: false,
			armored: false,
			healing: false,
			bodyOpts: {},
		});
		const lurkerBodyOptions: Full<BodyOpts> = {
			moveSpeed: opts.moveSpeed || 1,
			putMoveFirstInBody: false,
			bodyRatio: {
				work: 24,
				tough: opts.armored ? 6 : 0,
				ranged_attack: opts.withRanged ? 8 : 0,
				heal: opts.healing ? 2 : 0,
			},
			maxParts: { work: 30, tough: 10, ranged_attack: 10, heal: 2 },
			boosts:
				opts.boosted ?
					[DISMANTLE, RANGED_ATTACK, TOUGH, HEAL, MOVE]
				:	[],
		};
		const bodyOpts: Full<BodyOpts> = _.defaults(
			opts.bodyOpts || {},
			lurkerBodyOptions
		);
		super(Roles.dismantler, bodyOpts, (c, o) =>
			CombatCreepSetup.generateDismantlerBody(c, o)
		);
	}
}

/**
 * Creates a body for a ravager (melee bunker defender with 0.5 move speed). Takes an object of possible options:
 * - If opts.boosted is true, all parts are requested to be boosted
 * - If opts.armored is true, a 3:1 attack:tough ratio will be used up to 10 tough parts
 * - If opts.healing is true, up to 2 heal parts will be added
 * - Specifying opts.bodyOpts may override any of the behaviors above
 */
export class RavagerSetup extends CombatCreepSetup {
	constructor(opts: SimpleBodyOpts = {}) {
		_.defaults(opts, {
			moveSpeed: 0.5,
			boosted: false,
			armored: false,
			healing: false,
			bodyOpts: {},
		});
		const ravagerBodyDefaults: Full<BodyOpts> = {
			moveSpeed: opts.moveSpeed || 0.5,
			putMoveFirstInBody: true,
			bodyRatio: {
				attack: 30,
				tough: opts.armored ? 10 : 0,
				heal: opts.healing ? 2 : 0,
			},
			maxParts: { attack: 50, tough: 10, heal: 2 },
			boosts: opts.boosted ? [ATTACK, TOUGH, HEAL, MOVE] : [],
		};
		const bodyOpts: Full<BodyOpts> = _.defaults(
			opts.bodyOpts || {},
			ravagerBodyDefaults
		);
		super(Roles.bunkerDefender, bodyOpts, (c, o) =>
			CombatCreepSetup.generateMeleeAttackerBody(c, o)
		);
	}
}

/**
 * Creates a body for a remote upgrader. Possible optoins:
 * - If opts.boosted is true, all parts are requested to be boosted to max level
 * - Specifying opts.bodyOpts may override any of the behaviors above
 */
export class RemoteUpgraderSetup extends CombatCreepSetup {
	constructor(opts: SimpleBodyOpts = {}) {
		_.defaults(opts, { moveSpeed: 1, boosted: false, bodyOpts: {} });
		const remoteUpgraderBodyOptions: Full<BodyOpts> = {
			moveSpeed: opts.moveSpeed || 1,
			putMoveFirstInBody: false,
			bodyRatio: { work: 8, carry: 1 },
			maxParts: { work: 40, carry: 10 },
			boosts: opts.boosted ? [UPGRADE, CARRY, MOVE] : [],
		};
		const bodyOpts: Full<BodyOpts> = _.defaults(
			opts.bodyOpts || {},
			remoteUpgraderBodyOptions
		);
		super(Roles.upgrader, bodyOpts, (c, o) =>
			CombatCreepSetup.generateUpgraderBody(c, o)
		);
	}
}

/**
 * Creates a body for a remote upgrader. Possible optoins:
 * - If opts.boosted is true, all parts are requested to be boosted to max level
 * - If opts.healing is true, up to 2 heal part will be added
 * - Specifying opts.bodyOpts may override any of the behaviors above
 */
export class CarrierSetup extends CombatCreepSetup {
	constructor(opts: SimpleBodyOpts = {}) {
		_.defaults(opts, {
			moveSpeed: 1,
			boosted: false,
			healing: false,
			bodyOpts: {},
		});
		const carrierBodyOptions: Full<BodyOpts> = {
			moveSpeed: opts.moveSpeed || 1,
			putMoveFirstInBody: false,
			bodyRatio: { carry: 1, heal: opts.healing ? 0.01 : 0 },
			maxParts: { carry: 40, heal: opts.healing ? 1 : 0 },
			boosts: opts.boosted ? [CARRY, MOVE, HEAL] : [],
		};
		const bodyOpts: Full<BodyOpts> = _.defaults(
			opts.bodyOpts || {},
			carrierBodyOptions
		);
		super(Roles.transport, bodyOpts, (c, o) =>
			CombatCreepSetup.generateCarrierBody(c, o)
		);
	}
}

global.CombatCreepSetup = CombatCreepSetup;
global.DefaultCombatCreepSetups = {
	zergling: ZerglingSetup,
	hydralisk: HydraliskSetup,
	transfuser: TransfuserSetup,
	lurker: LurkerSetup,
	ravager: RavagerSetup,
	remoteUpgrader: RemoteUpgraderSetup,
	carrier: CarrierSetup,
};
