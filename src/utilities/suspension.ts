export const SUSPENSION_OVERFILL_DEFAULT_DURATION = 50;
export const SUSPENSION_STRONGHOLD_DEFAULT_DURATION = 5000;

export enum SuspensionReason {
	/** CPU is too limited */
	cpu = "cpu",
	/** Colony can't sustain this remote because rebooting, spawn pressure, etc */
	upkeep = "upkeep",
	harassment = "harassment",
	/** Controller has been reserved/claimed from us */
	reserved = "reserved",
	/** A stronghold had popped up in the room */
	stronghold = "stronghold",
	/** Colony is currently overfilled */
	overfilled = "overfilled",
}

export interface SuspensionMemory {
	/** Is the object running or not */
	active: boolean;
	suspendReason?: SuspensionReason;
	condition?: {
		/** stringified function with signature () => boolean; */
		fn: string;
		/** how often to check if the condition is met */
		freq: number;
	};
	/** Tick at which the suspension expires */
	[MEM.EXPIRATION]?: number;
}

export type SuspensionOptions = {
	reason: SuspensionReason;
	duration?: number;
	until?: number;
};

/**
 * Get the suspension reason
 *
 * If the object is undefined, or marked as active, return false.
 * If the object has a reason for being suspended, return that reason.
 * Otherwise, the object has been manually suspended, return true.
 */
export function suspensionReason(obj: SuspensionMemory) {
	// Consider the overlord active if the room it's in isn't part of a colony
	if (!obj || obj.active) {
		return false;
	}

	if (obj.suspendReason) {
		return obj.suspendReason;
	}

	return true;
}

/**
 * Check if the object is suspended
 */
export function isSuspended(obj: SuspensionMemory) {
	const reason = suspensionReason(obj);
	if (reason !== false) {
		return true;
	}
	return false;
}

/**
 * Mark the given object for suspension
 */
export function suspend(obj: SuspensionMemory, opts?: SuspensionOptions) {
	if (!obj) {
		return;
	}
	obj.active = false;
	if (opts?.reason) {
		obj.suspendReason = opts.reason;
	}
	if (opts?.until) {
		obj[MEM.EXPIRATION] = opts.until;
	} else if (opts?.duration) {
		obj[MEM.EXPIRATION] = Game.time + opts.duration;
	}
}

/**
 * Unsuspend the object
 */
export function unsuspend(obj: SuspensionMemory) {
	if (!obj) {
		return;
	}
	obj.active = true;
	delete obj.suspendReason;
	delete obj[MEM.EXPIRATION];
}

/**
 * Check the suspension expiration
 *
 * If the object is not active, has a suspension reason and it's expired, unsuspend it and return true.
 * Otherwise, return false
 *
 */
export function expireSuspension(obj: SuspensionMemory, force = false) {
	if (
		(obj &&
			!obj.active &&
			obj.suspendReason &&
			Game.time >= (obj[MEM.EXPIRATION] ?? Infinity)) ||
		force
	) {
		unsuspend(obj);
		return true;
	}

	return false;
}
