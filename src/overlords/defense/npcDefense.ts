import { CombatOverlord } from "overlords/CombatOverlord";
import { CombatSetups, Roles } from "../../creepSetups/setups";
import { DirectiveGuard } from "../../directives/defense/guard";
import { RoomIntel } from "../../intel/RoomIntel";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import { CombatZerg } from "../../zerg/CombatZerg";

/**
 * NPC defense overlord: spawns specially-optimized guards as needed to deal with standard NPC invasions
 */
@profile
export class DefenseNPCOverlord extends CombatOverlord {
	guards: CombatZerg[];

	static requiredRCL = 3;

	constructor(
		directive: DirectiveGuard,
		priority = OverlordPriority.outpostDefense.guard
	) {
		super(directive, "guard", priority, {
			requiredRCL: DefenseNPCOverlord.requiredRCL,
		});
		this.guards = this.combatZerg(Roles.guardMelee);
	}

	init() {
		const amount =
			(
				this.room &&
				(this.room.invaders.length > 0 ||
					this.room.invaderCore ||
					RoomIntel.isInvasionLikely(this.room.name))
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

	private handleGuard(guard: CombatZerg) {
		guard.autoCombat(this.pos.roomName);
	}

	run() {
		this.autoRun(this.guards, (guard) => this.handleGuard(guard));
	}
}
