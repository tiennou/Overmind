// Type guards library: this allows for instanceof - like behavior for much lower CPU cost. Each type guard
// differentiates an ambiguous input by recognizing one or more unique properties.

import { AnyZerg } from "../zerg/AnyZerg";
import { CombatZerg } from "../zerg/CombatZerg";
import { NeuralZerg } from "../zerg/NeuralZerg";
import { PowerZerg } from "../zerg/PowerZerg";
import { Zerg } from "../zerg/Zerg";

export function isStructure(obj: unknown): obj is Structure {
	return obj instanceof Structure;
}

export function isOwnedStructure(obj: RoomObject): obj is OwnedStructure {
	return obj instanceof OwnedStructure;
}

export function isConstructionSite(obj: RoomObject): obj is ConstructionSite {
	return obj instanceof ConstructionSite;
}

export function isSource(obj: RoomObject): obj is Source {
	return obj instanceof Source;
}

export function isTombstone(obj: RoomObject): obj is Tombstone {
	return obj instanceof Tombstone;
}

export function isRuin(obj: RoomObject): obj is Ruin {
	return obj instanceof Ruin;
}

export function isResource(obj: RoomObject): obj is Resource {
	return obj instanceof Resource;
}

export function isMineral(obj: RoomObject): obj is Mineral {
	return obj instanceof Mineral;
}

export function isDeposit(obj: RoomObject): obj is Deposit {
	return obj instanceof Deposit;
}

export function hasPos(
	obj: _HasRoomPosition | RoomPosition
): obj is _HasRoomPosition {
	return (<_HasRoomPosition>obj).pos != undefined;
}

export function isCreep(obj: RoomObject): obj is Creep {
	return (<Creep>obj).fatigue != undefined;
}

export function isPowerCreep(obj: RoomObject): obj is PowerCreep {
	return (<PowerCreep>obj).powers != undefined;
}

export function isAnyZerg(thing: any): thing is AnyZerg {
	return (<AnyZerg>thing).isAnyZerg || false;
}

export function isStandardZerg(creep: AnyCreep | AnyZerg): creep is Zerg {
	return (<Zerg>creep).isStandardZerg || false;
}

export function isPowerZerg(creep: AnyCreep | AnyZerg): creep is PowerZerg {
	return (<PowerZerg>creep).isPowerZerg || false;
}

export function isCombatZerg(zerg: AnyCreep | AnyZerg): zerg is CombatZerg {
	return (<CombatZerg>zerg).isCombatZerg || false;
}

export function isNeuralZerg(zerg: AnyCreep | AnyZerg): zerg is NeuralZerg {
	return (<NeuralZerg>zerg).isNeuralZerg || false;
}
