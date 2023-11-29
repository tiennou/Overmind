import { CombatOverlord } from "../../overlords/CombatOverlord";
import { Directive } from "../Directive";

export abstract class DefenseDirective extends Directive {
	overlord: CombatOverlord;
	overlords: {};

	constructor(flag: Flag) {
		super(flag);
		Overmind.overseer.combatPlanner.directives.push(this);
	}
}
