import {
	isCombatZerg,
	isPowerZerg,
	isStandardZerg,
} from "declarations/typeGuards";
import { AnyZerg } from "zerg/AnyZerg";
import {
	TERRAIN_PLAIN_DEFAULT_COST,
	TERRAIN_SWAMP_DEFAULT_COST,
	TerrainCosts,
} from "./types";

/**
 * Returns destination.pos if destination has a position, or destination if destination is a RoomPosition
 */
export function normalizePos(
	destination: _HasRoomPosition | RoomPosition
): RoomPosition {
	return (<_HasRoomPosition>destination).pos || destination;
}

/**
 * Returns if the coordinate is at the edge of a room. Does not explicitly check if the position is an exit tile.
 */
export function isExit(pos: Coord): boolean {
	return pos.x == 0 || pos.y == 0 || pos.x == 49 || pos.y == 49;
}

/**
 * Checks if the coordinates of two room positions are the same
 */
export function sameCoord(pos1: Coord, pos2: Coord): boolean {
	return pos1.x == pos2.x && pos1.y == pos2.y;
}

/**
 * Returns the number of move parts and number of weight-generating parts in a creep
 */
export function getCreepWeightInfo(
	creep: Creep,
	analyzeCarry = true,
	fullCarry = false
): { move: number; weighted: number } {
	// Compute number of weighted and unweighted bodyparts
	const unweightedParts = analyzeCarry ? [MOVE, CARRY] : [MOVE];
	const bodyParts = _.countBy(creep.body, (p) =>
		_.contains(unweightedParts, p.type) ? p.type : "weighted"
	);
	bodyParts.move = bodyParts.move || 0;
	bodyParts.weighted = bodyParts.weighted || 0;
	if (analyzeCarry && bodyParts[CARRY]) {
		bodyParts.weighted += Math.ceil(
			bodyParts[CARRY] *
				(fullCarry ? 1 : (
					creep.store.getUsedCapacity() / creep.store.getCapacity()
				))
		);
	}
	// Account for boosts
	for (const part of creep.body) {
		if (part.type == MOVE && part.boost) {
			bodyParts.move += BOOSTS.move[part.boost].fatigue - 1;
		}
	}
	return bodyParts as {
		move: number;
		weighted: number;
		[other: string]: number;
	};
}

export const getDefaultTerrainCosts: () => TerrainCosts = () => ({
	plainCost: TERRAIN_PLAIN_DEFAULT_COST,
	swampCost: TERRAIN_SWAMP_DEFAULT_COST,
	roadCost: "auto",
});

/**
 * Get terrain costs which take into account a creep's individual fatigue stats
 */
export function getTerrainCosts(
	creep: AnyCreep | AnyZerg,
	fullCarry = false
): TerrainCosts {
	if (isStandardZerg(creep)) {
		const data = getCreepWeightInfo(creep.creep, true, fullCarry);
		const fatigueRatio = data.weighted / data.move;
		const costs: TerrainCosts = {
			plainCost: Math.max(Math.ceil(fatigueRatio), 1),
			swampCost: Math.max(Math.ceil(5 * fatigueRatio), 1),
		};

		// If there's a disadvantage in swamps over plains, or creep is combat-creep, allow road usage
		if (costs.plainCost !== costs.swampCost || isCombatZerg(creep)) {
			costs.roadCost = "auto";
		}

		return costs;
	} else if (isPowerZerg(creep)) {
		return { plainCost: 1, swampCost: 1 };
	}
	return getDefaultTerrainCosts();
}

// @ts-expect-error global
global.getTerrainCosts = getTerrainCosts;
