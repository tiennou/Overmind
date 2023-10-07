import { errorForCode } from "utilities/errors";
import { $ } from "../../caching/GlobalCache";
import { log } from "../../console/log";
import { Roles, Setups } from "../../creepSetups/setups";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import { Zerg } from "../../zerg/Zerg";
import { Overlord, OverlordMemory } from "../Overlord";
import { DirectiveGather } from "directives/resource/gather";

const DISMANTLE_CHECK = "dc";

interface GatheringOverlordMemory extends OverlordMemory {
	[DISMANTLE_CHECK]?: number;
	dismantleNeeded?: boolean;
}

/**
 * Spawns miners to harvest from remote, owned, or sourcekeeper energy deposits. Standard mining actions have been
 * heavily CPU-optimized
 */
@profile
export class GatheringOverlord extends Overlord {
	memory: GatheringOverlordMemory;

	room: Room | undefined;
	deposit: Deposit | undefined;
	isDisabled: boolean;
	gatherers: Zerg[];

	constructor(
		directive: DirectiveGather,
		priority = OverlordPriority.deposit.gatherer
	) {
		super(directive, "gather", priority);

		this.gatherers = this.zerg(Roles.drone);

		if (this.room) {
			this.deposit = this.pos.lookFor(LOOK_DEPOSITS)[0];
		}
	}

	refresh() {
		if (!this.room && Game.rooms[this.pos.roomName]) {
			// if you just gained vision of this room
			this.deposit = this.pos.lookFor(LOOK_DEPOSITS)[0];
		}
		super.refresh();
		// Refresh your references to the objects
		$.refresh(this, "deposit");
	}

	get isActive() {
		return super.isActive && !this.isDisabled;
	}

	init() {
		this.wishlist(1, Setups.drones.miners.deposit);
	}

	/**
	 * Preliminary actions performed before going into the harvest-transfer loop
	 *
	 * This check for anything to dismantle, repair or build, then ensure the creep
	 * is at least in the correct room to harvest.
	 */
	private prepareActions(gatherer: Zerg) {
		if (!this.deposit) {
			// We likely don't have visibilty, just move to it
			if (
				!gatherer.pos.inRangeTo(this.pos, 1) &&
				gatherer.store.getFreeCapacity() !== 0
			) {
				this.debug(
					`${gatherer.print} not in range, moving closer to ${this.pos}`
				);
				return this.goToGatheringSite(gatherer, true);
			}
			log.error(`${gatherer.print} has no deposit??`);
			return true;
		}
		return false;
	}

	/**
	 * Actions for handling harvesting from the source(s)
	 *
	 * This will cause the miner to try and harvest from its mining site's source(s),
	 * potentially sending it to sleep after dropping off its last batch, or move it
	 * closer if it's still too far.
	 */
	private gatherActions(gatherer: Zerg) {
		// Skip until we see the deposit
		if (!this.deposit) {
			return true;
		}

		// We don't have space, and we're not allowed to drop
		if (gatherer.store.getFreeCapacity() === 0) {
			return false;
		}

		// At this point the miner is in the room so we have vision of the deposit

		// Sleep until the deposit regens
		if (this.isSleeping(gatherer)) {
			this.debug(
				`${gatherer.print} sleeping for ${
					gatherer.memory.sleepUntil! - Game.time
				}`
			);
			return true;
		}

		// Handle harvesting and moving closer if that fails
		const result = gatherer.harvest(this.deposit);
		this.debug(
			`${gatherer.print} gathering from ${
				this.deposit.print
			}: ${errorForCode(result)}`
		);

		// The insufficent resources takes precedence over the range check, so we have
		// to make sure we are in range before deciding what to do
		const inRange = gatherer.pos.inRangeTo(this.pos, 1);
		if (result === OK) {
			// All good!
		} else if (
			inRange &&
			(result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_TIRED)
		) {
			// Do one last transfer before going to sleep so we're empty when resuming

			const ticksToRegen = this.deposit.cooldown;
			if (ticksToRegen > (gatherer.ticksToLive || Infinity)) {
				gatherer.retire();
			} else {
				this.debug(`${gatherer.print} sleeping for ${ticksToRegen}`);
				gatherer.memory.sleepUntil = Game.time + ticksToRegen;
			}
			return true;
		} else if (result === ERR_NOT_IN_RANGE) {
			this.debug(
				`${gatherer.print} not actually in range, moving closer to ${this.deposit.print}`
			);
			return this.goToGatheringSite(gatherer);
		} else if (result === ERR_NOT_OWNER && Game.time % 20 == 0) {
			log.alert(
				`${this.print} ${gatherer.print} room is reserved by hostiles!`
			);
		} else if (result === ERR_NO_BODYPART) {
			this.debug(`${gatherer.print} is not fit for duty, retiring`);
			gatherer.retire();
		} else {
			log.error(
				`${gatherer.print}: unhandled miner.harvest() exception: ${result}`
			);
		}
		// We return false here so that we attempt to transfer
		return false;
	}

	/**
	 * Handle post-harvest transfer actions
	 *
	 * This checks on the current storage of the miner (shortcircuiting if it's about to sleep
	 * so it doesn't keep energy around) and transfers it over to its preferred location.
	 */
	private handleTransfer(gatherer: Zerg) {
		if (gatherer.store.getFreeCapacity() !== 0) {
			this.debug(`${gatherer.print} not transferring`);
			return false;
		}
		// We're above capacity, haul carry back
		if (this.colony.storage) {
			this.debug(
				`${gatherer.print} overfilled, dropping into ${this.colony.storage}`
			);
			gatherer.task = Tasks.transfer(
				this.colony.storage,
				this.deposit!.depositType
			);
			return true;
		}

		return false;
	}

	/**
	 * Move onto harvesting position or near to source
	 */
	private goToGatheringSite(gatherer: Zerg, avoidSK = true): boolean {
		const range = 1;
		const pos = this.pos;
		if (!gatherer.pos.inRangeToPos(pos, range)) {
			gatherer.goTo(pos, {
				range: range,
				pathOpts: { avoidSK: avoidSK },
			});
			return true;
		}
		return false;
	}

	private isSleeping(gatherer: Zerg): boolean {
		if (gatherer.memory.sleepUntil) {
			if (Game.time >= gatherer.memory.sleepUntil) {
				delete gatherer.memory.sleepUntil;
				return false;
			}
			return true;
		}
		return false;
	}

	private handleGatherer(gatherer: Zerg) {
		// Not ready for duty yet
		if (gatherer.spawning) {
			this.debug(`${gatherer.print} spawning`);
			return;
		}

		// Stay safe out there!
		if (gatherer.avoidDanger({ timer: 10, dropEnergy: true })) {
			this.debug(`${gatherer.print} in danger!`);
			return;
		}

		// Mining site upgrade & repairs, or better positioning if out of room
		if (this.prepareActions(gatherer)) {
			return;
		}

		// Harvest and potentially sleep
		if (this.gatherActions(gatherer)) {
			return;
		}

		// Transfer resources out to storage
		this.handleTransfer(gatherer);
	}

	run() {
		this.autoRun(this.gatherers, (gatherer) =>
			this.handleGatherer(gatherer)
		);
	}
}
