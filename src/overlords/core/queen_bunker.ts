import columnify from "columnify";
import { $ } from "../../caching/GlobalCache";
import { Colony } from "../../Colony";
import { log } from "../../console/log";
import { CreepSetup } from "../../creepSetups/CreepSetup";
import { Roles, Setups } from "../../creepSetups/setups";
import { Hatchery } from "../../hiveClusters/hatchery";
import { TransportRequest } from "../../logistics/TransportRequestGroup";
import { Pathing } from "../../movement/Pathing";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import {
	bunkerChargingSpots,
	getPosFromBunkerCoord,
	insideBunkerBounds,
	quadrantFillOrder,
} from "../../roomPlanner/layouts/bunker";
import { GenericTask } from "../../tasks/Task";
import { Tasks } from "../../tasks/Tasks";
import { hasMinerals, mergeSum, minBy } from "../../utilities/utils";
import { Zerg } from "../../zerg/Zerg";
import { Overlord } from "../Overlord";
import { TaskWithdraw } from "tasks/instances/withdraw";
import { TaskTransfer } from "tasks/instances/transfer";
import { TaskWithdrawAll } from "tasks/instances/withdrawAll";
import { TaskTransferAll } from "tasks/instances/transferAll";

type SupplyStructure =
	| StructureExtension
	| StructureSpawn
	| StructureTower
	| StructureLab;

function isSupplyStructure(structure: Structure): structure is SupplyStructure {
	return (
		structure.structureType == STRUCTURE_EXTENSION ||
		structure.structureType == STRUCTURE_LAB ||
		structure.structureType == STRUCTURE_TOWER ||
		structure.structureType == STRUCTURE_SPAWN
	);
}

function computeQuadrant(colony: Colony, quadrant: Coord[]): SupplyStructure[] {
	const positions = _.map(quadrant, (coord) =>
		getPosFromBunkerCoord(coord, colony)
	);
	const structures: SupplyStructure[] = [];
	for (const pos of positions) {
		const structure = <SupplyStructure>(
			_.find(pos.lookFor(LOOK_STRUCTURES), (s) => isSupplyStructure(s))
		);
		if (structure) {
			structures.push(structure);
		}
	}
	return structures;
}

/**
 * A modified version of the queen overlord which contains a number of hard-coded optimization for bunker-type rooms.
 * This overlord supercedes the default queen overlord once the colony has a storage with a minimum amount of energy.
 */
@profile
export class BunkerQueenOverlord extends Overlord {
	room: Room;
	queens: Zerg[];
	queenSetup: CreepSetup;
	storeStructures: AnyStoreStructure[];
	batteries: StructureContainer[];
	links: StructureLink[]; // hacky workaround for new typings
	quadrants: { [quadrant: string]: SupplyStructure[] };
	structureQuadrantMapping: { [id: string]: string };
	private numActiveQueens: number;
	assignments: { [queenName: string]: { [id: string]: boolean } };

	static canFunction(colony: Colony): boolean {
		return (
			colony.layout === "bunker" &&
			insideBunkerBounds(colony.spawns[0].pos, colony) &&
			(!!colony.storage || !!colony.terminal)
		);
	}

	constructor(hatchery: Hatchery, priority = OverlordPriority.core.queen) {
		super(hatchery, "bunker_queen", priority);
		this.queenSetup = Setups.queens.default;
		this.queens = this.zerg(Roles.queen);
		this.batteries = _.filter(this.room.containers, (container) =>
			insideBunkerBounds(container.pos, this.colony)
		);
		this.links = _.filter(this.room.links, (link) =>
			insideBunkerBounds(link.pos, this.colony)
		);
		this.storeStructures = _.compact([
			this.colony.terminal!,
			this.colony.storage!,
			...this.batteries,
			...this.links,
		]);
		this.structureQuadrantMapping = {};
		this.quadrants = {
			lowerRight: $.structures(this, "LR", () =>
				computeQuadrant(this.colony, quadrantFillOrder.lowerRight)
			),
			upperLeft: $.structures(this, "UL", () =>
				computeQuadrant(this.colony, quadrantFillOrder.upperLeft)
			),
			lowerLeft: $.structures(this, "LL", () =>
				computeQuadrant(this.colony, quadrantFillOrder.lowerLeft)
			),
			upperRight: $.structures(this, "UR", () =>
				computeQuadrant(this.colony, quadrantFillOrder.upperRight)
			),
		};
		this.computeQueenAssignments();
		this.computeStructureQuadrantMapping();
	}

	private computeStructureQuadrantMapping() {
		for (const structure of this.colony.hatchery?.energyStructures ?? []) {
			const quad = Object.entries(this.quadrants).find(([_q, s]) =>
				s.some((struct) => struct.id === structure.id)
			);
			if (!quad) {
				log.warning(
					`${this.print}: structure ${structure.print} not in any quadrant!`
				);
				continue;
			}
			this.structureQuadrantMapping[structure.id] = quad[0];
		}
	}

	private computeQueenAssignments() {
		let bunkerChargingPositions = _.flatten(
			bunkerChargingSpots.map((coord) =>
				getPosFromBunkerCoord(coord, this.colony).availableNeighbors(
					true
				)
			)
		);
		this.assignments = _.zipObject(
			_.map(this.queens, (queen) => [queen.name, {}])
		);
		const activeQueens = _.filter(this.queens, (queen) => !queen.spawning);
		this.numActiveQueens = activeQueens.length;
		// Reset idle positions
		this.queens.forEach((q) => delete q.memory.data.idlePos);
		// Assign quadrants to queens
		if (this.numActiveQueens > 0) {
			const quadrantAssignmentOrder = [
				this.quadrants.lowerRight,
				this.quadrants.upperLeft,
				this.quadrants.lowerLeft,
				this.quadrants.upperRight,
			];
			let i = 0;
			for (const quadrant of quadrantAssignmentOrder) {
				const queen = activeQueens[i % activeQueens.length];
				_.extend(
					this.assignments[queen.name],
					_.zipObject(_.map(quadrant, (s) => [s.id, true]))
				);

				if (quadrant[0]) {
					const chargingSpot =
						quadrant[0].pos.findClosestByLimitedRange(
							bunkerChargingPositions,
							10
						);
					if (chargingSpot) {
						bunkerChargingPositions =
							bunkerChargingPositions.filter(
								(pos) =>
									!pos.isEqualTo(
										chargingSpot.x,
										chargingSpot.y
									)
							);
						queen.memory.data.idlePos = chargingSpot.toCoord();
					}
				}
				i++;
			}
		}
	}

	refresh() {
		super.refresh();
		$.refresh(this, "batteries", "storeStructures");
		$.refreshObject(this, "quadrants");
		// Re-compute queen assignments if the number of queens has changed
		if (
			_.filter(this.queens, (queen) => !queen.spawning).length !=
			this.numActiveQueens
		) {
			this.computeQueenAssignments();
		}
	}

	init() {
		for (const battery of this.batteries) {
			if (hasMinerals(battery.store)) {
				// get rid of any minerals in the container if present
				this.colony.logisticsNetwork.requestOutputMinerals(battery);
			}
		}
		// const amount = this.colony.spawns.length > 1 ? 2 : 1;
		const amount = this.colony.room.energyCapacityAvailable > 2000 ? 2 : 1;
		this.wishlist(amount, this.queenSetup);
	}

	private getStructureQuadrant(structure: Structure) {
		return this.structureQuadrantMapping[structure.id];
	}

	// Builds a series of tasks to empty unnecessary carry contents, withdraw required resources, and supply structures
	private buildSupplyTaskManifest(queen: Zerg): GenericTask | null {
		this.debug(`${queen.print} generating supply tasks`);
		let tasks: (
			| TaskWithdraw
			| TaskWithdrawAll
			| TaskTransfer
			| TaskTransferAll
		)[] = [];
		// Step 1: figure out which requests we can supply
		const queenCarry = <StoreContents>{};
		const allStore = mergeSum(
			..._.map(this.storeStructures, (s) => s.store)
		);

		const supplyRequests: TransportRequest[] = [];
		let firstQuadrant;
		for (const priority in this.colony.transportRequests.supply) {
			for (const request of this.colony.transportRequests.supply[
				priority
			]) {
				// Check if queen is assigned to this quadrant
				if (!this.assignments[queen.name][request.target.id]) {
					this.debug(`${queen.print} not assigned there, ignoring`);
					continue;
				}

				// Check that the requests stay in the same quadrant
				if (!firstQuadrant) {
					firstQuadrant = this.getStructureQuadrant(request.target);
					this.debug(
						`${queen.print} first quadrant is ${firstQuadrant}`
					);
				} else if (
					firstQuadrant !== this.getStructureQuadrant(request.target)
				) {
					this.debug(
						`${queen.print} quadrant mismatch: ` +
							`${firstQuadrant} !== ${this.getStructureQuadrant(
								request.target
							)}`
					);
					continue;
				}
				supplyRequests.push(request);
			}
		}
		this.debug(
			() =>
				`${queen.print} ${supplyRequests.length} requests to fulfill: \n` +
				columnify(supplyRequests)
		);
		// Step 2: calculate the total amount of needed resources to supply
		const supplyTasks: TaskTransfer[] = [];
		for (const request of supplyRequests) {
			// stop when carry will be full
			const remainingAmount =
				queen.store.getCapacity() - _.sum(queenCarry);
			if (remainingAmount == 0) {
				break;
			}
			// figure out how much you can withdraw
			let amount: number | undefined = Math.min(
				request.amount,
				remainingAmount,
				allStore[request.resourceType] ?? 0
			);
			if (amount == 0) {
				continue;
			}
			// update the simulated carry
			if (!queenCarry[request.resourceType]) {
				queenCarry[request.resourceType] = 0;
			}
			queenCarry[request.resourceType] += amount;
			// handle spawns natural regen
			if (
				request.target instanceof StructureSpawn &&
				amount == request.amount
			) {
				amount = undefined;
			}
			// add a task to supply the target
			supplyTasks.push(
				Tasks.transfer(request.target, request.resourceType, amount)
			);
		}
		// Step 3: account for what we're carrying already and store the excess back
		let queenPos = queen.pos;
		if (queen.store.getUsedCapacity() > 0) {
			this.debug(`${queen.print} not empty, checking for overfill`);

			type TransferTarget =
				| StructureTerminal
				| StructureStorage
				| StructureContainer;
			const overfillTargets = _.sortBy(
				_.compact<TransferTarget>([
					this.colony.terminal!,
					this.colony.storage!,
					...this.batteries,
				]),
				(target) => Pathing.distance(queenPos, target.pos) || Infinity
			);

			for (const [res] of queen.store.contents) {
				const exceedAmount =
					queen.store.getUsedCapacity(res) - (queenCarry[res] || 0);
				if (exceedAmount < 0) {
					queenCarry[res] = -exceedAmount;
					continue;
				}

				const target = overfillTargets.find(
					(t) => t.store.getFreeCapacity(res) >= exceedAmount
				);

				if (!target) {
					log.warning(`No transfer targets for ${queen.print}!`);
					return null;
				}

				this.debug(
					`${queen.print} carrying excess ${res}, dropping off at ${target.print}`
				);

				tasks.push(Tasks.transfer(target, res, exceedAmount));
				queenPos = target.pos;
			}
		}
		// Step 4: make withdraw tasks to get the needed resources
		const withdrawTasks: TaskWithdraw[] = [];
		const neededResources = _.keys(queenCarry) as ResourceConstant[];
		const targets: AnyStoreStructure[] = _.filter(
			this.storeStructures,
			(s) =>
				_.all(
					neededResources,
					(resource) =>
						(s.store[resource] || 0) >= (queenCarry[resource] || 0)
				)
		);
		const withdrawTarget = minBy(
			targets,
			(target) => Pathing.distance(queenPos, target.pos) || Infinity
		);
		if (withdrawTarget) {
			for (const resourceType of neededResources) {
				this.debug(
					`${queen.print} ${withdrawTarget.print} contains more than needed ` +
						`(${queenCarry[resourceType]})`
				);
				withdrawTasks.push(
					Tasks.withdraw(
						withdrawTarget,
						resourceType,
						queenCarry[resourceType]
					)
				);
			}
		} else {
			const closestTarget = minBy(
				this.storeStructures,
				(target) => Pathing.distance(queenPos, target.pos) || Infinity
			);
			if (!closestTarget) {
				log.error(
					`Can't seem to find any pathable store structures in ${this.colony.print}`
				);
			} else {
				for (const resourceType of neededResources) {
					if (
						closestTarget.store[resourceType] >=
						queenCarry[resourceType]
					) {
						this.debug(
							`${queen.print} ${closestTarget.print} contains more than needed ` +
								`(${queenCarry[resourceType]})`
						);
						withdrawTasks.push(
							Tasks.withdraw(
								closestTarget,
								resourceType,
								queenCarry[resourceType]
							)
						);
					} else {
						// TODO ordering tasks for fastest route, maybe a sortby for withdraw targets?
						const hasResource = _.sortBy(
							_.filter(
								this.storeStructures,
								(s) => s.store[resourceType] > 0
							),
							(s) => -s.store[resourceType]
						); // descending sort
						let collected = 0;
						for (const storeLoc of hasResource) {
							// Might be bug in overwithdrawing
							this.debug(
								`${queen.print} ${storeLoc.print} has only ${storeLoc.store[resourceType]}`
							);
							withdrawTasks.push(
								Tasks.withdraw(
									storeLoc,
									resourceType,
									Math.min(
										queenCarry[resourceType] - collected,
										storeLoc.store[resourceType]
									)
								)
							);
							collected += storeLoc.store[resourceType];
							if (collected >= queenCarry[resourceType]) {
								break;
							}
						}
					}
				}
			}
		}

		if (!withdrawTarget && withdrawTasks.length == 0) {
			log.warning(
				`Could not find adequate withdraw structure for ${queen.print}! ` +
					`(neededResources: ${neededResources}, queenCarry: ${JSON.stringify(
						queenCarry
					)})`
			);
			return null;
		}
		// Step 4: put all the tasks in the correct order, set nextPos for each, and chain them together
		tasks = tasks.concat(withdrawTasks, supplyTasks);
		this.debug(
			`${queen.print} complete supply task manifest:\n` +
				columnify(
					tasks.map((t) => {
						return {
							name: t.name,
							target: t.target.print,
							resource: (<TaskWithdraw>t).data.resourceType,
							amount: (<TaskWithdraw>t).data.amount,
						};
					})
				)
		);
		return Tasks.chain(tasks);
	}

	// Builds a series of tasks to withdraw required resources from targets
	private buildWithdrawTaskManifest(queen: Zerg): GenericTask | null {
		const tasks: GenericTask[] = [];
		const transferTarget =
			this.colony.terminal || this.colony.storage || this.batteries[0];
		// Step 1: empty all contents (this shouldn't be necessary since queen is normally empty at this point)
		if (queen.store.getUsedCapacity() > 0) {
			if (transferTarget) {
				tasks.push(Tasks.transferAll(transferTarget));
			} else {
				log.warning(`No transfer targets for ${queen.print}!`);
				return null;
			}
		}
		// Step 2: figure out what you need to withdraw from
		const queenCarry = { energy: 0 } as { [resourceType: string]: number };
		// let allWithdrawRequests = _.compact(_.flatten(_.map(this.assignments[queen.name],
		// 													struc => this.transportRequests.withdrawByID[struc.id])));
		const withdrawRequests: TransportRequest[] = [];
		for (const priority in this.colony.transportRequests.withdraw) {
			for (const request of this.colony.transportRequests.withdraw[
				priority
			]) {
				if (this.assignments[queen.name][request.target.id]) {
					withdrawRequests.push(request);
				}
			}
		}
		for (const request of withdrawRequests) {
			// stop when carry will be full
			const remainingAmount =
				queen.store.getCapacity() - _.sum(queenCarry);
			if (remainingAmount == 0) {
				break;
			}
			// figure out how much you can withdraw
			const amount = Math.min(request.amount, remainingAmount);
			if (amount == 0) {
				continue;
			}
			// update the simulated carry
			if (!queenCarry[request.resourceType]) {
				queenCarry[request.resourceType] = 0;
			}
			queenCarry[request.resourceType] += amount;
			// add a task to supply the target
			tasks.push(
				Tasks.withdraw(request.target, request.resourceType, amount)
			);
		}
		// Step 3: put stuff in terminal/storage
		if (transferTarget) {
			tasks.push(Tasks.transferAll(transferTarget));
		} else {
			log.warning(`No transfer targets for ${queen.print}!`);
			return null;
		}
		// Step 4: return chained task manifest
		return Tasks.chain(tasks);
	}

	// private getChargingSpot(queen: Zerg): RoomPosition {
	// 	let chargeSpots = _.map(bunkerChargingSpots, coord => getPosFromBunkerCoord(coord, this.colony));
	// 	let chargeSpot = (_.first(this.assignments[queen.name]) || queen).pos.findClosestByRange(chargeSpots);
	// 	if (chargeSpot) {
	// 		return chargeSpot;
	// 	} else {
	// 		log.warning(`Could not determine charging spot for queen at ${queen.pos.print}!`);
	// 		return queen.pos;
	// 	}
	// }
	//
	// private idleActions(queen: Zerg): void {
	//
	// 	// // Refill any empty batteries
	// 	// for (let battery of this.batteries) {
	// 	// 	if (!battery.isFull) {
	// 	// 		let amount = Math.min(battery.storeCapacity - _.sum(battery.store), queen.carryCapacity);
	// 	// 		let target = this.colony.storage || this.colony.storage;
	// 	// 		if (target) {
	// 	// 			queen.task = Tasks.transfer(battery, RESOURCE_ENERGY, amount)
	// 	// 							  .fork(Tasks.withdraw(target, RESOURCE_ENERGY, amount))
	// 	// 			return;
	// 	// 		}
	// 	// 	}
	// 	// }
	//
	// 	// Go to recharging spot and get recharged
	// 	let chargingSpot = this.getChargingSpot(queen);
	// 	queen.goTo(chargingSpot, {range: 0});
	// 	// // TODO: this will cause oscillating behavior where recharge drains some energy and queen leaves to supply it
	// 	// if (queen.pos.getRangeTo(chargingSpot) == 0) {
	// 	// 	let chargingSpawn = _.first(queen.pos.findInRange(this.colony.spawns, 1));
	// 	// 	if (chargingSpawn && !chargingSpawn.spawning) {
	// 	// 		chargingSpawn.renewCreep(queen.creep);
	// 	// 	}
	// 	// }
	// }

	private handleQueen(queen: Zerg): void {
		if (
			this.colony.transportRequests.needsWithdrawing() &&
			_.any(
				_.keys(this.assignments[queen.name]),
				(id) => this.colony.transportRequests.withdrawByID[id]
			)
		) {
			// Does something need withdrawing?
			this.debug(`${queen.print}: should withdraw`);
			queen.task = this.buildWithdrawTaskManifest(queen);
		} else if (
			this.colony.transportRequests.needsSupplying() &&
			_.any(
				_.keys(this.assignments[queen.name]),
				(id) => this.colony.transportRequests.supplyByID[id]
			)
		) {
			// Does something need supplying?
			this.debug(`${queen.print}: should supply`);
			queen.task = this.buildSupplyTaskManifest(queen);
		} else if (
			this.colony.level > 5 &&
			this.colony.controller.safeModeAvailable < 3 &&
			this.colony.terminal &&
			this.colony.terminal.store[RESOURCE_GHODIUM] >= 1000 &&
			queen.store.getCapacity() >= 1000
		) {
			// Do we need safemodes?
			this.debug(`${queen.print}: should safemode`);
			// Only use 1 queen to avoid adding 2 safemodes
			if (
				queen.name == _.first(_.sortBy(this.queens, (q) => q.name)).name
			) {
				queen.task = Tasks.chain([
					Tasks.transferAll(this.colony.terminal),
					Tasks.withdraw(
						this.colony.terminal,
						RESOURCE_GHODIUM,
						1000
					),
					Tasks.generateSafeMode(this.colony.controller),
				]);
				log.alert(
					`${this.colony.print} has ${this.colony.controller.safeModeAvailable} safemodes available, ` +
						`generating a new one`
				);
			}
		}

		// Otherwise do idle actions
		if (queen.isIdle) {
			if (queen.memory.data.idlePos) {
				const idlePos = new RoomPosition(
					queen.memory.data.idlePos?.x,
					queen.memory.data.idlePos?.y,
					this.colony.room.name
				);
				if (!queen.pos.inRangeToPos(idlePos, 0)) {
					// Move the queen manually so we stop idling as early as possible
					queen.goTo(idlePos);
				}
				// log.debug(`${queen.print}: idling on ${idlePos.print}`);
			}
			// this.idleActions(queen);
			delete queen.memory._go;
		}
	}

	run() {
		this.autoRun(this.queens, (queen) => this.handleQueen(queen));
	}
}
