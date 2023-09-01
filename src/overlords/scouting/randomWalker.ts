import {MoveOptions} from 'movement/Movement';
import {Colony} from '../../Colony';
import {Roles, Setups} from '../../creepSetups/setups';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Tasks} from '../../tasks/Tasks';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';
import { log } from 'console/log';
import { Cartographer } from 'utilities/Cartographer';

const DEFAULT_NUM_SCOUTS = 3;

/**
 * Sends out scouts which randomly traverse rooms to uncover possible expansion locations and gather intel
 */
@profile
export class RandomWalkerScoutOverlord extends Overlord {

	scouts: Zerg[];

	constructor(colony: Colony, priority = OverlordPriority.scouting.randomWalker) {
		super(colony, 'scout', priority);
		this.scouts = this.zerg(Roles.scout, {notifyWhenAttacked: false});
	}

	init() {
		this.wishlist(DEFAULT_NUM_SCOUTS, Setups.scout);
	}

	private handleScout(scout: Zerg) {
		// // Stomp on enemy construction sites
		// const enemyConstructionSites = scout.room.find(FIND_HOSTILE_CONSTRUCTION_SITES);
		// if (enemyConstructionSites.length > 0 && enemyConstructionSites[0].pos.isWalkable(true)) {
		// 	scout.goTo(enemyConstructionSites[0].pos);
		// 	return;
		// }

		const moveOptions: MoveOptions = {
			pathOpts: {
				allowHostile: true,
			},
		};

		// Check if room might be connected to newbie/respawn zone
		// const indestructibleWalls = _.filter(scout.room.walls, wall => wall.hits == undefined);
		// if (indestructibleWalls.length > 0) { // go back to origin colony if you find a room near newbie zone
		// 	this.debug(`${scout.print} detected indestructible walls, moving somewhere else`);
		// 	log.info(`${scout.print} moving back to ${this.colony.print}`)
		// 	scout.task = Tasks.goToRoom(this.colony.room.name, { moveOptions });
		// 	return;
		// }

		const roomStatus = RoomIntel.getRoomStatus(scout.room.name);

		let neighboringRooms = _.values<string>(Cartographer.describeExits(scout.pos.roomName));
		neighboringRooms = _.shuffle(neighboringRooms);

		// Pick a new random room from the neighboring rooms, making sure they have compatible room status
		let neighboringRoom: string | undefined;
		while ((neighboringRoom = neighboringRooms.shift())) {

			const neighborStatus = RoomIntel.getRoomStatus(scout.room.name);
			if (roomStatus.status !== neighborStatus.status) {
				this.debug(`${scout.print} room ${neighboringRoom} status doesn't match ${scout.room.name}: ${roomStatus} ${neighborStatus.status}`);
				continue;
			}

			log.info(`${scout.print} moving to ${neighboringRoom}`)
			scout.task = Tasks.goToRoom(neighboringRoom, { moveOptions });
			break;
		}

		// Just move back to the colony and start over
		if (!scout.task) {
			this.debug(`${scout.print} no task`);
			log.info(`${scout.print} moving back to ${this.colony.print}`)
			scout.task = Tasks.goToRoom(this.colony.room.name, { moveOptions });
		}
	}

	run() {
		this.autoRun(this.scouts, scout => this.handleScout(scout));
	}
}
