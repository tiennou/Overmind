import { log } from "../../console/log";
import { Roles, Setups } from "../../creepSetups/setups";
import { DirectiveColonize } from "../../directives/colony/colonize";
import { Pathing } from "../../movement/Pathing";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import { Tasks } from "../../tasks/Tasks";
import { Zerg } from "../../zerg/Zerg";
import { Overlord } from "../Overlord";

/**
 * Spawn pioneers - early workers which help to build a spawn in a new colony, then get converted to workers or drones
 */
@profile
export class PioneerOverlord extends Overlord {
	directive: DirectiveColonize;
	pioneers: Zerg[];
	spawnSite: ConstructionSite | undefined;

	constructor(
		directive: DirectiveColonize,
		priority = OverlordPriority.colonization.pioneer
	) {
		super(directive, "pioneer", priority);
		this.directive = directive;
		this.pioneers = this.zerg(Roles.pioneer);
		this.spawnSite =
			this.room ?
				_.filter(
					this.room.constructionSites,
					(s) => s.structureType == STRUCTURE_SPAWN
				)[0]
			:	undefined;
	}

	refresh() {
		super.refresh();
		this.spawnSite =
			this.room ?
				_.filter(
					this.room.constructionSites,
					(s) => s.structureType == STRUCTURE_SPAWN
				)[0]
			:	undefined;
	}

	init() {
		let pioneersNeeded = 4;
		if ((this.colony.hatchery?.spawns.length ?? 0) < 2) {
			pioneersNeeded = 2;
		}
		this.wishlist(pioneersNeeded, Setups.pioneer);
	}

	private findStructureBlockingController(
		pioneer: Zerg
	): Structure | undefined {
		const blockingPos = Pathing.findBlockingPos(
			pioneer.pos,
			pioneer.room.controller!.pos,
			_.filter(pioneer.room.structures, (s) => !s.isWalkable)
		);
		if (blockingPos) {
			const structure = blockingPos.lookFor(LOOK_STRUCTURES)[0];
			return (
				structure ||
				log.error(
					`${this.print}: no structure at blocking pos ${blockingPos.print}!`
				)
			);
		}
	}

	private handlePioneer(pioneer: Zerg): void {
		// Ensure you are in the assigned room
		if (pioneer.room == this.room && !pioneer.pos.isEdge) {
			// Remove any blocking structures preventing claimer from reaching controller
			if (!this.room.my && this.room.structures.length > 0) {
				const dismantleTarget =
					this.findStructureBlockingController(pioneer);
				if (dismantleTarget) {
					pioneer.task = Tasks.dismantle(dismantleTarget);
					return;
				}
			}
			// Build and recharge
			if (pioneer.store.energy == 0) {
				const task = Tasks.recharge();
				if (this.directive.toColonize?.sources.length) {
					task.data.sourcesIDs =
						this.directive.toColonize?.sources.map((s) => s.id);
				}
				pioneer.task = task;
			} else if (
				this.room &&
				this.room.controller &&
				(this.room.controller.ticksToDowngrade <
					0.1 * CONTROLLER_DOWNGRADE[this.room.controller.level] ||
					!this.spawnSite) &&
				!(this.room.controller.upgradeBlocked > 0)
			) {
				// Save controller if it's about to downgrade or if you have nothing else to do
				pioneer.task = Tasks.upgrade(this.room.controller);
			} else if (this.spawnSite) {
				pioneer.task = Tasks.build(this.spawnSite);
			}
		} else {
			// pioneer.task = Tasks.goTo(this.pos);
			pioneer.goTo(this.pos, {
				pathOpts: { ensurePath: true, avoidSK: true },
			});
		}
	}

	run() {
		this.autoRun(this.pioneers, (pioneer) => this.handlePioneer(pioneer));
	}
}
