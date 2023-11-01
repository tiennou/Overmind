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

	/**
	 * Pickup resources dropped on manager position or in tombstones from last manager
	 */
	private pickupActions(manager: Zerg, tombstonesOnly = false): boolean {
		// Don't pickup anything if we're over-filled; it's likely we were the one who dropped it
		if (this.colony.state.isOverfilled) {
			return false;
		}

		// Look for tombstones at position
		const tombstones = manager.pos.lookFor(LOOK_TOMBSTONES);
		const tombstone = _.first(tombstones);
		if (tombstone && tombstone.store.getUsedCapacity() > 0) {
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
	private emergencyDumpingActions(manager: Zerg): boolean {
		// We only need to consider dumping if we're already overfilled
		if (!this.colony.state.isOverfilled) {
			return false;
		}

		const storage = this.commandCenter.storage;
		const terminal = this.commandCenter.terminal;
		if (!storage && !terminal) {
			return false;
		}

		if (terminal && ResourceManager.shouldDump(terminal)) {
			log.alert(
				`${this.print}: ${manager.print} is currently dumping from ${terminal.print}!`
			);
			return this.dumpFrom(manager, terminal);
		}
		if (storage && ResourceManager.shouldDump(storage)) {
			log.alert(
				`${this.print}: ${manager.print} is currently dumping from ${storage.print}!`
			);
			return this.dumpFrom(manager, storage);
		}
		return false;
	}

	/**
	 * Dump resources on ground from a target that is critically full
	 */
	private dumpFrom(
		manager: Zerg,
		target: StructureTerminal | StructureStorage
	): boolean {
		// Start by dumping unimportant stuff from the manager
		let resource = ResourceManager.getNextResourceToDump(manager);
		if (resource) {
			manager.drop(resource);
			return true;
		}

		// Then go through the target and do the same thing
		resource = ResourceManager.getNextResourceToDump(target);
		if (resource) {
			manager.task = Tasks.drop(manager.pos, resource).fork(
				Tasks.withdraw(target, resource)
			);
			return true;
		}
		return false;
	}

	/**
	 * Suicide once you get old and make sure you don't drop and waste any resources
	 */
	private deathActions(manager: Zerg): boolean {
		if (manager.ticksToLive! >= 150) {
			return false;
		}
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

	private handleManager(manager: Zerg): void {
		// Handle switching to next manager
		if (this.deathActions(manager)) {
			return;
		}

		// Emergency dumping actions for critically clogged terminals and storages
		if (this.emergencyDumpingActions(manager)) {
			return;
		}

		// Pick up any dropped resources on ground
		if (this.pickupActions(manager)) {
			return;
		}

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
