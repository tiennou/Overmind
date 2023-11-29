import { config } from "config";
import profiler from "./screeps-profiler";

// export {profile} from './profiler';

type Profilable = Function | { prototype: any; name: string };

export function profile(target: Profilable): void;
export function profile(
	target: Profilable,
	key: string | symbol,
	_descriptor: TypedPropertyDescriptor<Function>
): void;
export function profile(
	target: Profilable | Function,
	key?: string | symbol,
	_descriptor?: TypedPropertyDescriptor<Function>
): void {
	if (!config.USE_SCREEPS_PROFILER) {
		return;
	}

	if (key) {
		// case of method decorator
		profiler.registerFN(target as Function, key as string);
		return;
	}

	// case of class decorator
	const ctor = target;
	if (!ctor.prototype) {
		return;
	}

	const className = ctor.name;
	profiler.registerClass(target as Function, className);
}
