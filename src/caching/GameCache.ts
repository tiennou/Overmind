import {DirectiveOutpost} from '../directives/colony/outpost';
import {DirectiveSKOutpost} from '../directives/colony/outpostSK';
import {profile} from '../profiler/decorator';

/**
 * GameCache does initial low-level preprocessing before each tick is run
 */
@profile
export class GameCache implements ICache {

	overlords: { [overlord: string]: { [roleName: string]: string[] } };
	creepsByColony: { [colonyName: string]: Creep[] };
	targets: { [ref: string]: string[] };
	outpostFlags: Flag[];

	constructor() {
		this.outpostFlags = _.filter(Game.flags, flag => DirectiveOutpost.filter(flag)
														 || DirectiveSKOutpost.filter(flag));
	}

	cacheCreepByColony(creep: Creep) {
		const colony = creep.memory[MEM.COLONY];
		if (colony) {
			if (!this.creepsByColony[colony]) {
				this.creepsByColony[colony] = [];
			}
			this.creepsByColony[colony].push(creep);
		}
	}

	cacheOverlord(creep: AnyCreep) {
		const overlordRef = creep.memory[MEM.OVERLORD];
		const role = creep.memory.role;
		if (overlordRef && role) {
			if (!this.overlords[overlordRef]) {
				this.overlords[overlordRef] = {};
			}
			if (!this.overlords[overlordRef][role]) {
				this.overlords[overlordRef][role] = [];
			}
			this.overlords[overlordRef][role].push(creep.name);
		}
	}

	cacheTaskTargets(creep: AnyCreep) {
		let task = creep.memory.task;
		while (task) {
			if (!this.targets[task._target.ref]) this.targets[task._target.ref] = [];
			this.targets[task._target.ref].push(creep.name);
			task = task._parent;
		}
	}

	rebuildCache() {
		this.overlords = {};
		this.creepsByColony = {};
		this.targets = {};
		for (const name of Object.keys(Game.creeps)) {
			const creep = Game.creeps[name];
			this.cacheCreepByColony(creep);
			this.cacheOverlord(creep);
			this.cacheTaskTargets(creep);
		}

		for (const name of Object.keys(Game.powerCreeps)) {
			const creep = Game.powerCreeps[name];
			this.cacheOverlord(creep);
			this.cacheTaskTargets(creep);
		}
	}

	build() {
		this.rebuildCache();
	}

	refresh() {
		this.rebuildCache();
	}
}




