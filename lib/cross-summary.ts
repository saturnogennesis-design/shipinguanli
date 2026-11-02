type SummaryRow={kind:string;status:string;lifecycle?:string};
export function crossSummary(rows:SummaryRow[]){
 const active=rows.filter(row=>(row.lifecycle??'active')==='active');
 return {clue:active.filter(r=>r.kind==='clue').length,mother:active.filter(r=>r.kind==='mother').length,package:active.filter(r=>r.kind==='package').length,pendingMother:active.filter(r=>r.kind==='mother'&&r.status==='pending').length,pendingPackage:active.filter(r=>r.kind==='package'&&r.status==='pending').length};
}
