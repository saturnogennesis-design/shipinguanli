type SummaryRow={kind:string;status:string;lifecycle?:string};
export function crossSummary(rows:SummaryRow[]){
 const active=rows.filter(row=>(row.lifecycle??'active')==='active');
 return {clue:active.filter(r=>r.kind==='clue').length,mother:active.filter(r=>r.kind==='mother').length,package:active.filter(r=>r.kind==='package').length,pendingMother:active.filter(r=>r.kind==='mother'&&r.status==='pending').length,pendingPackage:active.filter(r=>r.kind==='package'&&r.status==='pending').length};
}
export const crossReviewViews=['draft','pending','approved','rejected'];
export function crossViewRows<T extends {lifecycle?:string;status:string}>(rows:T[],view:string):T[]{
 if(crossReviewViews.includes(view))return rows.filter(row=>(row.lifecycle??'active')==='active'&&row.status===view);
 return rows.filter(row=>(row.lifecycle??'active')===view);
}
