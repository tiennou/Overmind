import { SpawnGroup } from "logistics/SpawnGroup";
import { log } from "../../console/log";
import { Roles, Setups } from "../../creepSetups/setups";
import {
	DirectivePowerMine,
	PowerMineState,
} from "../../directives/resource/powerMine";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import { Tasks } from "../../tasks/Tasks";
import { Zerg } from "../../zerg/Zerg";
import { Overlord } from "../Overlord";

/**
 * Spawns special-purpose haulers for transporting resources to/from a specified target
 */
@profile
export class PowerHaulingOverlord extends Overlord {
	haulers: Zerg[];
	directive: DirectivePowerMine;
	tickToSpawnOn: number;
	numHaulers: number;
	totalCollected: number;

	// Allow time for body to spawn
	prespawnAmount = 300;

	constructor(
		directive: DirectivePowerMine,
		priority = OverlordPriority.collectionUrgent.haul
	) {
		super(directive, "powerHaul", priority);
		this.directive = directive;
		this.spawnGroup = new SpawnGroup(this, {
			requiredRCL: DirectivePowerMine.requiredRCL,
			maxPathDistance: DirectivePowerMine.maxSpawnDistance,
		});
		this.haulers = this.zerg(Roles.transport);
		this.totalCollected = this.totalCollected || 0;
		// Spawn haulers to collect ALL the power at the same time.
		const haulingPartsNeeded =
			this.directive.totalResources / CARRY_CAPACITY;
		// Calculate amount of hauling each hauler provides in a lifetime
		const haulerCarryParts = Setups.transporters.default.getBodyPotential(
			CARRY,
			this.colony
		);
		// Calculate number of haulers
		this.numHaulers = Math.ceil(haulingPartsNeeded / haulerCarryParts);
		// setup time to request the haulers
		const distance = directive.distanceFromPOI.terrainWeighted;
		this.tickToSpawnOn =
			Game.time +
			(this.directive.calculateRemainingLifespan() || 0) -
			distance -
			this.prespawnAmount;
	}

	init() {
		if (
			Game.time >= this.tickToSpawnOn &&
			this.directive.memory.state < PowerMineState.haulingComplete
		) {
			this.wishlist(this.numHaulers, Setups.transporters.default);
		}
	}

	private handleHauler(hauler: Zerg) {
		if (hauler.store.getUsedCapacity() === 0) {
			if (this.directive.memory.state >= PowerMineState.haulingComplete) {
				// FIXME: Maybe ditch this and put it as a separate on-finishing method to reassign
				log.warning(`${hauler.name} is retiring as directive is done!`);
				this.numHaulers = 0;
				hauler.retire();
			}
			// Travel to directive and collect resources
			if (hauler.inSameRoomAs(this.directive)) {
				// Pick up drops first
				if (this.directive.hasDrops) {
					const allDrops: Resource[] = _.flatten(
						_.values(this.directive.drops)
					);
					const drop = allDrops[0];
					if (drop) {
						hauler.task = Tasks.pickup(drop);
						return;
					}
				} else if (this.directive.powerBank) {
					if (hauler.pos.getRangeTo(this.directive.powerBank) > 4) {
						hauler.goTo(this.directive.powerBank);
					} else {
						hauler.say("🚬", true);
					}
					return;
				} else if (this.room && this.room.ruins) {
					const pb = this.room.ruins.filter(
						(ruin) =>
							!!ruin.store[RESOURCE_POWER] &&
							ruin.store[RESOURCE_POWER] > 0
					);
					if (pb.length > 0) {
						hauler.task = Tasks.withdraw(pb[0], RESOURCE_POWER);
					}
				} else if (this.room && this.room.drops) {
					const allDrops: Resource[] = _.flatten(
						_.values(this.room.drops)
					);
					const drop = allDrops[0];
					if (drop) {
						hauler.task = Tasks.pickup(drop);
						return;
					} else {
						hauler.retire();
						return;
					}
				}
				// Shouldn't reach here
				log.warning(
					`${hauler.name} in ${hauler.room.print}: nothing to collect!`
				);
			} else {
				hauler.goTo(this.directive);
			}
		} else {
			// Travel to colony room and deposit resources
			if (hauler.inSameRoomAs(this.colony)) {
				for (const [resourceType, amount] of hauler.store.contents) {
					if (amount == 0) {
						continue;
					}
					if (resourceType == RESOURCE_ENERGY) {
						// prefer to put energy in storage
						if (
							this.colony.storage &&
							this.colony.storage.store.getUsedCapacity() <
								STORAGE_CAPACITY
						) {
							hauler.task = Tasks.transfer(
								this.colony.storage,
								resourceType
							);
							return;
						} else if (
							this.colony.terminal &&
							this.colony.terminal.store.getUsedCapacity() <
								TERMINAL_CAPACITY
						) {
							hauler.task = Tasks.transfer(
								this.colony.terminal,
								resourceType
							);
							return;
						}
					} else {
						// prefer to put minerals in terminal
						this.directive.memory.totalCollected +=
							hauler.store.power || 0;
						if (
							this.colony.terminal &&
							this.colony.terminal.store.getUsedCapacity() <
								TERMINAL_CAPACITY
						) {
							hauler.task = Tasks.transfer(
								this.colony.terminal,
								resourceType
							);
							return;
						} else if (
							this.colony.storage &&
							this.colony.storage.store.getUsedCapacity() <
								STORAGE_CAPACITY
						) {
							hauler.task = Tasks.transfer(
								this.colony.storage,
								resourceType
							);
							return;
						}
					}
				}
				// Shouldn't reach here
				log.warning(
					`${hauler.name} in ${hauler.room.print}: nowhere to put resources!`
				);
			} else {
				hauler.task = Tasks.goToRoom(this.colony.room.name);
			}
		}
	}

	checkIfStillCarryingPower() {
		return _.find(
			this.haulers,
			(hauler) =>
				hauler.store.power != undefined && hauler.store.power > 0
		);
	}

	run() {
		this.autoRun(this.haulers, (hauler) => this.handleHauler(hauler));
	}
}
