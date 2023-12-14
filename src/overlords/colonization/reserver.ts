import { config } from "config";
import { Roles, Setups } from "../../creepSetups/setups";
import { DirectiveOutpost } from "../../directives/colony/outpost";
import { RoomIntel } from "../../intel/RoomIntel";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import { Tasks } from "../../tasks/Tasks";
import { Zerg } from "../../zerg/Zerg";
import { Overlord, OverlordMemory } from "../Overlord";
import { SuspensionReason } from "utilities/suspension";

/** Tick bias used to calculate if a reserver needs to be sent */
const RESERVE_BUFFER_TIME = 1000;

/**
 * Spawns reservers to reserve an outpost room
 */
@profile
export class ReservingOverlord extends Overlord {
	memory: OverlordMemory & {
		reserverCount: number;
	};

	reservers: Zerg[];
	settings = {
		resetSignature: false,
	};
	reservation: { username?: string; ticksToEnd?: number };

	constructor(
		directive: DirectiveOutpost,
		priority = OverlordPriority.remoteRoom.reserve
	) {
		super(directive, "reserve", priority);
		// Change priority to operate per-outpost
		this.priority +=
			this.outpostIndex * OverlordPriority.remoteRoom.roomIncrement;
		this.reservers = this.zerg(Roles.claim);
		this.reserverCount = 0;
		this.refreshReservation();
	}

	get deactivationReasons() {
		return new Set([
			SuspensionReason.cpu,
			SuspensionReason.upkeep,
			SuspensionReason.harassment,
			SuspensionReason.reserved,
		]);
	}

	get reserverCount() {
		return this.memory.reserverCount ?? 0;
	}

	set reserverCount(c: number) {
		this.memory.reserverCount = Math.max(0, c);
	}

	private refreshReservation() {
		if (this.room) {
			this.reservation = {
				username: this.room.controller!.reservation?.username,
				ticksToEnd: this.room.controller!.reservation?.ticksToEnd,
			};
		} else {
			this.reservation = {
				username: RoomIntel.roomReservedBy(this.pos.roomName),
				ticksToEnd: RoomIntel.roomReservationRemaining(
					this.pos.roomName
				),
			};
		}
	}

	refresh(): void {
		super.refresh();
		this.refreshReservation();
	}

	roomReservationRemaining() {
		if (this.reservation.username !== config.MY_USERNAME) {
			return 0;
		}
		return this.reservation.ticksToEnd ?? 0;
	}

	init() {
		let priority = this.priority;
		if (
			this.isSuspended &&
			this.colony.memory.outposts[this.pos.roomName].suspendReason ===
				SuspensionReason.reserved
		) {
			priority = OverlordPriority.outpostDefense.reserve;
		}
		this.wishlist(this.reserverCount, Setups.infestors.reserve, {
			priority,
		});
	}

	private handleReserver(reserver: Zerg): void {
		if (reserver.room == this.room && !reserver.pos.isEdge) {
			// If reserver is in the room and not on exit tile
			if (
				!this.room.controller!.signedByMe ||
				this.settings.resetSignature
			) {
				// Takes care of an edge case where planned newbie zone signs prevents signing until room is reserved
				if (!this.room.my && this.room.controller!.signedByScreeps) {
					reserver.task = Tasks.reserve(this.room.controller!);
				} else {
					reserver.task = Tasks.signController(this.room.controller!);
					this.settings.resetSignature = false;
				}
			} else {
				reserver.task = Tasks.reserve(this.room.controller!);
			}
		} else {
			reserver.goTo(this.pos);
		}
	}

	run() {
		const distance = (<DirectiveOutpost>this.initializer).distanceFromPOI
			.terrainWeighted;
		const waitTime =
			this.colony.hatchery?.getWaitTimeForPriority(this.priority) ?? 0;
		this.reserverCount =
			(
				this.roomReservationRemaining() - RESERVE_BUFFER_TIME <=
				waitTime + distance
			) ?
				1
			:	0;
		this.debug(
			`remaining ${this.roomReservationRemaining()}, distance: ${distance}, waitTime: ${waitTime}: needs ${
				this.reserverCount
			} reserver`
		);

		this.autoRun(
			this.reservers,
			(reserver) => this.handleReserver(reserver),
			(reserver) => reserver.avoidDanger()
		);
	}
}
