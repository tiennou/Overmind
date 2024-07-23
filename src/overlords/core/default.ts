import { Colony } from "../../Colony";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import { Zerg } from "../../zerg/Zerg";
import { Overlord } from "../Overlord";
import { isCreep } from "declarations/typeGuards";

/**
 * This overlord contains the default actions for any creeps which lack an overlord (for example, miners whose
 * miningSite is no longer visible, or guards with no directive)
 */
@profile
export class DefaultOverlord extends Overlord {
	refreshZerg: Map<string, Zerg>;
	idleZerg: Zerg[];
	retiredZerg: Zerg[];

	constructor(colony: Colony) {
		super(colony, "default", OverlordPriority.default);
		this.idleZerg = [];
		this.retiredZerg = [];
		this.refreshZerg = new Map();
	}

	init() {
		// Zergs are collected at end of init phase; by now anything needing to be claimed already has been
		const colonyZergs = _.map(
			this.colony.creeps,
			(creep) =>
				Overmind.zerg[creep.name] || (isCreep(creep) && new Zerg(creep))
		);
		this.idleZerg = _.filter(colonyZergs, (zerg) => !zerg.overlord);

		for (const zerg of this.idleZerg) {
			this.refreshZerg.set(zerg.id, zerg);
		}

		this.retiredZerg = _.filter(
			colonyZergs,
			(zerg) => zerg.task?.name === "retire"
		);

		for (const zerg of this.retiredZerg) {
			this.refreshZerg.set(zerg.id, zerg);
		}

		this.debug(() => {
			const obj = {
				idle: this.idleZerg.map((z) => z.print).join(", "),
				retired: this.retiredZerg.map((z) => z.print).join(", "),
			};
			return `${this.print}: ${JSON.stringify(obj)}`;
		});

		for (const [_id, zerg] of this.refreshZerg) {
			zerg.refresh();
		}
	}

	private handleIdle(_zerg: Zerg) {
		// We do nothing here, this only exists so manually scheduled tasks to idle creeps get to run
	}

	private handleRetired(_zerg: Zerg) {
		// We do nothing here, this only exists so manually scheduled tasks to idle creeps get to run
	}

	run() {
		this.autoRun(this.idleZerg, (idleZerg) => this.handleIdle(idleZerg));
		this.autoRun(this.retiredZerg, (idleZerg) =>
			this.handleRetired(idleZerg)
		);
	}
}
