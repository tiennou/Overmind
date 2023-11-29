import { CombatSetups, Roles } from "../../creepSetups/setups";
import { DirectiveGuard } from "../../directives/defense/guard";
import { RoomIntel } from "../../intel/RoomIntel";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import { CombatZerg } from "../../zerg/CombatZerg";
import { Overlord } from "../Overlord";

/**
 * NPC defense overlord: spawns specially-optimized guards as needed to deal with standard NPC invasions
 */
@profile
export class DefenseNPCOverlord extends Overlord {
	guards: CombatZerg[];

	static requiredRCL = 3;

	constructor(
		directive: DirectiveGuard,
		priority = OverlordPriority.outpostDefense.guard
	) {
		super(directive, "guard", priority);
		this.guards = this.combatZerg(Roles.guardMelee);
	}

	// private reassignIdleGuards(): void {
	// 	// Find all idle guards
	// 	let idleGuards = _.filter(this.colony.getCreepsByRole('guard'), (guard: Zerg) => !guard.overlord);
	// 	// Reassign them all to this flag
	// 	for (let guard of idleGuards) {
	// 		guard.overlord = this;
	// 	}
	// 	// Refresh the list of guards
	// 	this.guards = this.creeps('guard');
	// }

	init() {
		const amount =
			(
				this.room &&
				(this.room.invaders.length > 0 ||
					this.room.invaderCore ||
					RoomIntel.isInvasionLikely(this.room))
			) ?
				1
			:	0;
		let setup = CombatSetups.broodlings.default;
		if (
			CombatSetups.broodlings.default.generateBody(
				this.colony.room.energyCapacityAvailable
			).length === 0
		) {
			setup = CombatSetups.broodlings.early;
		}
		this.wishlist(amount, setup, { reassignIdle: true });
	}

	run() {
		for (const guard of this.guards) {
			// Run the creep if it has a task given to it by something else; otherwise, proceed with non-task actions
			if (guard.hasValidTask) {
				guard.run();
			} else {
				guard.autoCombat(this.pos.roomName, true, undefined, {});
			}
		}
	}
}
