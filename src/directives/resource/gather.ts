import { GatheringOverlord } from "overlords/mining/gatherer";
import { profile } from "../../profiler/decorator";
import { Directive } from "../Directive";
import { log } from "console/log";

/**
 * Standard gathering directive. Harvests from a deposit
 */
@profile
export class DirectiveGather extends Directive {
	static directiveName = "gather";
	static color = COLOR_YELLOW;
	static secondaryColor = COLOR_GREEN;

	overlords: {
		gather: GatheringOverlord;
	};

	constructor(flag: Flag) {
		super(flag);
	}

	spawnMoarOverlords() {
		this.overlords.gather = new GatheringOverlord(this);
	}

	init() {}

	run() {
		if (
			this.overlords.gather.isDepleted &&
			this.overlords.gather.gatherers.length === 0
		) {
			log.alert(
				`${this.print} No more deposit at ${this.pos}, removing!`
			);
			this.remove();
		}
	}
}
