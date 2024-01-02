import { profile } from "../../profiler/decorator";
import { Directive } from "../Directive";

/**
 * Register a directive to mark a room as being forbidden
 */
@profile
export class DirectiveAvoid extends Directive {
	static directiveName = "avoid";
	static color = COLOR_GREY;
	static secondaryColor = COLOR_GREY;

	constructor(flag: Flag) {
		// It doesn't really matter since this directive acts as a global "do not go there"
		// flag but the directive system *needs* a colony so pick whichever the closest colony is.
		const colony = flag.pos.findClosestByMultiRoomRange(
			Object.values(Overmind.colonies)
		);
		if (colony) {
			flag.memory[MEM.COLONY] = colony.name;
		}
		super(flag);
	}

	spawnMoarOverlords() {}

	init(): void {}

	run(): void {
		Overmind.overseer.blockRoom(this.pos.roomName);
	}

	visuals(): void {}
}
