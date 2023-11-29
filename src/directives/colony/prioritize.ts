import { profile } from "../../profiler/decorator";
import { Directive } from "../Directive";
import { log } from "console/log";

/**
 * Claims a new room and builds a spawn but does not incubate. Removes when spawn is constructed.
 */
@profile
export class DirectivePrioritize extends Directive {
	static directiveName = "prioritize";
	static color = COLOR_PURPLE;
	static secondaryColor = COLOR_CYAN;

	constructor(flag: Flag) {
		super(flag);
	}

	spawnMoarOverlords() {}

	init() {}

	run() {
		if (
			this.room &&
			this.flag.pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0
		) {
			log.alert(
				`Cannot find construction site to prioritize at ${this.flag.pos.print}`
			);
			this.remove(true);
			return;
		}
		this.alert(`Prioritizing workers at ${this.flag.pos.printPlain}`);
		this.colony.overlords.work.prioritizeTask(this.flag);
	}
}
