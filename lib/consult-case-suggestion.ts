/**
 * Product decision only: suggest changing from a short dialogue to a clinical
 * case once the question becomes long or the exchange has accumulated context.
 * Never create a case, call a model or move data without an explicit click.
 */
export function suggestClinicalCase(question:string,answeredTurns:number,hasPreparedDocument:boolean):boolean{
 return question.trim().length >= 900 || answeredTurns >= 4 || (hasPreparedDocument&&question.trim().length>=300);
}
