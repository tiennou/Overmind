import { $ } from "../../caching/GlobalCache";
import { Colony, DEFCON } from "../../Colony";
import { CreepSetup } from "../../creepSetups/CreepSetup";
import { Roles, Setups } from "../../creepSetups/setups";
import { DirectiveNukeResponse } from "../../directives/situational/nukeResponse";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import {
	BuildPriorities,
	FortifyPriorities,
} from "../../priorities/priorities_structures";
import { profile } from "../../profiler/decorator";
import { Tasks } from "../../tasks/Tasks";
import {
	Cartographer,
	ROOMTYPE_CONTROLLER,
} from "../../utilities/Cartographer";
import { minBy, minMax } from "../../utilities/utils";
import { Visualizer } from "../../visuals/Visualizer";
import { Zerg } from "../../zerg/Zerg";
import { Overlord } from "../Overlord";

type hitsCallbackType = (structure: StructureWall | StructureRampart) => number;

/** Maximum number of workers to spawn */
const MAX_WORKERS = 10;
/** Average energy per tick when working */
const WORKER_ENERGY_PER_TICK = 1.1;
/** How often are workers working */
const WORKER_AVG_UPTIME = 0.8;

/**
 * Spawns general-purpose workers, which maintain a colony, performing actions such as building, repairing, fortifying,
 * paving, and upgrading, when needed
 */
@profile
export class WorkerOverlord extends Overlord {
	workers: Zerg[];
	room: Room;
	repairStructures: Structure[];
	dismantleStructures: Structure[];
	fortifyBarriers: (StructureWall | StructureRampart)[];
	criticalBarriers: (StructureWall | StructureRampart)[];
	constructionSites: ConstructionSite[];
	nukeDefenseRamparts: StructureRampart[];
	nukeDefenseHitsRemaining: { [id: string]: number };
	nukeDefenseHitsNeeded: { [id: string]: number };
	useBoostedRepair?: boolean;
	private priorityTasks: Flag[] = [];

	static settings = {
		barrierHits: {
			// What HP to fortify barriers to at each RCL
			critical: 2500,
			1: 3e3,
			2: 3e3,
			3: 1e4,
			4: 5e4,
			5: 1e5,
			6: 5e5,
			7: 2e6,
			8: 2.1e7,
		},
		hitTolerance: 100000, // allowable spread in HP
		fortifyDutyThreshold: 250000, // ignore fortify duties until this amount of energy is present in the room
	};

	constructor(colony: Colony, priority = OverlordPriority.ownedRoom.work) {
		super(colony, "worker", priority);
		// Compute barriers needing fortification or critical attention
		this.fortifyBarriers = $.structures(
			this,
			"fortifyBarriers",
			() =>
				_.sortBy(
					_.filter(
						this.room.barriers,
						(s) =>
							s.hits <
								WorkerOverlord.settings.barrierHits[
									this.colony.level
								] &&
							this.colony.roomPlanner.barrierPlanner.barrierShouldBeHere(
								s.pos
							)
					),
					(s) => s.hits
				),
			25
		);
		this.criticalBarriers = $.structures(
			this,
			"criticalBarriers",
			() =>
				_.filter(
					this.fortifyBarriers,
					(barrier) =>
						barrier.hits <
						WorkerOverlord.settings.barrierHits.critical
				),
			10
		);
		// Generate a list of structures needing repairing (different from fortifying except in critical case)
		this.repairStructures = $.structures(this, "repairStructures", () => {
			const miningContainers = _.compact(
				_.map(
					this.colony.miningSites,
					(site) => site.overlords.mine?.container?.id
				)
			);
			return _.filter(this.colony.repairables, (structure) => {
				if (structure.structureType == STRUCTURE_CONTAINER) {
					// only repair non-mining containers in owned rooms
					if (
						structure.pos.roomName == this.colony.name &&
						!miningContainers.includes(
							(<StructureContainer>structure).id
						)
					) {
						return structure.hits < 0.5 * structure.hitsMax;
					} else {
						return false;
					}
				} else {
					return structure.hits < structure.hitsMax;
				}
			});
		});
		this.dismantleStructures = [];

		const homeRoomName = this.colony.room.name;
		const defcon = this.colony.defcon;
		// Filter constructionSites to only build valid ones
		const room = this.colony.room;
		const level = this.colony.controller.level;
		this.constructionSites = _.filter(
			this.colony.constructionSites,
			function (site) {
				// If site will be more than max amount of a structure at current level, ignore (happens after downgrade)
				const structureAmount =
					_.get(room, site.structureType + "s") ?
						_.get<any[]>(room, site.structureType + "s").length
					: _.get<any[]>(room, site.structureType) ? 1
					: 0;
				if (
					structureAmount >=
					CONTROLLER_STRUCTURES[site.structureType][level]
				) {
					return false;
				}
				if (defcon > DEFCON.safe) {
					// Only build non-road, non-container sites in the home room if defcon is unsafe
					return (
						site.pos.roomName == homeRoomName &&
						site.structureType != STRUCTURE_CONTAINER &&
						site.structureType != STRUCTURE_ROAD
					);
				} else {
					// Build all non-container sites in outpost and all sites in room if defcon is safe
					if (
						site.pos.roomName != homeRoomName &&
						Cartographer.roomType(site.pos.roomName) ==
							ROOMTYPE_CONTROLLER
					) {
						return (
							site.structureType != STRUCTURE_CONTAINER &&
							!(
								site.room &&
								site.room.dangerousHostiles.length > 0
							)
						);
					} else {
						return true;
					}
				}
			}
		);

		// Nuke defense ramparts needing fortification
		this.nukeDefenseRamparts = [];
		this.nukeDefenseHitsRemaining = {};
		this.nukeDefenseHitsNeeded = {};
		if (this.room.find(FIND_NUKES).length > 0) {
			for (const rampart of this.colony.room.ramparts) {
				const neededHits = this.neededRampartHits(rampart);
				if (
					rampart.hits < neededHits &&
					rampart.pos.findInRange(FIND_NUKES, 2).length > 0 &&
					DirectiveNukeResponse.shouldReinforceLocation(rampart.pos)
				) {
					this.nukeDefenseRamparts.push(rampart);
					Visualizer.marker(rampart.pos, { color: "gold" });
					this.nukeDefenseHitsRemaining[rampart.id] = Math.min(
						neededHits - rampart.hits,
						0
					);
				}
			}
		}

		// Spawn boosted workers if there is significant fortifying which needs to be done
		const totalNukeDefenseHitsRemaining = _.sum(
			_.values(this.nukeDefenseHitsRemaining)
		);
		const totalFortifyHitsRemaining = _.sum(
			this.fortifyBarriers,
			(barrier) =>
				Math.max(
					WorkerOverlord.settings.barrierHits[this.colony.level] -
						barrier.hits,
					0
				)
		);
		const approxRepairAmountPerLifetime =
			((REPAIR_POWER * 50) / 3) * CREEP_LIFE_TIME;
		if (
			totalNukeDefenseHitsRemaining > 3 * approxRepairAmountPerLifetime ||
			totalFortifyHitsRemaining > 5 * approxRepairAmountPerLifetime
		) {
			this.useBoostedRepair = true;
		}

		// Register workers
		this.workers = this.zerg(Roles.worker);
	}

	private neededNukeHits(rampart: StructureWall | StructureRampart): number {
		if (this.nukeDefenseHitsNeeded[rampart.id] !== undefined) {
			return this.nukeDefenseHitsNeeded[rampart.id];
		}
		let neededHits = 0;
		for (const _nuke of rampart.pos.lookFor(LOOK_NUKES)) {
			neededHits += 10e6;
		}
		for (const nuke of rampart.pos.findInRange(FIND_NUKES, 2)) {
			if (nuke.pos != rampart.pos) {
				neededHits += 5e6;
			}
		}
		this.nukeDefenseHitsNeeded[rampart.id] = neededHits;
		return neededHits;
	}

	private neededRampartHits(rampart: StructureRampart): number {
		let neededHits = WorkerOverlord.settings.barrierHits[this.colony.level];
		neededHits = +this.neededNukeHits(rampart);
		return neededHits;
	}

	refresh() {
		super.refresh();
		$.refresh(
			this,
			"repairStructures",
			"dismantleStructures",
			"fortifyBarriers",
			"criticalBarriers",
			"constructionSites",
			"nukeDefenseRamparts"
		);

		this.priorityTasks = [];
	}

	/**
	 * Estimates how many workers we could afford given the current energy input
	 */
	private maxSustainableWorkers(workPartsPerWorker: number) {
		const numWorkers = Math.ceil(
			(this.colony.energyMinedPerTick * WORKER_AVG_UPTIME) /
				(workPartsPerWorker * WORKER_ENERGY_PER_TICK)
		);
		return Math.min(numWorkers, MAX_WORKERS);
	}

	/**
	 * Estimates how many workers are needed to take care of all tasks
	 */
	private estimatedWorkerCount(workPartsPerWorker: number) {
		const maxWorkers = this.maxSustainableWorkers(workPartsPerWorker);

		// We want to rush storage, or we're relocating; maintain a maximum of workers
		if (
			this.colony.level < 4 ||
			this.colony.roomPlanner.memory.relocating
		) {
			return maxWorkers;
		}

		// Nuke incoming, spawn as much as possible to fortify as much as possible
		if (this.nukeDefenseRamparts.length > 0) {
			return MAX_WORKERS;
		}

		// At higher levels, spawn workers based on construction and repair that needs to be done
		const buildTicks =
			_.sum(this.constructionSites, (site) =>
				Math.max(site.progressTotal - site.progress, 0)
			) / BUILD_POWER;
		const repairTicks =
			_.sum(
				this.repairStructures,
				(structure) => structure.hitsMax - structure.hits
			) / REPAIR_POWER;
		const activeRooms = _.filter(this.colony.roomNames, (roomName) =>
			this.colony.isRoomActive(roomName)
		);
		const paveTicks = _.sum(activeRooms, (roomName) =>
			this.colony.roadLogistics.energyToRepave(roomName)
		);
		let fortifyTicks = 0;
		const shouldFortify =
			this.colony.assets.energy >
			WorkerOverlord.settings.fortifyDutyThreshold;
		if (shouldFortify) {
			fortifyTicks =
				(0.25 *
					_.sum(this.fortifyBarriers, (barrier) =>
						Math.max(
							0,
							WorkerOverlord.settings.barrierHits[
								this.colony.level
							] - barrier.hits
						)
					)) /
				REPAIR_POWER;
		}

		// max constructionTicks for private server manually setting progress
		let numWorkers = Math.ceil(
			(2 * (5 * buildTicks + repairTicks + paveTicks + fortifyTicks)) /
				(workPartsPerWorker * CREEP_LIFE_TIME)
		);

		const neededUpgraders = this.shouldPreventControllerDowngrade() ? 1 : 0;
		numWorkers = minMax(numWorkers, neededUpgraders, maxWorkers);

		return numWorkers;
	}

	/**
	 * Check if the controller is close to downgrading.
	 *
	 * Handles both natural decay and downgrade attacks
	 */
	private shouldPreventControllerDowngrade() {
		const downgradeLevel =
			CONTROLLER_DOWNGRADE[this.colony.controller.level] *
			(this.colony.controller.level < 4 ? 0.3 : 0.7);

		this.debug(() => {
			const cont = this.colony.controller;
			const dbg = {
				downgradeLevel,
				upgradeBlocked: cont.upgradeBlocked,
				ticksToDowngrade: cont.ticksToDowngrade,
				progress: cont.progress,
				progressTotal: cont.progressTotal,
			};
			return `shouldPreventControllerDowngrade: ${JSON.stringify(dbg)}`;
		});

		return (
			(!this.colony.controller.upgradeBlocked ||
				this.colony.controller.upgradeBlocked < 30) &&
			(this.colony.controller.ticksToDowngrade <= downgradeLevel ||
				this.colony.controller.progress >
					this.colony.controller.progressTotal)
		);
	}

	init() {
		let setup =
			this.colony.level == 1 ?
				Setups.workers.early
			:	Setups.workers.default;
		const numWorkers = $.number(this, "numWorkers", () =>
			this.estimatedWorkerCount(setup.getBodyPotential(WORK, this.colony))
		);

		if (this.useBoostedRepair) {
			setup = CreepSetup.boosted(setup, ["construct"]);
		}

		this.wishlist(numWorkers, setup);
	}

	/**
	 * Give priority to a worker task at this location
	 * Must be called each tick.
	 */
	prioritizeTask(flag: Flag) {
		this.priorityTasks.push(flag);
	}

	private filterPriorityTargets<T extends _HasRoomPosition>(objects: T[]) {
		if (this.priorityTasks.length === 0) {
			return objects;
		}
		return objects.filter((obj) =>
			this.priorityTasks.some((flag) => flag.pos.isEqualTo(obj.pos))
		);
	}

	private repairActions(worker: Zerg): boolean {
		if (this.rechargeActions(worker)) {
			return true;
		}

		const repairStructures = this.filterPriorityTargets(
			this.repairStructures
		);
		const target = worker.pos.findClosestByMultiRoomRange(repairStructures);
		if (target) {
			this.debug(`${worker.print} repairing ${target.print}`);
			worker.task = Tasks.repair(target);
			return true;
		} else {
			return false;
		}
	}

	private buildActions(worker: Zerg): boolean {
		if (this.rechargeActions(worker)) {
			return true;
		}

		const constructionSites = this.filterPriorityTargets(
			this.constructionSites
		);
		const groupedSites = _.groupBy(
			constructionSites,
			(site) => site.structureType
		);
		for (const structureType of BuildPriorities) {
			if (groupedSites[structureType]) {
				const target = worker.pos.findClosestByMultiRoomRange(
					groupedSites[structureType]
				);
				if (target) {
					this.debug(
						`${worker.print} heading to build ${target.print} from ${this.constructionSites.length} sites`
					);
					worker.task = Tasks.build(target);
					return true;
				}
			}
		}
		return false;
	}

	private dismantleActions(worker: Zerg): boolean {
		const targets = _.filter(
			this.dismantleStructures,
			(s) => (s.targetedBy || []).length < 3
		);
		const target = worker.pos.findClosestByMultiRoomRange(targets);
		if (target) {
			_.remove(this.dismantleStructures, (s) => s == target);
			this.debug(`${worker.print} dismantling ${target.print}`);
			worker.task = Tasks.dismantle(target);
			return true;
		} else {
			return false;
		}
	}

	// Find a suitable repair ordering of roads with a depth first search
	private pavingActions(worker: Zerg): boolean {
		if (this.rechargeActions(worker)) {
			return true;
		}

		const roomToRepave =
			this.colony.roadLogistics.workerShouldRepave(worker)!;
		this.colony.roadLogistics.registerWorkerAssignment(
			worker,
			roomToRepave
		);
		// Build a paving manifest
		const pavingManifest = this.colony.roadLogistics.buildPavingManifest(
			worker,
			roomToRepave
		);
		if (pavingManifest) {
			this.debug(`${worker.print} repaving ${roomToRepave.name}`);
			worker.task = pavingManifest;
			return true;
		} else {
			return false;
		}
	}

	private findLowBarriers(
		fortifyStructures = this.fortifyBarriers,
		hitsCallback: hitsCallbackType = (structure) => structure.hits,
		numBarriersToConsider = 5
	): (StructureWall | StructureRampart)[] {
		let lowBarriers: (StructureWall | StructureRampart)[];
		const highestBarrierHits = _.max(
			_.map(fortifyStructures, (structure) => hitsCallback(structure))
		);
		if (highestBarrierHits > WorkerOverlord.settings.hitTolerance) {
			// At high barrier HP, fortify only structures that are within a threshold of the lowest
			const lowestBarrierHits = _.min(
				_.map(fortifyStructures, (structure) => hitsCallback(structure))
			);
			lowBarriers = _.filter(
				fortifyStructures,
				(structure) =>
					hitsCallback(structure) <=
					lowestBarrierHits + WorkerOverlord.settings.hitTolerance
			);
		} else {
			// Otherwise fortify the lowest N structures
			lowBarriers = _.take(fortifyStructures, numBarriersToConsider);
		}
		return lowBarriers;
	}

	private fortifyActions(
		worker: Zerg,
		fortifyStructures = this.fortifyBarriers
	): boolean {
		if (this.rechargeActions(worker)) {
			return true;
		}

		const lowBarriers = this.findLowBarriers(fortifyStructures);
		const target = worker.pos.findClosestByMultiRoomRange(lowBarriers);
		if (target) {
			this.debug(`${worker.print} fortifying ${target.print}`);
			worker.task = Tasks.fortify(target);
			return true;
		} else {
			return false;
		}
	}

	private nukeFortifyActions(
		worker: Zerg,
		fortifyStructures = this.nukeDefenseRamparts
	): boolean {
		if (this.rechargeActions(worker)) {
			return true;
		}

		const adaptedHits = _.reduce(
			fortifyStructures,
			(obj, structure: StructureWall | StructureRampart) => {
				obj[structure.id] =
					structure.hits - this.neededNukeHits(structure);
				return obj;
			},
			{} as { [key: string]: number }
		);

		const lowBarriers = this.findLowBarriers();
		const minBarrier = lowBarriers[lowBarriers.length - 1].hits;
		const urgent = _.filter(
			fortifyStructures,
			(structure) => adaptedHits[structure.id] < minBarrier
		);

		const target = minBy(urgent, (rampart) => {
			const structuresUnderRampart = rampart.pos.lookFor(LOOK_STRUCTURES);
			return _.min(
				_.map(structuresUnderRampart, (structure) => {
					const priority = _.findIndex(
						FortifyPriorities,
						(sType) => sType == structure.structureType
					);
					if (priority >= 0) {
						// if found
						return priority;
					} else {
						// not found
						return 999;
					}
				})
			);
		});

		if (target) {
			this.debug(
				`${worker.print} fortifying ${target.print} against nukes`
			);
			worker.task = Tasks.fortify(target);
			return true;
		} else {
			return this.fortifyActions(worker, fortifyStructures);
		}
	}

	private upgradeActions(worker: Zerg): boolean {
		// Check the upgrade site battery first
		if (worker.store.energy === 0) {
			const battery = this.colony.upgradeSite.battery;
			if (battery && battery.store.energy > 0) {
				worker.task = Tasks.withdraw(battery);
				return true;
			}
			if (this.rechargeActions(worker, true)) {
				return true;
			}
		}

		// Sign controller if needed
		if (
			!this.colony.controller.signedByMe &&
			!this.colony.controller.signedByScreeps
		) {
			this.debug(
				`${worker.print} signing controller ${this.colony.controller.ref}`
			);
			worker.task = Tasks.signController(this.colony.controller);
			return true;
		}
		this.debug(`${worker.print} upgrading ${this.colony.controller.ref}`);
		worker.task = Tasks.upgrade(this.room.controller!);
		return true;
	}

	private bootstrapActions(worker: Zerg): boolean {
		if (this.rechargeActions(worker)) {
			return true;
		}

		// Dump energy into the hatchery
		const target = this.colony.hatchery?.energyStructures.find((struct) =>
			struct.store.getFreeCapacity(RESOURCE_ENERGY)
		);
		if (target && this.colony.state.bootstrapping) {
			this.debug(`${worker.print} bootstraping ${target.print}`);
			worker.task = Tasks.transfer(target);
			return true;
		}
		return false;
	}

	private rechargeActions(worker: Zerg, upgrading = false) {
		if (worker.store.energy > 0) {
			return false;
		}

		// Acquire more energy
		let workerWithdrawLimit = 100;
		// The minimum is intentionally raised on low-level colonies to keep the hatchery from being starved
		if (
			this.colony.storage &&
			this.colony.hatchery?.getWaitTimeForPriority(
				OverlordPriority.throttleThreshold
			) !== 0
		) {
			workerWithdrawLimit = 750;
		}
		if (upgrading) {
			const link = this.colony.upgradeSite.link;
			if (
				link &&
				this.pos.inRangeTo(link.pos, 3) &&
				link.store[RESOURCE_ENERGY] > 0
			) {
				this.debug(`${worker.print} refilling from link as upgrader`);
				worker.task = Tasks.withdraw(link, RESOURCE_ENERGY);
				return true;
			}
		}
		// this.debug(`${worker.print} going for a refill`);
		worker.task = Tasks.recharge(workerWithdrawLimit);
		return true;
	}

	private handleWorker(worker: Zerg) {
		// this.debug(`${worker.print} looking for work`);

		// TODO Add high priority to block controller with ramparts/walls in case of downgrade attack
		// FIXME workers get stalled at controller in case of downgrade attack
		if (this.shouldPreventControllerDowngrade()) {
			this.debug(`${worker.print} emergency upgrade!`);
			if (this.upgradeActions(worker)) {
				return;
			}
		}
		// Turn into queens until the bootstrap situation gets resolved
		const hatcheryIsOverloaded =
			this.colony.hatchery &&
			this.colony.hatchery.memory.stats.overload >= 0.1;
		if (this.colony.state.bootstrapping || hatcheryIsOverloaded) {
			if (this.bootstrapActions(worker)) {
				return;
			}
		}
		// Repair damaged non-road non-barrier structures
		if (
			this.repairStructures.length > 0 &&
			this.colony.defcon == DEFCON.safe
		) {
			if (this.repairActions(worker)) {
				return;
			}
		}
		// Fortify critical barriers
		if (this.criticalBarriers.length > 0) {
			if (this.fortifyActions(worker, this.criticalBarriers)) {
				return;
			}
		}
		// Build new structures
		if (
			this.constructionSites.length > 0 &&
			this.colony.defcon < DEFCON.playerInvasion
		) {
			if (this.buildActions(worker)) {
				return;
			}
		}
		// Build ramparts to block incoming nuke
		if (
			this.nukeDefenseRamparts.length > 0 &&
			!this.colony.state.isRebuilding
		) {
			if (this.nukeFortifyActions(worker, this.nukeDefenseRamparts)) {
				return;
			}
		}
		// Build and maintain roads
		if (
			this.colony.roadLogistics.workerShouldRepave(worker) &&
			this.colony.defcon == DEFCON.safe
		) {
			if (this.pavingActions(worker)) {
				return;
			}
		}
		// Dismantle marked structures
		if (
			this.dismantleStructures.length > 0 &&
			this.colony.defcon == DEFCON.safe
		) {
			if (this.dismantleActions(worker)) {
				return;
			}
		}
		// Fortify walls and ramparts
		if (this.fortifyBarriers.length > 0) {
			if (this.fortifyActions(worker, this.fortifyBarriers)) {
				return;
			}
		}
		// Upgrade controller if less than RCL8 or no upgraders
		if (
			(this.colony.level < 8 ||
				this.colony.upgradeSite.overlord.upgraders.length == 0) &&
			this.colony.defcon == DEFCON.safe
		) {
			if (this.upgradeActions(worker)) {
				return;
			}
		}
		// this.debug(`${worker.print} no work to do!`);
	}

	run() {
		this.autoRun(
			this.workers,
			(worker) => this.handleWorker(worker),
			(worker) =>
				worker.flee(worker.room.fleeDefaults, { invalidateTask: true })
		);
	}
}
