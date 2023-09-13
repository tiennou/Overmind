import {assimilationLocked} from '../assimilation/decorator';
import { DirectiveAvoid } from 'directives/targeting/avoid';
import {Colony, getAllColonies} from '../Colony';
import {log} from '../console/log';
import {DirectiveColonize} from '../directives/colony/colonize';
import {Autonomy, getAutonomyLevel, Mem} from '../memory/Memory';
import {Pathing} from '../movement/Pathing';
import {profile} from '../profiler/decorator';
import {Cartographer} from '../utilities/Cartographer';
import {maxBy} from '../utilities/utils';
import {MIN_EXPANSION_DISTANCE} from './ExpansionEvaluator';
import { DirectiveIncubate } from 'directives/colony/incubate';
import { config } from 'config';


const CHECK_EXPANSION_FREQUENCY = 1000;

const UNOWNED_MINERAL_BONUS = 100;
const CATALYST_BONUS = 75;
const MAX_SCORE_BONUS = _.sum([UNOWNED_MINERAL_BONUS, CATALYST_BONUS]);

const TOO_CLOSE_PENALTY = 100;

interface ExpansionPlannerMemory {

}

const defaultExpansionPlannerMemory: () => ExpansionPlannerMemory = () => ({});

@assimilationLocked
@profile
export class ExpansionPlanner implements IExpansionPlanner {

	memory: ExpansionPlannerMemory;

	constructor() {
		this.memory = Mem.wrap(Memory, 'expansionPlanner', defaultExpansionPlannerMemory);
	}

	refresh() {
		this.memory = Mem.wrap(Memory, 'expansionPlanner', defaultExpansionPlannerMemory);
	}

	private handleExpansion(): void {
		const allColonies = getAllColonies();

		let maxRooms;
		if (Memory.settings.colonization.maxRooms === undefined) {
			maxRooms = Game.shard.name == 'shard3' ? config.SHARD3_MAX_OWNED_ROOMS : Math.min(Game.gcl.level, config.MAX_OWNED_ROOMS);
		} else {
			maxRooms = Math.min(allColonies.length, Memory.settings.colonization.maxRooms);
		}

		if (allColonies.length >= maxRooms) {
			log.info(`Colonization capped at ${maxRooms}. Not expanding!`);
			return;
		}

		const roomName = this.chooseNextColonyRoom();
		if (roomName) {
			const pos = Pathing.findPathablePosition(roomName);
			DirectiveColonize.createIfNotPresent(pos, 'room');
			DirectiveIncubate.createIfNotPresent(pos, 'room');

			log.notify(`Room ${roomName} selected as next colony! Creating colonization directive.`);
		}
	}

	private chooseNextColonyRoom(): string | undefined {
		// Generate a list of possible colonies to expand from based on level and whether they are already expanding
		const possibleColonizers: Colony[] = [];
		for (const colony of getAllColonies()) {
			if (colony.level >= DirectiveColonize.requiredRCL
				&& _.filter(colony.flags, flag => DirectiveColonize.filter(flag)).length == 0) {
				possibleColonizers.push(colony);
			}
		}
		const possibleBestExpansions = _.compact(_.map(possibleColonizers, col => this.getBestExpansionRoomFor(col)));
		log.debug("bestExpansions: " + JSON.stringify(possibleBestExpansions));
		const bestExpansion = maxBy(possibleBestExpansions, choice => choice!.score);
		if (bestExpansion) {
			log.alert(`Next expansion chosen: ${bestExpansion.roomName} with score ${bestExpansion.score}`);
			return bestExpansion.roomName;
		} else {
			log.alert(`No viable expansion rooms found!`);
		}
	}

	private getBestExpansionRoomFor(colony: Colony): { roomName: string, score: number } | undefined {
		const allColonyRooms = _.zipObject<Record<string, Colony>>(_.map(getAllColonies(),
												 col => [col.room.name, true]));
		const allOwnedMinerals = _.map(getAllColonies(), col => col.room.mineral!.mineralType);
		let bestRoom: string = '';
		let bestScore: number = -Infinity;
		for (const roomName in colony.memory.expansionData.possibleExpansions) {
			let score = colony.memory.expansionData.possibleExpansions[roomName];
			if (typeof score != 'number') continue;
			const isBlocked = DirectiveAvoid.isPresent(roomName);
			if (isBlocked) {
				continue;
			}

			// Compute modified score
			if (score + MAX_SCORE_BONUS > bestScore) {
				// Is the room too close to an existing colony?
				const range2Rooms = Cartographer.findRoomsInRange(roomName, MIN_EXPANSION_DISTANCE);
				if (_.any(range2Rooms, roomName => allColonyRooms[roomName])) {
					continue; // too close to another colony
				}
				const range3Rooms = Cartographer.findRoomsInRange(roomName, MIN_EXPANSION_DISTANCE + 1);
				if (_.any(range3Rooms, roomName => allColonyRooms[roomName])) {
					score -= TOO_CLOSE_PENALTY;
				}
				// Are there powerful hostile rooms nearby?
				const adjacentRooms = Cartographer.findRoomsInRange(roomName, 1);
				if (_.any(adjacentRooms, roomName => RoomIntel.isConsideredHostile(roomName))) {
					continue;
				}
				// Reward new minerals and catalyst rooms
				const mineralType = Memory.rooms[roomName][RMEM.MINERAL]
									? Memory.rooms[roomName][RMEM.MINERAL]![RMEM_MNRL.MINERALTYPE]
									: undefined;
				if (mineralType) {
					if (!allOwnedMinerals.includes(mineralType)) {
						score += UNOWNED_MINERAL_BONUS;
					}
					if (mineralType == RESOURCE_CATALYST) {
						score += CATALYST_BONUS;
					}
				}

				// Update best choices
				if (score > bestScore &&
					RoomIntel.getRoomStatus(roomName).status === RoomIntel.getRoomStatus(colony.room.name).status) {
					bestScore = score;
					bestRoom = roomName;
				}
			}
		}
		if (bestRoom != '') {
			return {roomName: bestRoom, score: bestScore};
		}
	}

	init(): void {

	}

	run(): void {
		if (Game.time % CHECK_EXPANSION_FREQUENCY == 17 && getAutonomyLevel() == Autonomy.Automatic) {
			this.handleExpansion();
		}
	}

}
