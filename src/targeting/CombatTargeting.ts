import { isStructure } from "declarations/typeGuards";
import { log } from "../console/log";
import { CombatIntel } from "../intel/CombatIntel";
import { MatrixLib } from "../matrix/MatrixLib";
import { Pathing } from "../movement/Pathing";
import {
	AttackStructurePriorities,
	AttackStructureScores,
} from "../priorities/priorities_structures";
import { profile } from "../profiler/decorator";
import { maxBy } from "../utilities/utils";
import { Visualizer } from "../visuals/Visualizer";
import { Swarm } from "../zerg/Swarm";
import { Zerg } from "../zerg/Zerg";
import { RANGES } from "zerg/ranges";
import { config } from "config";

@profile
export class CombatTargeting {
	/**
	 * Finds the best target within a given range that a zerg can currently attack
	 */
	static findBestCreepTargetInRange(
		zerg: Zerg,
		range: number,
		targets = zerg.room.hostiles
	): Creep | undefined {
		const nearbyHostiles = _.filter(targets, (c) =>
			zerg.pos.inRangeToXY(c.pos.x, c.pos.y, range)
		);
		return maxBy(nearbyHostiles, function (hostile) {
			hostile.hitsPredicted ??= hostile.hits;
			if (hostile.pos.lookForStructure(STRUCTURE_RAMPART)) {
				return false;
			}
			return (
				hostile.hitsMax -
				hostile.hitsPredicted +
				CombatIntel.getHealPotential(hostile)
			); // compute score
		});
	}

	/**
	 * Finds the best target within a given range that a zerg can currently attack
	 */
	static findBestStructureTargetInRange(
		zerg: Zerg,
		range: number,
		allowUnowned = true
	): Structure | undefined {
		let nearbyStructures = _.filter(zerg.room.hostileStructures, (s) =>
			zerg.pos.inRangeToXY(s.pos.x, s.pos.y, range)
		);
		// If no owned structures to attack and not in colony room or outpost, target unowned structures
		if (
			allowUnowned &&
			nearbyStructures.length == 0 &&
			!Overmind.colonyMap[zerg.room.name]
		) {
			nearbyStructures = _.filter(zerg.room.structures, (s) =>
				zerg.pos.inRangeToXY(s.pos.x, s.pos.y, range)
			);
		}
		return maxBy(nearbyStructures, function (structure) {
			let score = 10 * AttackStructureScores[structure.structureType];
			if (structure.pos.lookForStructure(STRUCTURE_RAMPART)) {
				score *= 0.1;
			}
			return score;
		});
	}

	/**
	 * Standard target-finding logic
	 */
	static findTarget(
		zerg: Zerg,
		targets?: (Creep | Structure)[]
	): Creep | Structure | undefined {
		if (!targets) {
			targets = [...zerg.room.hostiles, ...zerg.room.hostileStructures];
		}
		return maxBy<Creep | Structure>(targets, function (hostile) {
			if (hostile.pos.lookForStructure(STRUCTURE_RAMPART)) {
				return false;
			}
			if (isStructure(hostile)) {
				return (
					hostile.hitsMax -
					10 * zerg.pos.getMultiRoomRangeTo(hostile.pos)
				);
			} else {
				hostile.hitsPredicted ??= hostile.hits;
				return (
					hostile.hitsMax -
					hostile.hitsPredicted +
					CombatIntel.getHealPotential(hostile) -
					10 * zerg.pos.getMultiRoomRangeTo(hostile.pos)
				); // compute score
			}
		});
	}

	/**
	 * Finds the best target within a given range that a zerg can currently attack
	 */
	static findBestCreepTargetForTowers(
		room: Room,
		targets = room.hostiles
	): Creep | undefined {
		return maxBy(targets, function (hostile) {
			hostile.hitsPredicted ??= hostile.hits;
			if (hostile.pos.lookForStructure(STRUCTURE_RAMPART)) {
				return false;
			}
			return (
				hostile.hitsMax -
				hostile.hitsPredicted +
				CombatIntel.getHealPotential(hostile) +
				(CombatIntel.towerDamageAtPos(hostile.pos) || 0)
			);
		});
	}

	static findClosestHostile(
		zerg: Zerg,
		opts: {
			checkReachable: boolean;
			ignoreCreepsAtEdge: boolean;
			playerOnly: boolean;
			onlyUnramparted: boolean;
		}
	): Creep | undefined {
		_.defaults(opts, {
			checkReachable: false,
			ignoreCreepsAtEdge: true,
			playerOnly: false,
			onlyUnramparted: false,
		});
		if (zerg.room.hostiles.length > 0) {
			let targets: Creep[];
			const potentialTargets =
				opts.playerOnly ? zerg.room.playerHostiles : zerg.room.hostiles;
			if (opts.ignoreCreepsAtEdge) {
				targets = _.filter(
					potentialTargets,
					(hostile) => hostile.pos.rangeToEdge > 0
				);
			} else {
				targets = potentialTargets;
			}
			if (opts.onlyUnramparted) {
				targets = _.filter(targets, (hostile) => !hostile.inRampart);
			}
			if (opts.checkReachable) {
				const targetsByRange = _.sortBy(targets, (target) =>
					zerg.pos.getRangeTo(target)
				);
				return _.find(targetsByRange, (target) =>
					Pathing.isReachable(
						zerg.pos,
						target.pos,
						zerg.room.barriers.filter(
							(barrier) =>
								barrier.structureType == STRUCTURE_WALL ||
								(barrier.structureType == STRUCTURE_RAMPART &&
									(barrier.owner.username ==
										config.MY_USERNAME ||
										!barrier.isPublic))
						)
					)
				);
			} else {
				return zerg.pos.findClosestByRange(targets) ?? undefined;
			}
		}
	}

	// This method is expensive
	static findClosestReachable<T extends Creep | Structure>(
		pos: RoomPosition,
		targets: T[]
	): T | undefined {
		const targetsByRange = _.sortBy(targets, (target) =>
			pos.getRangeTo(target)
		);
		return _.find(targetsByRange, (target) =>
			Pathing.isReachable(pos, target.pos, target.room.barriers)
		);
	}

	static findClosestHurtFriendly(healer: Zerg): Creep | null {
		return healer.pos.findClosestByRange(
			_.filter(healer.room.creeps, (creep) => creep.hits < creep.hitsMax)
		);
	}

	/**
	 * Finds the best (friendly) target in range that a zerg can currently heal
	 */
	static findBestHealingTargetInRange(
		healer: Zerg,
		range = RANGES.RANGED_HEAL,
		friendlies?: Creep[]
	): Creep | undefined {
		if (!friendlies) {
			friendlies = healer.room.friendlies;
		}
		const tempHitsPredicted: { [id: string]: number } = {};
		return maxBy(
			_.filter(
				friendlies,
				(f) => f.hits < f.hitsMax && healer.pos.getRangeTo(f) <= range
			),
			(friend) => {
				friend.hitsPredicted ??= friend.hits;
				const attackProbability = 0.5;
				tempHitsPredicted[friend.id] = friend.hitsPredicted;
				for (const hostile of friend.pos.findInRange(
					friend.room.hostiles,
					3
				)) {
					if (!friend.inRampart) {
						if (hostile.pos.isNearTo(friend)) {
							tempHitsPredicted[friend.id] -=
								attackProbability *
								CombatIntel.getAttackDamage(hostile);
						} else {
							tempHitsPredicted[friend.id] -=
								attackProbability *
								CombatIntel.getRangedAttackDamage(hostile);
						}
					}
				}
				const missingHits =
					friend.hitsMax - tempHitsPredicted[friend.id];
				if (healer.pos.getRangeTo(friend) > 1) {
					return Math.min(
						missingHits,
						CombatIntel.getRangedHealAmount(healer.creep)
					);
				} else {
					return Math.min(
						missingHits,
						CombatIntel.getHealAmount(healer.creep)
					);
				}
			}
		);
	}

	static findClosestPrioritizedStructure(
		zerg: Zerg,
		checkReachable = false
	): Structure | undefined {
		for (const structureType of AttackStructurePriorities) {
			const structures = _.filter(
				zerg.room.hostileStructures,
				(s) => s.structureType == structureType
			);
			if (structures.length == 0) {
				continue;
			}
			if (checkReachable) {
				const closestReachable = this.findClosestReachable(
					zerg.pos,
					structures
				);
				if (closestReachable) {
					return closestReachable;
				}
			} else {
				return zerg.pos.findClosestByRange(structures) ?? undefined;
			}
		}
		const core = _.filter(
			zerg.room.hostileStructures,
			(s) => s.structureType.toString() == "invaderCore"
		);
		if (core.length != 0) {
			return core[0];
		}
	}

	static findBestStructureTarget(pos: RoomPosition): Structure | undefined {
		const room = Game.rooms[pos.roomName];
		// Don't accidentally destroy your own shit
		if (!room || room.my || room.reservedByMe) {
			return;
		}
		// Look for any unprotected structures
		const unprotectedRepairables = _.filter(room.repairables, (s) => {
			const rampart = s.pos.lookForStructure(STRUCTURE_RAMPART);
			return !rampart || rampart.hits < 10000;
		});
		let approach = _.map(unprotectedRepairables, (structure) => {
			return { pos: structure.pos, range: 0 };
		}) as PathFinderGoal[];
		if (room.barriers.length == 0 && unprotectedRepairables.length == 0) {
			return; // if there's nothing in the room
		}

		// Try to find a reachable unprotected structure
		if (approach.length > 0) {
			const ret = PathFinder.search(pos, approach, {
				maxRooms: 1,
				maxOps: 2000,
				roomCallback: (roomName) => {
					if (roomName != room.name) {
						return false;
					}
					const matrix = new PathFinder.CostMatrix();
					for (const barrier of room.barriers) {
						matrix.set(barrier.pos.x, barrier.pos.y, 0xff);
					}
					return matrix;
				},
			});
			const targetPos = _.last(ret.path);
			if (!ret.incomplete && targetPos) {
				const targetStructure = _.first(
					_.filter(targetPos.lookFor(LOOK_STRUCTURES), (s) => {
						return (
							s.structureType != STRUCTURE_ROAD &&
							s.structureType != STRUCTURE_CONTAINER
						);
					})
				);
				if (targetStructure) {
					log.debug(
						`Found unprotected structure target @ ${targetPos.print}`
					);
					return targetStructure;
				}
			}
		}

		// Determine a "siege anchor" for what you eventually want to destroy
		let targets: Structure[] = room.spawns;
		if (targets.length == 0) {
			targets = room.repairables;
		}
		if (targets.length == 0) {
			targets = room.barriers;
		}
		if (targets.length == 0) {
			targets = room.structures;
		}
		if (targets.length == 0) {
			return;
		}

		// Recalculate approach targets
		approach = _.map(targets, (s) => {
			return { pos: s.pos, range: 0 };
		});

		const maxWallHits = _.max(_.map(room.barriers, (b) => b.hits)) || 0;
		// Compute path with wall position costs weighted by fraction of highest wall
		const ret = PathFinder.search(pos, approach, {
			maxRooms: 1,
			plainCost: 1,
			swampCost: 2,
			roomCallback: (roomName) => {
				if (roomName != pos.roomName) {
					return false;
				}
				const matrix = new PathFinder.CostMatrix();
				for (const barrier of room.barriers) {
					const cost =
						100 + Math.round((barrier.hits / maxWallHits) * 100);
					matrix.set(barrier.pos.x, barrier.pos.y, cost);
				}
				return matrix;
			},
		});

		// Target the first non-road, non-container structure you find along the path
		for (const pos of ret.path) {
			const targetStructure = _.first(
				_.filter(pos.lookFor(LOOK_STRUCTURES), (s) => {
					return (
						s.structureType != STRUCTURE_ROAD &&
						s.structureType != STRUCTURE_CONTAINER
					);
				})
			);
			if (targetStructure) {
				log.debug(`Targeting structure @ ${targetStructure.pos.print}`);
				return targetStructure;
			}
		}
	}

	static findBestSwarmStructureTarget(
		swarm: Swarm,
		roomName: string,
		randomness = 0,
		displayCostMatrix = false
	): Structure | undefined {
		const room = Game.rooms[roomName];
		// Don't accidentally destroy your own shit
		if (!room || room.my || room.reservedByMe) {
			return;
		}
		if (swarm.anchor.roomName != roomName) {
			log.warning(`Swarm is not in target room!`);
			return;
		}

		// // Look for any unprotected structures
		// let unprotectedRepairables = _.filter(room.repairables, s => {
		// 	let rampart = s.pos.lookForStructure(STRUCTURE_RAMPART);
		// 	return !rampart || rampart.hits < 10000;
		// });
		// let approach = _.map(unprotectedRepairables, structure => {
		// 	return {pos: structure.pos, range: 0};
		// }) as PathFinderGoal[];
		// // if there's nothing in the room
		// if (room.barriers.length == 0 && unprotectedRepairables.length == 0) return;
		//
		// // Try to find a reachable unprotected structure
		// if (approach.length > 0) {
		// 	let ret = PathFinder.search(swarm.anchor, approach, {
		// 		maxRooms    : 1,
		// 		maxOps      : 2000,
		// 		roomCallback: roomName => {
		// 			if (roomName != room.name) return false;
		// 			let matrix = Pathing.getSwarmTerrainMatrix(roomName, swarm.width, swarm.height).clone();
		// 			for (let barrier of room.barriers) {
		// 				let setPositions = Pathing.getPosWindow(barrier.pos, -swarm.width, -swarm.height);
		// 				for (let pos of setPositions) {
		// 					matrix.set(pos.x, pos.y, 0xff);
		// 				}
		// 			}
		// 			return matrix;
		// 		},
		// 	});
		// 	let targetPos = _.last(ret.path);
		// 	if (!ret.incomplete && targetPos) {
		// 		let targetStructure = _.first(_.filter(targetPos.lookFor(LOOK_STRUCTURES), s => {
		// 			return s.structureType != STRUCTURE_ROAD && s.structureType != STRUCTURE_CONTAINER;
		// 		}));
		// 		if (targetStructure) {
		// 			log.debug(`Found unprotected structure target @ ${targetPos.print}`);
		// 			return targetStructure;
		// 		}
		// 	}
		// }

		// Determine a "siege anchor" for what you eventually want to destroy
		let targets: Structure[] = room.spawns;
		if (targets.length == 0) {
			targets = room.towers;
		}
		if (targets.length == 0) {
			targets = room.repairables;
		}
		if (targets.length == 0) {
			targets = room.barriers;
		}
		if (targets.length == 0) {
			targets = room.structures;
		}
		if (targets.length == 0) {
			return;
		}

		// Recalculate approach targets
		const approach = _.map(targets, (s) => {
			// TODO: might need to Pathing.getPosWindow() this
			return { pos: s.pos, range: 0 };
		});

		const maxWallHits = _.max(_.map(room.barriers, (b) => b.hits)) || 0;
		// Compute path with wall position costs weighted by fraction of highest wall
		const ret = PathFinder.search(swarm.anchor, approach, {
			maxRooms: 1,
			plainCost: 1,
			swampCost: 2,
			roomCallback: (rn) => {
				if (rn != roomName) {
					return false;
				}

				const matrix = MatrixLib.getSwarmTerrainMatrix(
					roomName,
					{ plainCost: 1, swampCost: 5 },
					swarm.width,
					swarm.height
				);
				for (const barrier of room.barriers) {
					const randomFactor = Math.min(
						Math.round(randomness * Math.random()),
						100
					);
					const cost =
						100 +
						Math.round((barrier.hits / maxWallHits) * 100) +
						randomFactor;
					MatrixLib.setToMaxCostAfterMaxPooling(
						matrix,
						[barrier],
						swarm.width,
						swarm.height,
						cost
					);
				}
				if (displayCostMatrix) {
					Visualizer.displayCostMatrix(matrix, roomName);
				}
				return matrix;
			},
		});

		// Target the first non-road, non-container structure you find along the path or neighboring positions
		for (const pos of ret.path) {
			log.debug(`Searching path ${pos.print}...`);
			const searchPositions = Pathing.getPosWindow(
				pos,
				swarm.width,
				swarm.height
			); // not -1*width
			for (const searchPos of searchPositions) {
				const targetStructure = _.first(
					_.filter(searchPos.lookFor(LOOK_STRUCTURES), (s) => {
						return (
							s.structureType != STRUCTURE_ROAD &&
							s.structureType != STRUCTURE_CONTAINER
						);
					})
				);
				if (targetStructure) {
					log.debug(
						`Targeting structure @ ${targetStructure.pos.print}`
					);
					return targetStructure;
				}
			}
		}
	}
}
