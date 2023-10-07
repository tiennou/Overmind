import { GatheringOverlord } from "overlords/mining/gatherer";
import { profile } from "../../profiler/decorator";
import { Directive } from "../Directive";
import { log } from "console/log";

const DEPOSIT_COOLDOWN_CUTOFF = 500;

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
		const deposit = this.overlords.gather.deposit;
		if (this.room && !deposit) {
			log.alert(
				`${this.print} No more deposit at ${this.pos}, removing!`
			);
			this.remove();
			return;
		}

		if (
			this.room &&
			deposit &&
			deposit.lastCooldown > DEPOSIT_COOLDOWN_CUTOFF
		) {
			log.alert(
				`Deposit ${deposit} cooldown over cutoff ${deposit.lastCooldown} > ${DEPOSIT_COOLDOWN_CUTOFF}, removing!`
			);
			this.remove();
			return;
		}
	}
}
