// Combat Intel - provides information related to making combat-related decisions

import { RANGES } from "zerg/ranges";
import { Colony } from "../Colony";
import { log } from "../console/log";
import {
	isAnyZerg,
	isCreep,
	isOwnedStructure,
	isStandardZerg,
	isStructure,
} from "../declarations/typeGuards";
import { Directive } from "../directives/Directive";
import { Mem } from "../memory/Memory";
import { Pathing } from "../movement/Pathing";
import { profile } from "../profiler/decorator";
import {
	BOOST_TIERS,
	BoostModifier,
	BoostType,
	BoostTypeBodyparts,
	BoostTypeToBoostArray,
	CONSTRUCT,
	DISMANTLE,
} from "../resources/map_resources";
import { Cartographer } from "../utilities/Cartographer";
import { Visualizer } from "../visuals/Visualizer";
import { toCreep, Zerg } from "../zerg/Zerg";
import { RoomIntel } from "./RoomIntel";
import { BodyGeneratorReturn } from "creepSetups/CombatCreepSetup";

interface CombatIntelMemory {
	cache: {
		tick: number;
	};
}

const getDefaultCombatIntelMemory: () => CombatIntelMemory = () => ({
	cache: {
		tick: Game.time,
	},
});

export interface CombatPotentials {
	attack: number;
	ranged: number;
	heal: number;
	dismantle?: number;
}

@profile
export class CombatIntel {
	directive: Directive;

	constructor(directive: Directive) {
		this.directive = directive;
	}

	get memory(): CombatIntelMemory {
		return Mem.wrap(
			this.directive.memory,
			"combatIntel",
			getDefaultCombatIntelMemory
		);
	}

	get room(): Room | undefined {
		return this.directive.room;
	}

	get colony(): Colony {
		return this.directive.colony;
	}

	// Tower damage ====================================================================================================

	/**
	 * Get the tower damage at a given range
	 */
	static singleTowerDamage(range: number): number {
		if (range <= TOWER_OPTIMAL_RANGE) {
			return TOWER_POWER_ATTACK;
		}
		range = Math.min(range, TOWER_FALLOFF_RANGE);
		const falloff =
			(range - TOWER_OPTIMAL_RANGE) /
			(TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
		return TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF * falloff);
	}

	/**
	 * Total tower damage from all towers in room at a given position
	 */
	static towerDamageAtPos(pos: RoomPosition, ignoreEnergy = false): number {
		if (pos.room) {
			let expectedDamage = 0;
			for (const tower of pos.room.towers) {
				if (tower.store[RESOURCE_ENERGY] > 0 || ignoreEnergy) {
					expectedDamage += this.singleTowerDamage(
						pos.getRangeTo(tower)
					);
				}
			}
			return expectedDamage;
		}

		const structs = RoomIntel.getImportantStructureInfo(pos.roomName);
		if (!structs) {
			log.warning(
				`CombatIntel.towerDamageAtPos: room visibility at ${pos.print}!`
			);
			return 0;
		}

		let expectedDamage = 0;
		for (const tower of structs.towerPositions) {
			expectedDamage += this.singleTowerDamage(pos.getRangeTo(tower));
		}
		return expectedDamage;
	}

	// Cost matrix calculations

	private computeCostMatrix(): CostMatrix | undefined {
		if (this.room) {
			const matrix = new PathFinder.CostMatrix();
			const barriers = this.room.barriers;
			if (barriers.length > 0) {
				const highestHits = _.last(
					_.sortBy(barriers, (barrier) => barrier.hits)
				).hits;
				for (const barrier of barriers) {
					matrix.set(
						barrier.pos.x,
						barrier.pos.y,
						Math.ceil((barrier.hits * 10) / highestHits) * 10
					);
				}
			}
			return matrix;
		}
	}

	/**
	 * Calculates the total potential damage per tile in a region
	 */
	static computeCreepDamagePotentialMatrix(
		room: Room,
		creeps: Creep[],
		startingMatrix?: CostMatrix
	): CostMatrix | undefined {
		if (room) {
			const cpuUsed = Game.cpu.getUsed();
			const matrix = startingMatrix || new PathFinder.CostMatrix();

			// const otherMatrix = new Array(50);
			// otherMatrix.forEach((loc, index) => otherMatrix[index] = new Array(50));

			creeps.forEach((creep) => {
				const meleeAttack = CombatIntel.getAttackPotential(creep);
				const rangedAttack =
					CombatIntel.getRangedAttackPotential(creep);
				// const heal = CombatIntel.getHealPotential(creep);
				if (meleeAttack > 0) {
					creep.pos.neighbors.forEach((pos) =>
						matrix.set(
							pos.x,
							pos.y,
							matrix.get(pos.x, pos.y) +
								(meleeAttack * ATTACK_POWER) / 100
						)
					);
				}
				if (rangedAttack > 0) {
					creep.pos
						.getPositionsInRange(3)
						.forEach((pos) =>
							matrix.set(
								pos.x,
								pos.y,
								matrix.get(pos.x, pos.y) +
									(rangedAttack * RANGED_ATTACK_POWER) / 100
							)
						);
				}
			});

			Visualizer.displayCostMatrix(matrix, room.name);
			console.log(
				`Cost matrix cpu used in ${room.print} = ${
					Game.cpu.getUsed() - cpuUsed
				}`
			);
			return matrix;
		}
	}

	/**
	 * Calculates potential damage and heal per location in a region
	 */
	static computeTotalCreepPotentialMatrix(
		room: Room,
		creeps: Creep[],
		startingMatrix?: CostMatrix
	): CostMatrix | undefined {
		if (room) {
			const cpuUsed = Game.cpu.getUsed();
			const matrix = startingMatrix || new PathFinder.CostMatrix();

			// const otherMatrix = new Array(50);
			// otherMatrix.forEach((loc, index) => otherMatrix[index] = new Array(50));

			creeps.forEach((creep) => {
				const meleeAttack = CombatIntel.getAttackPotential(creep);
				const rangedAttack =
					CombatIntel.getRangedAttackPotential(creep);
				// const heal = CombatIntel.getHealPotential(creep);
				if (meleeAttack > 0) {
					creep.pos.neighbors.forEach((pos) =>
						matrix.set(
							pos.x,
							pos.y,
							matrix.get(pos.x, pos.y) +
								(meleeAttack * ATTACK_POWER) / 100
						)
					);
				}
				if (rangedAttack > 0) {
					creep.pos
						.getPositionsInRange(3)
						.forEach((pos) =>
							matrix.set(
								pos.x,
								pos.y,
								matrix.get(pos.x, pos.y) +
									(rangedAttack * RANGED_ATTACK_POWER) / 100
							)
						);
				}
			});

			Visualizer.displayCostMatrix(matrix, room.name);
			console.log(
				`Cost matrix cpu used in ${room.print} = ${
					Game.cpu.getUsed() - cpuUsed
				}`
			);
			return matrix;
		}
	}

	// Fallback and exit calculations ==================================================================================

	private findBestExit(
		matrix: CostMatrix,
		towers: StructureTower[],
		_spawns: StructureSpawn[]
	): RoomPosition | undefined {
		if (!this.room) {
			return;
		}
		let bestExit: RoomPosition | undefined;
		const destination = this.room.spawns[0] || this.room.storage; // enemy structure you are trying to get to
		if (!destination) {
			return;
		}
		const ret = Pathing.findPath(this.colony.pos, destination.pos, {
			range: 1,
		});
		if (!ret.incomplete) {
			bestExit = _.find(ret.path, (p) => p.roomName == this.room!.name);
		}

		// Figure out possible exits to go from enemy room back to colony in a reasonable amount of time
		const maxRoomDistance = 8;
		const allowedExits: { [direction: string]: boolean } = {};
		if (!bestExit) {
			const exitData = Cartographer.describeExits(this.room.name);
			for (const direction in exitData) {
				const roomName = exitData[
					<"1" | "3" | "5" | "7">direction
				] as string;
				const allowedRooms = Pathing.findRoute(
					this.colony.name,
					roomName
				);
				if (
					allowedRooms &&
					Object.keys(allowedRooms).length <= maxRoomDistance
				) {
					allowedExits[direction] = true;
				}
			}
			if (_.keys(allowedExits).length == 0) {
				return;
			}
		}

		const exitPositions: RoomPosition[] = [];
		const terrain = Game.map.getRoomTerrain(this.room.name);

		for (let x = 0; x < 50; x += 49) {
			for (let y = 0; y < 50; y++) {
				if (x !== 0 && y !== 0 && x !== 49 && y !== 49) {
					continue;
				}
				if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
					continue;
				}
				matrix.set(x, y, 0xff);
				if (bestExit) {
					continue;
				}
				if (allowedExits["1"] && y === 0) {
					exitPositions.push(new RoomPosition(x, y, this.room.name));
				} else if (allowedExits["3"] && x === 49) {
					exitPositions.push(new RoomPosition(x, y, this.room.name));
				} else if (allowedExits["5"] && y === 49) {
					exitPositions.push(new RoomPosition(x, y, this.room.name));
				} else if (allowedExits["7"] && x === 0) {
					exitPositions.push(new RoomPosition(x, y, this.room.name));
				}
			}
		}

		if (!bestExit) {
			bestExit = _(exitPositions)
				.sortBy(
					(p: RoomPosition) =>
						-_.sum(towers, (t: Structure) => p.getRangeTo(t))
				)
				.head();
		}
		matrix.set(bestExit.x, bestExit.y, 1);

		return bestExit;
	}

	// static findBestSiegeExit(roomName: string, matrix?: CostMatrix): RoomPosition | undefined  {
	// 	let edgeCoords: [number, number][] = [];
	// 	for (let x = 0; x < 50; x += 49) {
	// 		for (let y = 0; y < 50; y++) {
	// 			edgeCoords.push([x,y])
	// 		}
	// 	}
	// 	for (let x = 0; x < 50; x++) {
	// 		for (let y = 0; y < 50; y += 49) {
	// 			edgeCoords.push([x,y])
	// 		}
	// 	}
	//
	// 	const room = Game.rooms[roomName];
	// 	let siegeTarget = CombatTargeting.findBestStructureTarget()
	// }

	/**
	 * Simple routine to find an assembly point outside of the target room
	 */
	findSimpleSiegeFallback(): RoomPosition {
		const ret = Pathing.findPath(this.colony.pos, this.directive.pos, {
			range: 23,
		});
		if (ret.incomplete) {
			log.warning(
				`Incomplete path while finding fallback! Destination: ${this.directive.pos.print}`
			);
		}
		const firstPosInRoom = _.find(
			ret.path,
			(pos) => pos.roomName == this.directive.pos.roomName
		);
		if (firstPosInRoom) {
			return CombatIntel.getFallbackFrom(firstPosInRoom);
		} else {
			return CombatIntel.getFallbackFrom(this.directive.pos);
		}
	}

	/**
	 * Finds a location for a swarm to assemble outside of the target room
	 */
	findSwarmAssemblyPoint(
		clearance: { width: number; height: number },
		swarmIndex = 0
	): RoomPosition {
		const simpleFallback = this.findSimpleSiegeFallback();
		const startPos = Pathing.findPathablePosition(
			simpleFallback.roomName,
			clearance
		);
		let ret = Pathing.findSwarmPath(
			startPos,
			this.directive.pos,
			clearance.width,
			clearance.height
		);
		if (ret.incomplete) {
			log.debug(
				`Incomplete swarm path to find assembly point. Retrying with startpos = fallback.`
			);
			ret = Pathing.findSwarmPath(
				simpleFallback,
				this.directive.pos,
				clearance.width,
				clearance.height
			);
			if (ret.incomplete) {
				log.warning(`No pathable assembly point!`);
			}
		}
		const path = ret.path.reverse();
		const acceptablePositions = _.filter(
			path,
			(pos) =>
				pos.roomName == simpleFallback.roomName && pos.rangeToEdge > 1
		);
		const swarmSize = Math.max(clearance.width, clearance.height);
		const posIndex = (swarmSize + 1) * swarmIndex;
		return (
			acceptablePositions[posIndex] ||
			acceptablePositions[0] ||
			simpleFallback
		);
	}

	/**
	 * Finds a location for a swarm to assemble within an owned room
	 */
	findSwarmAssemblyPointInColony(
		clearance: { width: number; height: number },
		swarmIndex = 0
	): RoomPosition {
		// let ret = Pathing.findSwarmPath(this.colony.pos, this.directive.pos, clearance.width, clearance.height,
		// 								{ignoreCreeps: true});
		const ret = Pathing.findPath(this.colony.pos, this.directive.pos);
		const path = ret.path.reverse();
		const acceptablePositions = _.filter(
			path,
			(pos) => pos.roomName == this.colony.name && pos.rangeToEdge > 1
		);
		const swarmSize = Math.max(clearance.width, clearance.height);
		const posIndex = (swarmSize + 1) * swarmIndex;
		return acceptablePositions[posIndex] || acceptablePositions[0];
	}

	/**
	 * Fallback is a location on the other side of the nearest exit the directive is placed at
	 */
	static getFallbackFrom(
		pos: RoomPosition,
		fallbackDistance = 2
	): RoomPosition {
		let { x, y, roomName } = pos;
		const rangesToExit = [
			[x, "left"],
			[49 - x, "right"],
			[y, "top"],
			[49 - y, "bottom"],
		];
		const [_range, direction] = _.first(
			_.sortBy(rangesToExit, (pair) => pair[0])
		);
		switch (direction) {
			case "left":
				x = 49 - fallbackDistance;
				roomName = Cartographer.findRelativeRoomName(roomName, -1, 0);
				break;
			case "right":
				x = fallbackDistance;
				roomName = Cartographer.findRelativeRoomName(roomName, 1, 0);
				break;
			case "top":
				y = 49 - fallbackDistance;
				roomName = Cartographer.findRelativeRoomName(roomName, 0, -1);
				break;
			case "bottom":
				y = fallbackDistance;
				roomName = Cartographer.findRelativeRoomName(roomName, 0, 1);
				break;
			default:
				log.error("Error getting fallback position!");
				break;
		}
		return new RoomPosition(x, y, roomName);
	}

	// Creep potentials ================================================================================================

	/**
	 * Cache the result of a computation for a tick
	 */
	static cache(creep: Creep, key: string, callback: () => number): number {
		creep.intel ??= {};
		creep.intel[key] ??= callback();
		return creep.intel[key];
	}

	static uniqueBoosts(creep: Creep): ResourceConstant[] {
		return _.compact(
			_.unique(_.map(creep.body, (bodyPart) => bodyPart.boost))
		) as ResourceConstant[];
	}

	/**
	 * Calculate the potential power of a specific type from a body definition,
	 * taking into account boosts (from the definition or that would be applied)
	 *
	 * @param body - The creep's body definition
	 * @param type - The potential type to check
	 * @param intendedBoosts - An optional list of boosts to take into account
	 * @returns The estimated power for that type
	 */
	static getBodyPotential(
		body: BodyPartDefinition[],
		type: BoostType,
		intendedBoosts: MineralBoostConstant[] = []
	): number {
		const bodyPart = BoostTypeBodyparts[type];
		return _.sum(body, function (part) {
			if (part.hits == 0) {
				return 0;
			}
			if (part.type === bodyPart) {
				let boost = part.boost as MineralBoostConstant | undefined;
				if (!boost && intendedBoosts) {
					boost = _.find(
						intendedBoosts,
						(boost) =>
							boost == BOOST_TIERS[type].T1 ||
							boost == BOOST_TIERS[type].T2 ||
							boost == BOOST_TIERS[type].T3
					);
				}
				const boosts: Partial<
					Record<
						BodyPartConstant,
						Partial<
							Record<
								MineralBoostConstant,
								Partial<Record<BoostModifier, number>>
							>
						>
					>
				> = BOOSTS;
				if (!boost) {
					return 1;
				}
				const key = BoostTypeToBoostArray[type];
				return boosts[bodyPart]?.[boost]?.[key] ?? 0;
			}
			return 0;
		});
	}

	/**
	 * Estimate the power of a given part type from body parts and potential boosts
	 *
	 * This will build a compatible definition from the body parts, given no damage.
	 *
	 * Prefer using one of the {@link getAttackPotential} & friends methods if you
	 * have an actual creep to cache the results, or {@link getBodyPotential}. This
	 * one is merely useful to do estimations before the creep exists.
	 */
	static getBodyPartPotential(
		body: BodyPartConstant[],
		type: BoostType,
		intendedBoosts: MineralBoostConstant[] = []
	) {
		const bodyDef = body.map((part) => ({
			type: part,
			hits: 50,
		}));
		return this.getBodyPotential(bodyDef, type, intendedBoosts);
	}

	/**
	 * Heal potential of a single creep in units of effective number of parts
	 */
	static getHealPotential(creep: Creep, countIntendedBoosts = false): number {
		const intendedBoosts =
			countIntendedBoosts && creep.my && creep.memory.needBoosts ?
				creep.memory.needBoosts
			:	[];
		return this.cache(creep, "healPotential", () =>
			this.getBodyPotential(creep.body, HEAL, intendedBoosts)
		);
	}

	static getHealAmount(creep: Creep | Zerg): number {
		return HEAL_POWER * this.getHealPotential(toCreep(creep));
	}

	static getRangedHealAmount(creep: Creep | Zerg): number {
		return RANGED_HEAL_POWER * this.getHealPotential(toCreep(creep));
	}

	/**
	 * If a creep appears to primarily be a healer
	 */
	static isHealer(zerg: Creep | Zerg): boolean {
		const healParts = _.filter(
			zerg.body,
			(part) => part.type == HEAL
		).length;
		const attackParts = _.filter(
			zerg.body,
			(part) => part.type == ATTACK
		).length;
		const rangedAttackParts = _.filter(
			zerg.body,
			(part) => part.type == RANGED_ATTACK
		).length;
		return healParts > attackParts + rangedAttackParts;
	}

	/**
	 * Attack potential of a single creep in units of effective number of parts
	 */
	static getAttackPotential(
		creep: Creep,
		countIntendedBoosts = false
	): number {
		const intendedBoosts =
			countIntendedBoosts && creep.my && creep.memory.needBoosts ?
				creep.memory.needBoosts
			:	[];
		return this.cache(creep, "attackPotential", () =>
			this.getBodyPotential(creep.body, ATTACK, intendedBoosts)
		);
	}

	static getAttackDamage(creep: Creep | Zerg): number {
		return ATTACK_POWER * this.getAttackPotential(toCreep(creep));
	}

	/**
	 * Ranged attack potential of a single creep in units of effective number of parts
	 */
	static getRangedAttackPotential(
		creep: Creep,
		countIntendedBoosts = false
	): number {
		const intendedBoosts =
			countIntendedBoosts && creep.my && creep.memory.needBoosts ?
				creep.memory.needBoosts
			:	[];
		return this.cache(creep, "rangedAttackPotential", () =>
			this.getBodyPotential(creep.body, RANGED_ATTACK, intendedBoosts)
		);
	}

	static getRangedAttackDamage(creep: Creep | Zerg): number {
		return (
			RANGED_ATTACK_POWER * this.getRangedAttackPotential(toCreep(creep))
		);
	}

	/**
	 * Attack potential of a single creep in units of effective number of parts
	 */
	static getDismantlePotential(
		creep: Creep,
		countIntendedBoosts = false
	): number {
		const intendedBoosts =
			countIntendedBoosts && creep.my && creep.memory.needBoosts ?
				creep.memory.needBoosts
			:	[];
		return this.cache(creep, "dismantlePotential", () =>
			this.getBodyPotential(creep.body, DISMANTLE, intendedBoosts)
		);
	}

	static getDismantleDamage(creep: Creep | Zerg): number {
		return DISMANTLE_POWER * this.getDismantlePotential(toCreep(creep));
	}

	static getRepairPotential(
		creep: Creep,
		countIntendedBoosts = false
	): number {
		const intendedBoosts =
			countIntendedBoosts && creep.my && creep.memory.needBoosts ?
				creep.memory.needBoosts
			:	[];
		return this.cache(creep, "repairPotential", () =>
			this.getBodyPotential(creep.body, CONSTRUCT, intendedBoosts)
		);
	}

	static getRepairPower(creep: Creep | Zerg): number {
		return REPAIR_POWER * this.getRepairPotential(toCreep(creep));
	}

	/**
	 * Attack potential of a single creep in units of effective number of parts
	 */
	static getCarryPotential(
		creep: Creep,
		countIntendedBoosts = false
	): number {
		const intendedBoosts =
			countIntendedBoosts && creep.my && creep.memory.needBoosts ?
				creep.memory.needBoosts
			:	[];
		return this.cache(creep, "carryPotential", () =>
			this.getBodyPotential(creep.body, CARRY, intendedBoosts)
		);
	}

	/**
	 * Minimum damage multiplier a creep has
	 */
	static minimumDamageTakenMultiplier(creep: Creep): number {
		return this.cache(creep, "minDamageMultiplier", () =>
			_.min(
				_.map(creep.body, function (part) {
					if (part.type == TOUGH && part.hits > 0) {
						if (part.boost == BOOST_TIERS.tough.T1) {
							return BOOSTS.tough.GO.damage;
						} else if (part.boost == BOOST_TIERS.tough.T2) {
							return BOOSTS.tough.GHO2.damage;
						} else if (part.boost == BOOST_TIERS.tough.T3) {
							return BOOSTS.tough.XGHO2.damage;
						}
					}
					return 1;
				})
			)
		);
	}

	static minimumDamageMultiplierForGroup(creeps: Creep[]): number {
		return _.min(
			_.map(creeps, (creep) => this.minimumDamageTakenMultiplier(creep))
		);
	}

	static getMassAttackDamageTo(
		attacker: Creep | Zerg,
		target: AnyCreep | Structure
	): number {
		if (isStructure(target) && (!isOwnedStructure(target) || target.my)) {
			return 0;
		}
		const range = attacker.pos.getRangeTo(target.pos);
		let rangedMassAttackPower = 0;
		if (range <= 1) {
			rangedMassAttackPower = 10;
		} else if (range == 2) {
			rangedMassAttackPower = 4;
		} else if (range == 3) {
			rangedMassAttackPower = 1;
		}
		return (
			rangedMassAttackPower *
			this.getRangedAttackPotential(
				isStandardZerg(attacker) ? attacker.creep : attacker
			)
		);
	}

	/**
	 * Total damage to enemy creeps done by attacker.rangedMassAttack()
	 */
	static getMassAttackDamage(
		attacker: Creep | Zerg,
		targets = attacker.room.hostiles,
		checkRampart = true
	): number {
		const hostiles = attacker.pos.findInRange(
			targets,
			RANGES.RANGED_ATTACK
		);
		return _.sum(hostiles, function (hostile) {
			if (
				checkRampart &&
				hostile.pos.lookForStructure(STRUCTURE_RAMPART)
			) {
				return 0; // Creep inside rampart
			} else {
				return CombatIntel.getMassAttackDamageTo(attacker, hostile);
			}
		});
	}

	/**
	 * A heuristic for scoring the effectiveness of creeps
	 */
	static rating(creep: Creep | Zerg): number {
		const c = toCreep(creep);
		return this.cache(c, "rating", () => {
			let rating =
				this.getRangedAttackPotential(c) +
				this.getAttackPotential(c) / 2;
			const healMultiplier = 1 / this.minimumDamageTakenMultiplier(c);
			rating += healMultiplier * this.getHealPotential(c);
			return rating;
		});
	}

	// Group creep calculations ========================================================================================

	/**
	 * Maximum damage that a group of creeps can dish out (doesn't count for simultaneity restrictions)
	 */
	static maxDamageByCreeps(creeps: Creep[]): number {
		return _.sum(
			creeps,
			(creep) =>
				ATTACK_POWER * this.getAttackPotential(creep) +
				RANGED_ATTACK_POWER * this.getRangedAttackPotential(creep)
		);
	}

	/**
	 * Maximum healing that a group of creeps can provide (doesn't count for simultaneity restrictions)
	 */
	static maxHealingByCreeps(creeps: Creep[]): number {
		return _.sum(creeps, (creep) => this.getHealAmount(creep));
	}

	/**
	 * Total attack/rangedAttack/heal potentials for a group of creeps
	 */
	static getCombatPotentials(
		creeps: (Zerg | Creep | BodyGeneratorReturn)[],
		countIntendedBoosts = true
	): CombatPotentials {
		const attack = _.sum(creeps, (unit) =>
			isAnyZerg(unit) || isCreep(unit) ?
				this.getAttackPotential(toCreep(unit), countIntendedBoosts)
			:	this.getBodyPartPotential(unit.body, ATTACK, unit.boosts)
		);
		const ranged = _.sum(creeps, (unit) =>
			isAnyZerg(unit) || isCreep(unit) ?
				this.getRangedAttackPotential(
					toCreep(unit),
					countIntendedBoosts
				)
			:	this.getBodyPartPotential(unit.body, RANGED_ATTACK, unit.boosts)
		);
		const heal = _.sum(creeps, (unit) =>
			isAnyZerg(unit) || isCreep(unit) ?
				this.getHealPotential(toCreep(unit), countIntendedBoosts)
			:	this.getBodyPartPotential(unit.body, HEAL, unit.boosts)
		);
		const dismantle = _.sum(creeps, (unit) =>
			isAnyZerg(unit) || isCreep(unit) ?
				this.getDismantlePotential(toCreep(unit), countIntendedBoosts)
			:	this.getBodyPartPotential(unit.body, DISMANTLE, unit.boosts)
		);
		return { attack, ranged, heal, dismantle };
	}

	/**
	 * Maximum damage that is dealable at a given position by enemy forces
	 */
	static maxDamageAtPos(pos: RoomPosition): number {
		if (!pos.room) {
			return 0;
		}
		const hostilesInMeleeRange = _.filter(
			pos.room.dangerousHostiles,
			(creep) => pos.getRangeTo(creep) <= 1
		);
		const meleeDamage = _.sum(hostilesInMeleeRange, (hostile) =>
			this.getAttackDamage(hostile)
		);
		const hostilesInRange = _.filter(
			pos.room.dangerousHostiles,
			(creep) => pos.getRangeTo(creep) <= 3
		);
		const rangedDamage = _.sum(hostilesInRange, (hostile) =>
			this.getRangedAttackDamage(hostile)
		);
		let totalDamage = meleeDamage + rangedDamage;
		if (!pos.room.my) {
			totalDamage += this.towerDamageAtPos(pos) || 0;
		}
		return totalDamage;
	}

	/**
	 * Heal potential of self and possible healer neighbors
	 */
	static maxHostileHealingTo(creep: Creep): number {
		return this.cache(creep, "maxHostileHealing", () => {
			const selfHealing = this.getHealAmount(creep);
			const neighbors = _.filter(creep.room.hostiles, (hostile) =>
				hostile.pos.isNearTo(creep)
			);
			const neighborHealing = _.sum(neighbors, (neighbor) =>
				this.getHealAmount(neighbor)
			);
			const rangedHealers = _.filter(
				creep.room.hostiles,
				(hostile) =>
					hostile.pos.getRangeTo(creep) <= 3 &&
					!neighbors.includes(hostile)
			);
			const rangedHealing = _.sum(rangedHealers, (healer) =>
				this.getRangedHealAmount(healer)
			);
			return selfHealing + neighborHealing + rangedHealing;
		});
	}

	/**
	 * Heal potential of self and possible healer neighbors
	 */
	static avgHostileHealingTo(creeps: Creep[]): number {
		return (
			_.max(
				_.map(creeps, (creep) => CombatIntel.maxHostileHealingTo(creep))
			) / creeps.length
		);
	}

	/**
	 * Heal potential of self and possible healer neighbors
	 */
	static maxFriendlyHealingTo(friendly: Creep | Zerg): number {
		const creep = toCreep(friendly);
		return this.cache(creep, "maxFriendlyHealing", () => {
			const selfHealing = this.getHealAmount(creep);
			const neighbors = _.filter(creep.room.creeps, (hostile) =>
				hostile.pos.isNearTo(creep)
			);
			const neighborHealing = _.sum(neighbors, (neighbor) =>
				this.getHealAmount(neighbor)
			);
			const rangedHealers = _.filter(
				creep.room.creeps,
				(hostile) =>
					hostile.pos.getRangeTo(creep) <= 3 &&
					!neighbors.includes(hostile)
			);
			const rangedHealing = _.sum(rangedHealers, (healer) =>
				this.getHealAmount(healer)
			);
			return selfHealing + neighborHealing + rangedHealing;
		});
	}

	/**
	 * Determine the predicted damage amount of a certain type of attack. Can specify if you should use predicted or
	 * current hits amount and whether to include predicted healing. Does not update predicted hits.
	 */
	static predictedDamageAmount(
		attacker: Creep | Zerg,
		target: AnyCreep,
		attackType: "attack" | "rangedAttack",
		useHitsPredicted = true
	): number {
		// Compute initial (gross) damage amount
		let grossDamage: number;
		if (attackType == "attack") {
			grossDamage = this.getAttackDamage(attacker);
		} else if (attackType == "rangedAttack") {
			grossDamage = this.getRangedAttackDamage(attacker);
		} else {
			// rangedMassAttack; not currently used
			grossDamage = this.getMassAttackDamageTo(attacker, target);
		}
		// Adjust for remaining tough parts
		let toughHits: number;
		let damageMultiplier: number;
		if (isCreep(target)) {
			if (useHitsPredicted) {
				target.hitsPredicted ??= target.hits;
				const nonToughHits = _.sum(target.body, (part) =>
					part.type == TOUGH ? 0 : part.hits
				);
				toughHits = Math.min(target.hitsPredicted - nonToughHits, 0); // predicted amount of TOUGH
			} else {
				toughHits = 100 * target.getActiveBodyparts(TOUGH);
			}
			damageMultiplier = this.minimumDamageTakenMultiplier(target); // assumes only 1 tier of boosts
		} else {
			toughHits = 0;
			damageMultiplier = 1;
		}
		if (grossDamage * damageMultiplier < toughHits) {
			// if you can't eat through armor
			return grossDamage * damageMultiplier;
		} else {
			// if you break tough shield
			grossDamage -= toughHits / damageMultiplier;
			return toughHits + grossDamage;
		}
	}

	// Creep position calculations =====================================================================================

	// // Distance from a given creep to the nearest rampart or wall; Infinity if no barriers in room
	// static distanceToBarrier(creep: Creep): number {
	//
	// }

	static isApproaching(approacher: Creep, toPos: RoomPosition): boolean {
		const previousPos = RoomIntel.getPreviousPos(approacher);
		const previousRange = toPos.getRangeTo(previousPos);
		const currentRange = toPos.getRangeTo(approacher.pos);
		return currentRange < previousRange;
	}

	static isRetreating(retreater: Creep, fromPos: RoomPosition): boolean {
		const previousPos = RoomIntel.getPreviousPos(retreater);
		const previousRange = fromPos.getRangeTo(previousPos);
		const currentRange = fromPos.getRangeTo(retreater.pos);
		return currentRange > previousRange;
	}

	/**
	 * This method is probably expensive; use sparingly
	 */
	static isEdgeDancing(creep: Creep, _reentryThreshold = 3): boolean {
		return false;
		// TODO: rewrite this

		// if (!creep.room.my) {
		// 	log.warning(`isEdgeDancing should only be called in owned rooms!`);
		// }
		// const creepOccupancies = creep.room.memory[RMEM.CREEPS_IN_ROOM];
		// if (creepOccupancies) {
		// 	// Look to see if the creep has exited and re-entered the room a given number of times
		// 	const creepInRoomTicks = [];
		// 	for (const tick in creepOccupancies) {
		// 		if (creepOccupancies[tick].includes(creep.name)) {
		// 			creepInRoomTicks.push(parseInt(tick, 10));
		// 		}
		// 	}
		// 	let reentries = 1;
		// 	if (creepInRoomTicks.length > 0) {
		// 		for (const i of _.range(creepInRoomTicks.length - 1)) {
		// 			if (creepInRoomTicks[i + 1] != creepInRoomTicks[i] + 1) {
		// 				// There was a gap between the creep's presence in the room so it must have reentered
		// 				reentries++;
		// 			}
		// 		}
		// 	}
		// 	return reentries >= reentryThreshold;
		// } else {
		// 	return false;
		// }
	}

	static getPositionsNearEnemies(
		hostiles: Creep[],
		range = 0
	): RoomPosition[] {
		return _.unique(
			_.flatten(
				_.map(hostiles, (hostile) =>
					hostile.pos.getPositionsInRange(range, false, true)
				)
			)
		);
	}
}

// For debugging
global.CombatIntel = CombatIntel;
