import { SuspensionReason } from "utilities/suspension";
import { Directive } from "../directives/Directive";
import { SpawnGroup } from "../logistics/SpawnGroup";
import { profile } from "../profiler/decorator";
import { CombatZerg } from "../zerg/CombatZerg";
import { Overlord, OverlordMemory } from "./Overlord";

export interface CombatOverlordMemory extends OverlordMemory {
	[MEM.TICK]: number;
}

export interface CombatOverlordOptions {
	requiredRCL: number;
	maxSpawnDistance?: number;
}

const getDefaultCombatOverlordMemory: () => CombatOverlordMemory = () => ({
	active: true,
	[MEM.TICK]: Game.time,
});

/**
 * CombatOverlords extend the base Overlord class to provide additional combat-specific behavior
 */
@profile
export abstract class CombatOverlord extends Overlord {
	memory: CombatOverlordMemory;
	directive: Directive;
	spawnGroup: SpawnGroup;
	requiredRCL: number; // default required RCL

	constructor(
		directive: Directive,
		name: string,
		priority: number,
		options: CombatOverlordOptions,
		getDefaultMemory = getDefaultCombatOverlordMemory
	) {
		super(directive, name, priority, getDefaultMemory);
		this.directive = directive;
		this.requiredRCL = options.requiredRCL;
		this.spawnGroup = new SpawnGroup(this, {
			requiredRCL: this.requiredRCL,
			maxPathDistance: options.maxSpawnDistance,
		});
	}

	get age(): number {
		return Game.time - this.memory[MEM.TICK];
	}

	/**
	 * A list of suspension reasons that will cause the overlord to deactivate itself.
	 *
	 * Subclasses should override this.
	 */
	get deactivationReasons() {
		return new Set([SuspensionReason.cpu, SuspensionReason.upkeep]);
	}

	// Standard sequence of actions for running combat creeps
	autoRun(
		roleCreeps: CombatZerg[],
		creepHandler: (creep: CombatZerg) => void
	) {
		for (const creep of roleCreeps) {
			if (creep.spawning) {
				continue;
			}
			if (creep.hasValidTask) {
				creep.run();
			} else {
				if (creep.needsBoosts) {
					this.handleBoosting(creep);
				} else {
					creepHandler(creep);
				}
			}
		}
	}

	/**
	 * Contains logic for shutting down the overlord
	 */
	finish(_successful: boolean): void {
		for (const zerg of this.getAllZerg()) {
			zerg.reassign(this.colony.overlords.default);
		}
		// TODO: CombatOverlord
	}
}
