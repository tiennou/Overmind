import { errorForCode } from "utilities/errors";
import { log } from "../../console/log";
import { CombatSetups, Roles } from "../../creepSetups/setups";
import { DirectiveModularDismantle } from "../../directives/targeting/modularDismantle";
import { Pathing } from "../../movement/Pathing";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import { Zerg } from "../../zerg/Zerg";
import { Overlord } from "../Overlord";

/**
 * Spawns special-purpose dismantlers for transporting resources to/from a specified target
 */
@profile
export class DismantleOverlord extends Overlord {
	dismantlers: Zerg[];
	directive: DirectiveModularDismantle;
	target?: Structure;
	_dismantlersNeeded: number;

	constructor(
		directive: DirectiveModularDismantle,
		priority = OverlordPriority.tasks.dismantle
	) {
		super(directive, "dismantle", priority);
		this.directive = directive;
		// this.target = target || Game.getObjectById(this.directive.memory.targetId) || undefined;
		this.dismantlers = this.zerg(Roles.dismantler);
	}

	get dismantlerSetup() {
		let setup;
		// TODO: need to move this to the new CombatCreepSetup system
		if (!!this.directive.memory.attackInsteadOfDismantle) {
			setup = CombatSetups.dismantlers.attackDismantlers;
			// } else if (this.canBoostSetup(CombatSetups.dismantlers.boosted_T3)) {
			// setup = CombatSetups.dismantlers.boosted_T3;
			// }
		} else {
			setup = CombatSetups.dismantlers.default;
		}
		setup = CombatSetups.dismantlers.default;
		return setup;
	}

	get dismantlersNeeded() {
		// setup.create below can require that if boosting is involved
		if (PHASE !== "run") {
			return this._dismantlersNeeded;
		}

		// Estimate how good the setup is at dismantling
		const dismantlerSetup = this.dismantlerSetup.create(this.colony, true);
		let dismantlingPower;
		if (this.directive.memory.attackInsteadOfDismantle) {
			const attackParts = CombatIntel.getBodyPartPotential(
				dismantlerSetup.body,
				"attack",
				dismantlerSetup.boosts
			);
			dismantlingPower = attackParts * ATTACK_POWER;
		} else {
			const dismantlingParts = CombatIntel.getBodyPartPotential(
				dismantlerSetup.body,
				"dismantle",
				dismantlerSetup.boosts
			);
			dismantlingPower = dismantlingParts * DISMANTLE_POWER;
		}

		// Calculate total needed amount of dismantling power as (resource amount * trip distance)
		const tripDistance =
			Pathing.distance(this.colony.pos, this.directive.pos) ?? 0;
		const dismantleLifetimePower =
			(CREEP_LIFE_TIME - tripDistance) * dismantlingPower;
		this._dismantlersNeeded = Math.ceil(
			(this.target ? this.target.hits : 50000) / dismantleLifetimePower
		);

		return this._dismantlersNeeded;
	}

	init() {
		// Spawn a number of dismantlers, up to a max
		const MAX_DISMANTLERS = 2;

		// Calculate number of dismantlers
		const dismantlersNeeded = this.dismantlersNeeded;
		if (dismantlersNeeded === undefined) {
			return;
		}

		if (
			this.directive.room &&
			this.target &&
			!this.directive.memory.numberSpots
		) {
			this.directive.getDismantleSpots(this.target.pos);
		}
		const nearbySpots =
			this.directive.memory.numberSpots != undefined ?
				this.directive.memory.numberSpots
			:	1;

		// needs to be reachable spots

		const numDismantlers = Math.min(
			nearbySpots,
			MAX_DISMANTLERS,
			dismantlersNeeded
		);

		// Request the dismantlers
		this.wishlist(numDismantlers, this.dismantlerSetup, {
			reassignIdle: true,
		});
	}

	private runDismantler(dismantler: Zerg) {
		if (!dismantler.inSameRoomAs(this.directive) || this.pos.isEdge) {
			const goal = this.target || this.directive;
			this.debug(`${dismantler.print}: moving to ${goal.print}`);
			dismantler.goTo(goal, { pathOpts: { avoidSK: true } });
		} else {
			if (!this.target) {
				if (this.directive.memory.targetId) {
					this.target =
						Game.getObjectById(this.directive.memory.targetId) ||
						undefined;
				}
				this.target = this.target || this.directive.getTarget();
				this.debug(
					`${dismantler.print}: had no target, but now is ${this.target?.print}`
				);
				if (!this.target) {
					log.error(`No target found for ${this.directive.print}`);
				}
			} else {
				const res =
					!!this.directive.memory.attackInsteadOfDismantle ?
						dismantler.attack(this.target)
					:	dismantler.dismantle(this.target);
				this.debug(
					`${dismantler.print}: has target ${this.target
						?.print}, tried to dismantle: ${errorForCode(res)}`
				);
				if (res === ERR_NOT_IN_RANGE || res === ERR_INVALID_TARGET) {
					const ret = dismantler.goTo(this.target, {
						pathOpts: { avoidSK: true },
					});
					this.debug(
						`${dismantler.print}: move to target ${this.target
							?.print}: ${errorForCode(ret)}`
					);
				} else if (res == ERR_NO_BODYPART) {
					if (dismantler.bodypartCounts[WORK] !== 0) {
						// FIXME: Damaged, should fallback to colony to get healed
					}
					dismantler.retire();
				}
			}
		}
	}

	run() {
		// Call this here so that the calculation happens in the RUN phase
		const _needed = this.dismantlersNeeded;
		this.autoRun(this.dismantlers, (dismantler) =>
			this.runDismantler(dismantler)
		);
	}
}
