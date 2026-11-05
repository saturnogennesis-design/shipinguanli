import type {AuthUser} from './server-auth';
// Call only after binding the project; values are numeric IDs, alias is internal.
export function contentScopeSql(user:AuthUser,alias='c'){
 if(!/^[a-z_]+$/.test(alias))throw Error('Invalid content alias');
 if(user.projectLeader||user.roleCode==='super_admin'&&!user.projectConfigured)return '1=1';
 const groups=(user.groupScopes.view??[]).filter(Number.isSafeInteger).join(',')||'0';
 return `(${alias}.uploader_user_id=${Number(user.id)} OR ${alias}.group_id IN (${groups}) OR (${alias}.visibility='public' AND EXISTS(SELECT 1 FROM reviews sr JOIN content_versions sv ON sv.id=sr.version_id WHERE sr.content_id=${alias}.id AND sv.version_number=${alias}.latest_version_number AND sr.recommended=1 AND sr.recommendation_removed_at IS NULL)))`;
}
// Public access never grants ownership or management rights.
export function contentMutationScopeSql(user:AuthUser,alias='c'){
 if(!/^[a-z_]+$/.test(alias))throw Error('Invalid content alias');
 if(user.projectLeader||user.roleCode==='super_admin'&&!user.projectConfigured)return '1=1';
 const groups=(user.groupScopes.view??[]).filter(Number.isSafeInteger).join(',')||'0';
 return `(${alias}.uploader_user_id=${Number(user.id)} OR ${alias}.group_id IN (${groups}))`;
}
