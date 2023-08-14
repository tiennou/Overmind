import { TaskRetire } from 'tasks/instances/retire';
import {Colony} from '../../Colony';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';

/**
 * This overlord contains the default actions for any creeps which lack an overlord (for example, miners whose
 * miningSite is no longer visible, or guards with no directive)
 */
@profile
export class DefaultOverlord extends Overlord {

	idleZerg: Zerg[];

	constructor(colony: Colony) {
		super(colony, 'default', OverlordPriority.default);
		this.idleZerg = [];

		// for (const zerg of this.getAllZerg()) {
		// 	if (!this.creepUsageReport[zerg.roleName]) {
		// 		this.creepUsageReport[zerg.roleName] = [0, 0];
		// 	}
		// 	this.creepUsageReport[zerg.roleName]![0] += 1;
		// }
	}

	init() {
		// Zergs are collected at end of init phase; by now anything needing to be claimed already has been
		const zergs = _.map(this.colony.creeps, creep => Overmind.zerg[creep.name] || new Zerg(creep));
		this.idleZerg = _.filter(zergs, zerg => !zerg.overlord);
		for (const zerg of this.idleZerg) {
			zerg.refresh();
		}

		const retired = this.getAllZerg().filter(z => z.memory.retired);
		this.debug(`${retired.length} retired zergs: ${retired.map(z => `${z.print}@${z.pos.print}`)}`);
		const colonySpawns = this.colony?.hatchery?.spawns ?? [];
		for (const zerg of retired) {
			const nearbySpawn = zerg.pos.findClosestByMultiRoomRange(colonySpawns);
			if (nearbySpawn) {
				zerg.task = new TaskRetire(nearbySpawn);
			} else {
				zerg.suicide();
			}
		}
	}

	run() {
		for (const zerg of this.getAllZerg()) {
			zerg.run();
		}
	}
}
