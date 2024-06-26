import { NO_ACTION } from "utilities/errors";
import { log } from "../../console/log";
import { CombatSetups, Roles } from "../../creepSetups/setups";
import { DirectiveSKOutpost } from "../../directives/colony/outpostSK";
import { RoomIntel } from "../../intel/RoomIntel";
import { Movement } from "movement/Movement";
import { MoveOptions } from "movement/types";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import { CombatTargeting } from "../../targeting/CombatTargeting";
import { deref, minBy } from "../../utilities/utils";
import { Visualizer } from "../../visuals/Visualizer";
import { CombatZerg } from "../../zerg/CombatZerg";
import { CombatOverlord, CombatOverlordMemory } from "../CombatOverlord";

interface SourceReaperOverlordMemory extends CombatOverlordMemory {
	targetLairID?: string;
}

/**
 * SourceReaperOverlord -- spawns offensive creeps to allow source keeper mining
 */
@profile
export class SourceReaperOverlord extends CombatOverlord {
	static requiredRCL = 7;

	memory: SourceReaperOverlordMemory;
	targetLair: StructureKeeperLair | undefined;

	reapers: CombatZerg[];
	defenders: CombatZerg[];

	constructor(
		directive: DirectiveSKOutpost,
		priority = OverlordPriority.remoteSKRoom.sourceReaper
	) {
		super(directive, "sourceReaper", priority, {
			requiredRCL: SourceReaperOverlord.requiredRCL,
		});
		this.priority +=
			this.outpostIndex * OverlordPriority.remoteSKRoom.roomIncrement;
		this.reapers = this.combatZerg(Roles.melee);
		this.defenders = this.combatZerg(Roles.ranged);
		this.computeTargetLair();
	}

	private computeTargetLair() {
		this.targetLair =
			this.memory.targetLairID ?
				<StructureKeeperLair>deref(this.memory.targetLairID)
			:	undefined;
		if (
			!this.targetLair ||
			(this.targetLair.ticksToSpawn || Infinity) >= 299
		) {
			if (this.room) {
				// If any lairs have an active keeper, target that
				const activeLair = _.find(
					this.room.keeperLairs,
					(lair) =>
						lair.pos.findInRange(lair.room.sourceKeepers, 5)
							.length > 0
				);
				if (activeLair) {
					this.targetLair = activeLair;
				} else {
					// Otherwise target whatever is closest to spawning
					this.targetLair = minBy(
						this.room.keeperLairs,
						(lair) => lair.ticksToSpawn || Infinity
					);
				}
			}
		}
	}

	refresh() {
		super.refresh();
		this.computeTargetLair();
	}

	init() {
		let defenderAmount = 0;
		if (
			this.room &&
			(this.room.invaders.length > 0 ||
				RoomIntel.isInvasionLikely(this.room.name))
		) {
			// Spawn as many defenders as there are invaders, which might be a bit wasteful
			defenderAmount = this.room.invaders.length;
		}
		const priority = OverlordPriority.priorityOwnedRoom.prioritySKReaper;
		this.wishlist(1, CombatSetups.zerglings.sourceKeeper, { priority });
		this.wishlist(defenderAmount, CombatSetups.hydralisks.sourceKeeper, {
			priority,
		});
	}

	private handleReaper(reaper: CombatZerg) {
		const moveOpts: MoveOptions = { pathOpts: { avoidSK: false } };

		// Go to keeper room
		if (
			!this.targetLair ||
			!this.room ||
			reaper.room != this.room ||
			reaper.pos.isEdge
		) {
			log.debugCreep(reaper, `Going to room ${this.pos.print}!`);
			reaper.healSelfIfPossible();
			reaper.goTo(this.pos, moveOpts);
			return;
		}

		// Once you're safely in the room, block off the exits
		moveOpts.pathOpts!.blockExits = true;

		const nonStrongholdInvaders = this.room.invaders.filter(
			(creep) => !creep.inRampart
		);
		if (nonStrongholdInvaders.length > 0) {
			// Handle invader actions
			if (reaper.hits >= reaper.hitsMax * 0.5) {
				const result = reaper.autoMelee(this.room.invaders);
				if (result === NO_ACTION) {
					// didn't attack
					reaper.autoHeal();
				}
			} else {
				reaper.healSelfIfPossible();
			}
			// Kite around ranged invaders until a defender arrives
			if (
				this.room.invaders.length > 2 &&
				_.filter(this.defenders, (def) => def.room == this.room)
					.length == 0
			) {
				reaper.kite(
					_.filter(
						this.room.hostiles,
						(h) => h.getActiveBodyparts(RANGED_ATTACK) > 0
					),
					moveOpts
				);
				reaper.healSelfIfPossible();
			} else {
				// If defender is already here or a small invasion
				const target = CombatTargeting.findTarget(
					reaper,
					this.room.invaders
				);
				if (target) {
					Movement.invasionMove(reaper, target);
				} else {
					log.warning(
						`KeeperReaper@${reaper.pos.print}: no invader target!`
					);
				}
			}
		} else {
			// Standard keeperReaper actions
			const nearestHostile = reaper.pos.findClosestByRange(
				this.room.hostiles
			) as Creep;
			if (nearestHostile && reaper.pos.isNearTo(nearestHostile)) {
				log.debugCreep(
					reaper,
					`Attacking nearest hostile: ${nearestHostile.print}!`
				);
				reaper.attack(nearestHostile);
				reaper.move(reaper.pos.getDirectionTo(nearestHostile));
			} else {
				const keeper = this.targetLair.pos.findClosestByLimitedRange(
					this.room.sourceKeepers,
					7
				);
				if (keeper) {
					// attack the source keeper
					log.debugCreep(
						reaper,
						`Attacking source keeper: ${nearestHostile.print}!`
					);
					// stop and heal at range 4 if needed
					const approachRange =
						(
							reaper.hits == reaper.hitsMax ||
							reaper.pos.getRangeTo(keeper) <= 3
						) ?
							1
						:	4;
					reaper.goTo(keeper, {
						range: approachRange,
						pathOpts: moveOpts.pathOpts,
					});
				} else {
					// travel to next lair
					reaper.goTo(this.targetLair, {
						range: 1,
						pathOpts: moveOpts.pathOpts,
					});
				}
			}
			reaper.healSelfIfPossible();
		}
	}

	private handleDefender(defender: CombatZerg) {
		// Go to keeper room
		if (
			!this.targetLair ||
			!this.room ||
			defender.room != this.room ||
			defender.pos.isEdge
		) {
			log.debugCreep(defender, `Going to room ${this.pos.roomName}!`);
			defender.healSelfIfPossible();
			defender.goToRoom(this.pos.roomName, {
				pathOpts: { avoidSK: false },
			});
			return;
		}

		if (this.room.invaders.length > 0) {
			// Handle invader actions
			log.debugCreep(defender, `AutoCombat`);
			defender.autoSkirmish(this.room.name);
		} else {
			log.debugCreep(defender, `Standard duty`);
			const minKeepersToHelp = this.reapers.length == 0 ? 1 : 2;
			if (this.room.sourceKeepers.length >= minKeepersToHelp) {
				// Help out with keeper reaping
				defender.autoRanged();
				defender.autoHeal(false);

				const reaper = defender.pos.findClosestByRange(this.reapers);
				if (reaper) {
					defender.goTo(reaper, {
						movingTarget: defender.pos.getRangeTo(reaper) > 8,
						repathChance: 0.1,
						pathOpts: {
							maxRooms: 1,
							avoidSK: false,
							blockExits: true,
						},
					});
				} else {
					const keeper =
						this.targetLair.pos.findClosestByLimitedRange(
							this.room.sourceKeepers,
							7
						);
					if (keeper) {
						// attack the source keeper
						const range = defender.pos.getRangeTo(keeper);
						const keepAtRange =
							defender.hits < defender.hitsMax * 0.9 ? 4 : 3;
						if (range < keepAtRange) {
							defender.kite(this.room.hostiles, {
								range: keepAtRange,
								pathOpts: {
									avoidSK: false,
									blockExits: true,
								},
							});
						} else if (range > keepAtRange) {
							defender.goTo(keeper, {
								range: keepAtRange,
								pathOpts: {
									avoidSK: false,
									blockExits: true,
								},
							});
						}
					} else {
						// travel to next lair
						defender.goTo(this.targetLair, {
							range: 5,
							pathOpts: {
								avoidSK: false,
								blockExits: true,
							},
						});
					}
				}
			} else {
				// Do medic actions
				log.debugCreep(defender, `Medic actions`);
				defender.doMedicActions(this.room.name);
			}
		}
	}

	run() {
		this.autoRun(this.reapers, (reaper) => this.handleReaper(reaper));
		this.autoRun(this.defenders, (defender) =>
			this.handleDefender(defender)
		);
	}

	visuals() {
		if (this.room && this.targetLair) {
			Visualizer.marker(this.targetLair.pos);
		}
	}
}
