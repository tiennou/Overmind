import { OverlordPriority } from "priorities/priorities_overlords";
import { Colony } from "../../Colony";
import { SpawnGroup } from "../../logistics/SpawnGroup";
import { ClaimingOverlord } from "../../overlords/colonization/claimer";
import { profile } from "../../profiler/decorator";
import { Directive } from "../Directive";
import { DirectiveColonize } from "./colonize";
import { log } from "console/log";

const MAX_INCUBATION_LINEAR_DISTANCE = 10;

/**
 * Claims a new room and incubates it from the nearest (or specified) colony
 */
@profile
export class DirectiveIncubate extends Directive {
	static directiveName = "incubate";
	static color = COLOR_PURPLE;
	static secondaryColor = COLOR_WHITE;

	static requiredRCL = 4;

	incubatee: Colony | undefined;

	constructor(flag: Flag) {
		super(
			flag,
			(colony) =>
				colony.level >= DirectiveIncubate.requiredRCL &&
				_.filter(colony.flags, (flag) => DirectiveIncubate.filter(flag))
					.length == 0 &&
				Game.map.getRoomLinearDistance(
					flag.pos.roomName,
					colony.room.name
				) <= MAX_INCUBATION_LINEAR_DISTANCE
		);
		// Register incubation status
		this.incubatee =
			this.room ?
				Overmind.colonies[Overmind.colonyMap[this.room.name]]
			:	undefined;
		this.refresh();
	}

	refresh() {
		if (this.incubatee) {
			this.incubatee.state.isIncubating = true;
			this.incubatee.spawnGroup = new SpawnGroup(this.flag, {
				requiredRCL: DirectiveIncubate.requiredRCL,
				maxPathDistance: 400,
				spawnPriorityThreshold: OverlordPriority.incubationThreshold,
				spawnPriorityBoost: 200,
			});
			if (this.incubatee.spawnGroup.colonyNames.length === 0) {
				log.warning(
					`${this.print}: unable to find any nearby colony to be the incubator, removing directive`
				);
				this.remove();
			}
		}
	}

	spawnMoarOverlords() {
		// Only claim if there's no colony yet and we're not also colonizing
		if (
			!this.incubatee &&
			!DirectiveColonize.findInRoom(this.flag.pos.roomName)
		) {
			this.overlords.claim = new ClaimingOverlord(this);
		}
	}

	init() {
		if (!DirectiveColonize.isPresent(this.flag.pos.roomName)) {
			this.alert(`Incubating from ${this.colony.name}`);
		}
	}

	remove(force?: boolean): 0 | undefined {
		const res = super.remove(force);
		if (this.incubatee) {
			this.incubatee.state.isIncubating = false;
		}
		return res;
	}

	run() {
		if (this.incubatee) {
			if (
				this.incubatee.level >= DirectiveIncubate.requiredRCL &&
				this.incubatee.storage &&
				this.incubatee.terminal
			) {
				this.remove();
			}
		}
	}
}
