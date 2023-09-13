import { TransportRequestGroup } from "logistics/TransportRequestGroup";
import { $ } from "../../caching/GlobalCache";
import { Roles, Setups } from "../../creepSetups/setups";
import { CommandCenter } from "../../hiveClusters/commandCenter";
import { SpawnRequestOptions } from "../../hiveClusters/hatchery";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import { Tasks } from "../../tasks/Tasks";
import { minBy } from "../../utilities/utils";
import { Zerg } from "../../zerg/Zerg";
import { Overlord } from "../Overlord";
import { WorkerOverlord } from "./worker";
import { log } from "console/log";
import { ResourceManager } from "logistics/ResourceManager";

/**
 * Command center overlord: spawn and run a dediated commandCenter attendant
 */
@profile
export class CommandCenterOverlord extends Overlord {
	static MAX_TERMINAL_FILLED_PERCENTAGE: number = 0.98;

	mode: "twoPart" | "bunker";
	managers: Zerg[];
	commandCenter: CommandCenter;
	// depositTarget: StructureTerminal | StructureStorage;
	managerRepairTarget: StructureRampart | StructureWall | undefined;

	static settings: {};

	constructor(
		commandCenter: CommandCenter,
		priority = OverlordPriority.core.manager
	) {
		super(commandCenter, "manager", priority);
		this.commandCenter = commandCenter;
		this.mode = this.colony.layout;
		this.managers = this.zerg(Roles.manager);
		// if (this.commandCenter.terminal && _.sum(this.commandCenter.terminal.store) < TERMINAL_CAPACITY - 5000) {
		// 	this.depositTarget = this.commandCenter.terminal;
		// } else {
		// 	this.depositTarget = this.commandCenter.storage;
		// }
		if (this.colony.bunker) {
			const anchor = this.colony.bunker.anchor;
			$.set(this, "managerRepairTarget", () =>
				minBy(
					_.filter(
						anchor.findInRange(anchor.room!.barriers, 3),
						(b) =>
							b.hits <
							WorkerOverlord.settings.barrierHits[
								this.colony.level
							]
					),
					(b) => b.hits
				)
			);
		}
	}

	refresh() {
		super.refresh();
		$.refresh(this, "managerRepairTarget");
	}

	init() {
		let setup = Setups.managers.default;
		let spawnRequestOptions: SpawnRequestOptions = {};
		if (this.colony.layout == "twoPart") {
			setup = Setups.managers.twoPart;
		}
		if (
			this.colony.bunker &&
			this.colony.bunker.coreSpawn &&
			this.colony.level == 8 &&
			!this.colony.roomPlanner.memory.relocating
		) {
			setup = Setups.managers.stationary;
			// // Spawn a worker manager to repair central tiles
			// if (this.managerRepairTarget &&
			// 	this.managerRepairTarget.hits < WorkerOverlord.settings.barrierHits[this.colony.level] - 1e5 &&
			// 	this.colony.assets.energy > WorkerOverlord.settings.fortifyDutyThreshold) {
			// 	setup = Setups.managers.stationary_work; // use working manager body if you have something to repair
			// }
			spawnRequestOptions = {
				spawn: this.colony.bunker.coreSpawn,
				directions: [
					this.colony.bunker.coreSpawn.pos.getDirectionTo(
						this.colony.bunker.anchor
					),
				],
			};
		}
		this.wishlist(1, setup, { options: spawnRequestOptions });
	}

	/**
	 * Dump anything you are currently holding into terminal or storage
	 */
	private unloadCarry(manager: Zerg): boolean {
		// Nothing to do if creep is empty
		if (manager.store.getUsedCapacity() == 0) {
			return false;
		}

		let task;
		for (const [resource, amount] of manager.store.contents) {
			const target = ResourceManager.targetForResource(
				this.colony,
				resource,
				amount
			);
			if (!target) {
				this.debug(
					() =>
						`${manager.print} nothing wants to take ${amount} of ${resource}`
				);
				continue;
			}

			this.debug(
				() =>
					`${manager.print}: unloading ${amount} of ${resource} to ${target.print}`
			);
			const transfer = Tasks.transfer(target, resource, amount);
			task = task ? task.fork(transfer) : transfer;
		}

		if (!task) {
			log.warning(
				`${this.print}: ${
					manager.print
				} has nowhere to unload carry ${JSON.stringify(manager.store)}`
			);
			return false;
		}
		manager.task = task;
		return true;
	}

	/**
	 * Handle any supply requests from your transport request group
	 */
	private supplyActions(manager: Zerg): boolean {
		const request =
			this.commandCenter.transportRequests.getPrioritizedClosestRequest(
				manager.pos,
				"supply"
			);
		if (request) {
			this.debug(
				() =>
					`${
						manager.print
					} has a supply request: ${TransportRequestGroup.logRequest(
						request
					)}`
			);
			const amount = Math.min(
				request.amount,
				manager.store.getCapacity()
			);
			const resource = request.resourceType;
			// If we have enough to fulfill the request, we're done
			if (manager.store[request.resourceType] >= amount) {
				this.debug(
					() =>
						`${manager.print} supplying ${request.target.print} with ${amount} of ${resource}`
				);
				manager.task = Tasks.transfer(request.target, resource, amount);
				return true;
			} else if (manager.store[request.resourceType] > 0) {
				// Otherwise, if we have any currently in manager's carry, transfer it to the requestor
				this.debug(
					() =>
						`${manager.print} supplying ${request.target.print} with ${amount} of ${resource}`
				);
				manager.task = Tasks.transfer(
					request.target,
					resource,
					manager.store[request.resourceType]
				);
				return true;
			} else {
				const storage = this.commandCenter.storage;
				const terminal = this.commandCenter.terminal;
				// Otherwise, we don't have any of the resource in the carry
				if (this.unloadCarry(manager)) {
					// if we have other crap, we should unload it
					return true;
				}
				// Otherwise, we have an empty carry; withdraw the right amount of resource and transfer it
				let withdrawFrom:
					| StructureStorage
					| StructureTerminal
					| undefined;
				let withdrawAmount = amount;
				if (storage.store[resource] > 0) {
					withdrawFrom = storage;
					withdrawAmount = Math.min(amount, storage.store[resource]);
				} else if (terminal && terminal.store[resource] > 0) {
					withdrawFrom = terminal;
					withdrawAmount = Math.min(amount, terminal.store[resource]);
				}
				if (withdrawFrom) {
					this.debug(
						() =>
							`${manager.print} withdraws from ${
								withdrawFrom!.print
							}, ${withdrawAmount} to supply ${TransportRequestGroup.logRequest(
								request
							)}`
					);
					manager.task = Tasks.chain([
						Tasks.withdraw(withdrawFrom, resource, withdrawAmount),
						Tasks.transfer(
							request.target,
							resource,
							withdrawAmount
						),
					]);
					return true;
				} else {
					// log.warning(`${manager.print}: could not fulfill supply request for ${resource}!`);
					return false;
				}
			}
		} else {
			return false;
		}
	}

	/**
	 * Handle any withdrawal requests from your transport request group
	 */
	private withdrawActions(manager: Zerg): boolean {
		const freeCapacity = manager.store.getFreeCapacity();
		if (freeCapacity > 0) {
			const request =
				this.commandCenter.transportRequests.getPrioritizedClosestRequest(
					manager.pos,
					"withdraw"
				);
			if (request) {
				this.debug(
					() =>
						`${
							manager.print
						} has free space and a withdraw request: ${TransportRequestGroup.logRequest(
							request
						)}`
				);
				const amount = Math.min(request.amount, freeCapacity);
				manager.task = Tasks.withdraw(
					request.target,
					request.resourceType,
					amount
				);
				const supplyRequest =
					this.commandCenter.transportRequests.getPrioritizedClosestRequest(
						manager.pos,
						"supply",
						(req) => req.resourceType === request.resourceType
					);
				if (supplyRequest) {
					this.debug(
						() =>
							`${
								manager.print
							} can supply request: ${TransportRequestGroup.logRequest(
								supplyRequest
							)}`
					);
					manager.task = Tasks.transfer(
						supplyRequest.target,
						supplyRequest.resourceType,
						supplyRequest.amount
					).fork(manager.task);
					return true;
				}
			}
		}

		// Try to supply someone with what we have stored/withdrew
		if (this.supplyActions(manager)) {
			return true;
		}

		// Otherwise just try to unload
		if (this.unloadCarry(manager)) {
			return true;
		}

		return false;
	}

	// /**
	//  * Move energy into terminal if storage is too full and into storage if storage is too empty
	//  */
	// private equalizeStorageAndTerminal_old(manager: Zerg): boolean {
	// 	this.debug('equalizeStorageAndTerminal');
	// 	const storage = this.commandCenter.storage;
	// 	const terminal = this.commandCenter.terminal;
	// 	if (!storage || !terminal) return false;
	//
	// 	const equilibrium = Energetics.settings.terminal.energy.equilibrium;
	// 	const tolerance = Energetics.settings.terminal.energy.tolerance;
	// 	const storageTolerance = Energetics.settings.storage.total.tolerance;
	// 	const storageEnergyCap = Energetics.settings.storage.total.cap;
	// 	// const terminalState = this.colony.terminalState;
	// 	// // Adjust max energy allowable in storage if there's an exception state happening
	// 	// if (terminalState && terminalState.type == 'out') {
	// 	// 	storageEnergyCap = terminalState.amounts[RESOURCE_ENERGY] || 0;
	// 	// }
	//
	// 	// Move energy from storage to terminal if there is not enough in terminal or if there's terminal evacuation
	// 	if ((terminal.energy < equilibrium - tolerance || storage.energy > storageEnergyCap + storageTolerance)
	// 		&& storage.energy > 0) {
	// 		if (this.unloadCarry(manager)) return true;
	// 		manager.task = Tasks.withdraw(storage);
	// 		manager.task.parent = Tasks.transfer(terminal);
	// 		return true;
	// 	}
	//
	// 	// Move energy from terminal to storage if there is too much in terminal and there is space in storage
	// 	if (terminal.energy > equilibrium + tolerance && storage.energy < storageEnergyCap) {
	// 		if (this.unloadCarry(manager)) return true;
	// 		manager.task = Tasks.withdraw(terminal);
	// 		manager.task.parent = Tasks.transfer(storage);
	// 		return true;
	// 	}
	//
	// 	// Nothing has happened
	// 	return false;
	// }

	// private moveMineralsToTerminal(manager: Zerg): boolean {
	// 	const storage = this.commandCenter.storage;
	// 	const terminal = this.commandCenter.terminal;
	// 	if (!storage || !terminal) {
	// 		return false;
	// 	}
	// 	// Don't do this if terminal is critically full
	// 	if (terminal.store.getFreeCapacity() < (1 - CommandCenterOverlord.MAX_TERMINAL_FILLED_PERCENTAGE)
	// 		* terminal.store.getCapacity()) {
	// 		return false;
	// 	}
	// 	// Move all non-energy resources from storage to terminal
	// 	for (const [resourceType, amount] of storage.store.contents) {
	// 		if (resourceType != RESOURCE_ENERGY && resourceType != RESOURCE_OPS && amount > 0
	// 			&& terminal.store[resourceType] < 5000) {
	// 			if (this.unloadCarry(manager)) return true;
	// 			manager.task = Tasks.withdraw(storage, resourceType);
	// 			manager.task.parent = Tasks.transfer(terminal, resourceType);
	// 			return true;
	// 		}
	// 	}
	// 	return false;
	// }

	/**
	 * Pickup resources dropped on manager position or in tombstones from last manager
	 */
	private pickupActions(manager: Zerg, tombstonesOnly = false): boolean {
		// Look for tombstones at position
		const tombstones = manager.pos.lookFor(LOOK_TOMBSTONES);
		const tombstone = _.first(tombstones);
		if (tombstone) {
			this.debug(`picking up from tombstone ${tombstone.print}`);
			manager.task = Tasks.chain([
				Tasks.withdrawAll(tombstone),
				Tasks.transferAll(this.commandCenter.storage),
			]);
			return true;
		}
		if (tombstonesOnly) {
			return false; // skip next bit if only looking at tombstones
		}
		// Pickup any resources that happen to be dropped where you are
		const resources = manager.pos.lookFor(LOOK_RESOURCES);
		const resource = _.first(resources);
		if (resource) {
			this.debug(`picking up from resource ${resource.print}`);
			manager.task = Tasks.chain([
				Tasks.pickup(resource),
				Tasks.transferAll(this.commandCenter.storage),
			]);
			return true;
		}
		return false;
	}

	/**
	 * When storage + terminal are critically full, start dumping the least useful stuff on the ground.
	 * This should rarely be run; added in Feb 2020 to fix a critical issue where I hadn't added factory code and all
	 * my terminals and storage filled up with crap.
	 */
	// private emergencyDumpingActions(manager: Zerg): boolean {
	// 	this.debug('emergencyDumpingActions');
	// 	const storage = this.commandCenter.storage;
	// 	const terminal = this.commandCenter.terminal;
	// 	if (!storage && !terminal) {
	// 		return false;
	// 	}
	// 	const storageCapacity = storage ? storage.store.getFreeCapacity() : 0;
	// 	const terminalCapacity = terminal ? terminal.store.getFreeCapacity() : 0;
	// 	const storageEnergy = storage ? storage.store.energy : 0;
	// 	const terminalEnergy = terminal ? terminal.store.energy : 0;
	// 	// const freeCapacity = (storage ? storage.store.getFreeCapacity() : 0) +
	// 	// 					 (terminal ? terminal.store.getFreeCapacity() : 0);
	// 	// const energy = (storage ? storage.store.energy : 0) +
	// 	// 			   (terminal ? terminal.store.energy : 0);
	// 	// if (energy >= 5000) {
	// 	// 	return false;
	// 	// }
	// 	const DUMP_THRESHOLD = 5000;
	// 	if (terminal && terminalCapacity < DUMP_THRESHOLD && terminalEnergy < DUMP_THRESHOLD) {
	// 		return this.dumpFrom(manager, terminal);
	// 	}
	// 	if (storage && storageCapacity < DUMP_THRESHOLD && storageEnergy < DUMP_THRESHOLD) {
	// 		return this.dumpFrom(manager, storage);
	// 	}
	// 	return false;
	// }

	/**
	 * Dump resources on ground from a target that is critically full
	 */
	// private dumpFrom(manager: Zerg, target: StructureTerminal | StructureStorage): boolean {
	// 	this.say('Dump!');
	// 	// Start dumping least valuable shit on the ground
	// 	const toDump = _.sortBy(BASE_RESOURCES, resource => (target.store[resource] || 0) * -1);
	// 	const toDumpInCarry = _.first(_.filter(toDump, res => manager.carry[res] > 0));
	// 	// Drop anything you have in carry that is dumpable
	// 	if (toDumpInCarry) {
	// 		manager.drop(toDumpInCarry);
	// 		return true;
	// 	}
	// 	// Take out stuff to dump
	// 	for (const resource of toDump) {
	// 		if (target.store[resource] > 0) {
	// 			manager.task = Tasks.drop(manager.pos, resource).fork(Tasks.withdraw(target, resource));
	// 			return true;
	// 		}
	// 	}
	// 	log.warning('No shit to drop! Shouldn\'t reach here!');
	// 	return false;
	// }

	/**
	 * Suicide once you get old and make sure you don't drop and waste any resources
	 */
	private deathActions(manager: Zerg): boolean {
		const nearbyManagers = _.filter(
			this.managers,
			(manager) =>
				manager.pos.inRangeTo(this.commandCenter.pos, 3) &&
				(manager.ticksUntilSpawned || 0) <= 10
		);
		if (nearbyManagers.length > 1) {
			// > 1 including self
			if (manager.store.getUsedCapacity() > 0) {
				this.unloadCarry(manager);
			} else {
				manager.retire();
			}
			return true;
		}
		return false;
	}

	// private preventTerminalFlooding(manager: Zerg): boolean {
	// 	// Prevent terminal flooding
	// 	if (this.room && this.room.terminal && this.room.storage && _.sum(this.room.terminal.store)
	// 		> this.room.terminal.store.getCapacity() * CommandCenterOverlord.MAX_TERMINAL_FILLED_PERCENTAGE) {
	// 		let max = 0;
	// 		let resType: ResourceConstant = RESOURCE_ENERGY;
	// 		for (const res in this.room.terminal.store) {
	// 			const amount = this.room.terminal.store[<ResourceConstant>res];
	// 			if (amount && amount > max && res !== RESOURCE_ENERGY) {
	// 				max = amount;
	// 				resType = <ResourceConstant>res;
	// 			}
	// 		}
	//
	// 		manager.task = Tasks.transferAll(this.room.storage).fork(Tasks.withdraw(this.room.terminal, resType));
	// 		return true;
	// 	}
	// 	return false;
	// }

	private handleManager(manager: Zerg): void {
		// Handle switching to next manager
		if (manager.ticksToLive! < 150) {
			if (this.deathActions(manager)) {
				return;
			}
		}
		// if (this.preventTerminalFlooding(manager)) return;
		// Emergency dumping actions for critically clogged terminals and storages
		// if (this.emergencyDumpingActions(manager)) return;
		// Pick up any dropped resources on ground
		if (this.pickupActions(manager)) {
			return;
		}
		// // Move minerals from storage to terminal if needed
		// if (hasMinerals(this.commandCenter.storage.store)) {
		// 	if (this.moveMineralsToTerminal(manager)) return;
		// }
		// Fill up storage before you destroy terminal if rebuilding room
		// if (this.colony.state.isRebuilding) {
		// 	if (this.moveEnergyFromRebuildingTerminal(manager)) return;
		// }
		// Moving energy to terminal gets priority above withdraw/supply if evacuating room
		// if (this.colony.state.isEvacuating) {
		// 	if (this.balanceStorageAndTerminal(manager)) return;
		// }
		// Fulfill withdraw requests normal priority and above
		// if (this.commandCenter.transportRequests.needsWithdrawing(Priority.Normal)) {
		// 	if (this.withdrawActions(manager)) return;
		// }
		// Fulfill supply requests normal priority and above
		// if (this.commandCenter.transportRequests.needsSupplying(Priority.Normal)) {
		// 	if (this.supplyActions(manager)) return;
		// }
		// Move resources between storage and terminal at this point if room isn't being evacuated
		// if (!this.colony.state.isEvacuating) {
		// 	if (this.balanceStorageAndTerminal(manager)) return;
		// }
		// Fulfill remaining low-priority withdraw requests
		if (this.commandCenter.transportRequests.needsWithdrawing()) {
			if (this.withdrawActions(manager)) {
				return;
			}
		}
		// Fulfill remaining low-priority supply requests
		if (this.commandCenter.transportRequests.needsSupplying()) {
			if (this.supplyActions(manager)) {
				return;
			}
		}
	}

	private repairActions(manager: Zerg) {
		if (
			this.mode == "bunker" &&
			this.managerRepairTarget &&
			manager.getActiveBodyparts(WORK) > 0
		) {
			// Repair ramparts when idle
			if (manager.store.energy > 0) {
				manager.repair(this.managerRepairTarget);
				return true;
			}

			const storage = this.commandCenter.storage;
			const terminal = this.commandCenter.terminal;
			const energyTarget =
				storage.store[RESOURCE_ENERGY] > 0 ? storage : terminal;
			if (energyTarget) {
				manager.withdraw(energyTarget);
				return true;
			}
		}
		return false;
	}

	/**
	 * Handle idle actions if the manager has nothing to do
	 */
	private idleActions(manager: Zerg): void {
		// Look for something to repair
		if (this.repairActions(manager)) {
			return;
		}
		// Otherwise unload our carry
		if (manager.store.getUsedCapacity() > 0 && this.unloadCarry(manager)) {
			return;
		}
		// Ensure we're at our idling spot
		if (!manager.pos.isEqualTo(this.commandCenter.idlePos)) {
			manager.goTo(this.commandCenter.idlePos);
		}
	}

	run() {
		for (const manager of this.managers) {
			// Get a task if needed
			if (manager.isIdle) {
				this.handleManager(manager);
			}
			// manager.debug(print(manager.task))
			// If you have a valid task, run it; else go to idle pos
			if (manager.hasValidTask) {
				manager.run();
			} else {
				this.idleActions(manager);
			}
		}
	}
}
