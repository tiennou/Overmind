// Overmind class - manages colony-scale operations and contains references to all brain objects

import {Colony} from './Colony';
import {DirectiveWrapper} from './maps/map_directives';
import {profile} from './lib/Profiler';
import {GameCache} from './caching';
import {WrappedCreep} from './roles/Abstract';
import {DirectiveOutpost} from './directives/directive_outpost';


@profile
export default class Overmind implements IOvermind {
	cache: ICache;
	Colonies: { [roomName: string]: Colony };				// Global hash of all colony objects
	colonyMap: { [roomName: string]: string };				// Global map of colony associations for possibly-null rooms
	invisibleRooms: string[]; 								// Names of rooms across all colonies that are invisible
	// Overseers: { [roomName: string]: Overseer };			// Global hash of colony overlords

	constructor() {
		this.cache = new GameCache();
		this.Colonies = {};
		this.colonyMap = {};
		this.invisibleRooms = [];
		// this.Overseers = {};
	}


	/* Instantiate a new colony for each owned rom */
	private registerColonies(): void {

		let colonyOutposts: { [roomName: string]: string[] } = {}; // key: lead room, values: outposts[]

		// Register colony capitols
		for (let name in Game.rooms) {
			if (Game.rooms[name].my) { 			// Will add a new colony for each owned room
				colonyOutposts[name] = [];		// Make a blank list of outposts
				this.colonyMap[name] = name;	// Register capitols to their own colonies
				// Place a new colony flag for any owned rooms on the controller if there isn't one
				// if (Game.rooms[name].controller!.pos.lookFor(LOOK_FLAGS).length == 0) {
				// 	DirectiveColony.create(Game.rooms[name].controller!.pos);
				// }
			}
		}

		// Register colony outposts
		let outpostFlags = _.filter(Game.flags, DirectiveOutpost.filter);
		for (let flag of outpostFlags) {
			if (!flag.memory.colony) {
				flag.recalculateColony();
			}
			let colonyName = flag.memory.colony as string;
			if (colonyOutposts[colonyName]) {
				let outpostName = flag.pos.roomName;
				this.colonyMap[outpostName] = colonyName; // Create an association between room and colony name
				colonyOutposts[colonyName].push(outpostName);

				// // TODO: handle observer logic
				// let thisRoom = Game.rooms[roomName];
				// if (thisRoom) {
				// 	thisRoom.memory.colony = colonyName;
				// } else {
				// 	this.invisibleRooms.push(roomName); // register room as invisible to be handled by observer
				// }
			}
		}

		// Initialize the Colonies and give each one an Overseer
		for (let colonyName in colonyOutposts) {
			// let colonyFlag = Game.rooms[name].controller!.pos.lookFor(LOOK_FLAGS);
			this.Colonies[colonyName] = new Colony(colonyName, colonyOutposts[colonyName]);
			// this.Overseers[colonyName] = new Overseer(this.Colonies[colonyName]);
			// for (let outpostName of colonyOutposts[colonyName]) {
			// 	this.Colonies[outpostName] = this.Colonies[colonyName];
			// }
		}

		// // Register colony incubations
		// let incubationFlags = _.filter(Game.flags, flagCodes.territory.claimAndIncubate.filter);
		// for (let flag of incubationFlags) {
		// 	// flag.colony.registerIncubation();
		// 	if (!flag.room) {
		// 		this.invisibleRooms.push(flag.pos.roomName);
		// 	}
		// }
	}

	/* Wrap each creep in a role-contextualized wrapper and register to their respective colonies */
	private registerCreeps(): void {
		// Wrap all creeps
		Game.zerg = {};
		for (let name in Game.creeps) {
			Game.zerg[name] = new WrappedCreep(Game.creeps[name]);
		}
		// Register creeps to their colonies
		let creepsByColony = _.groupBy(Game.zerg, creep => creep.memory.colony) as { [colName: string]: Zerg[] };
		for (let colName in this.Colonies) {
			let colony = this.Colonies[colName];
			colony.creeps = creepsByColony[colName];
			colony.creepsByRole = _.groupBy(creepsByColony[colName], creep => creep.memory.role);
			// colony.creepsByOverseer = _.groupBy(creepsByColony[colName], creep => creep.memory.overseer);
		}
	}

	// private buildColonies(): void {
	// 	for (let name in this.Colonies) {
	// 		this.Colonies[name].build();
	// 	}
	// }

	/* Wrap each flag in a color coded wrapper */
	private registerDirectives(): void {
		// Create a directive for each flag (registration takes place on construction)
		Game.directives = {};
		for (let name in Game.flags) {
			let directive = DirectiveWrapper(Game.flags[name]);
			if (directive) {
				Game.directives[name] = directive;
			}
		}
		// // Register directives to their respective overlords
		// let assignedDirectives = _.groupBy(Game.directives, d => d.assignedTo);
		// for (let name in this.Overseers) {
		// 	let overseer = this.Overseers[name];
		// 	overseer.directives = assignedDirectives[name];
		// }
	}

	// private handleObservers(): void {
	// 	// Shuffle list of invisible rooms to allow different ones to be observed each tick
	// 	this.invisibleRooms = _.shuffle(this.invisibleRooms);
	// 	// Generate a map of available observers
	// 	let availableObservers: { [colonyName: string]: StructureObserver } = {};
	// 	for (let colonyName in this.Colonies) {
	// 		let colony = this.Colonies[colonyName];
	// 		if (colony.observer) {
	// 			availableObservers[colonyName] = colony.observer;
	// 		}
	// 	}
	// 	// Loop until you run out of rooms to observe or observers
	// 	while (this.invisibleRooms.length > 0 && _.size(availableObservers) > 0) {
	// 		let roomName = this.invisibleRooms.shift();
	// 		if (roomName) {
	// 			let colonyName = this.colonyMap[roomName];
	// 			if (availableObservers[colonyName]) {
	// 				availableObservers[colonyName].observeRoom(roomName);
	// 				delete availableObservers[colonyName];
	// 			} else {
	// 				let observerRooms = _.keys(availableObservers);
	// 				let inRangeRoom = _.find(observerRooms,
	// 										 oRoomName => Game.map.getRoomLinearDistance(oRoomName, roomName!)
	// 													  <= OBSERVER_RANGE);
	// 				if (inRangeRoom) {
	// 					availableObservers[inRangeRoom].observeRoom(roomName);
	// 					delete availableObservers[colonyName];
	// 				}
	// 			}
	// 		}
	// 	}
	// }

	/* Global instantiation of Overmind object; run once every global refresh */
	build(): void {
		// this.verifyMemory();
		this.cache.build();
		this.registerColonies();
		this.registerCreeps();			// 4: Wrap all the creeps and assign to respective colonies
		// this.buildColonies();			// 5: Build the colony, instantiating virtual components
		this.registerDirectives(); 		// 5: Wrap all the directives and assign to respective overlords
	}

	/* Refresh the state of the Overmind; run at the beginning of every tick */
	rebuild(): void {
		this.cache.rebuild();
	}

	/* Intialize everything in pre-init phase of main loop. Does not call colony.init(). */
	init(): void {
		// // The order in which these functions are called is important
		// this.verifyMemory();
		// this.registerColonies();		// 2: Initialize each colony. Build() is called in main.ts
		// this.registerCreeps();			// 4: Wrap all the creeps and assign to respective colonies
		// // this.buildColonies();			// 5: Build the colony, instantiating virtual components
		// this.registerDirectives(); 		// 5: Wrap all the directives and assign to respective overlords
		for (let colonyName in this.Colonies) {
			this.Colonies[colonyName].init();
		}
	}

	run(): void {
		for (let colonyName in this.Colonies) {
			this.Colonies[colonyName].run();
		}
		// this.handleObservers();
	}
};

