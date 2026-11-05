import {permissionGroups} from './permissions';
export function projectPermissionCatalog(type:string){return permissionGroups.filter(g=>type==='cross_border'?g.key==='cross':['asset','content','review','publishing','version','business','analytics'].includes(g.key)).map(g=>({...g,permissions:g.permissions.filter(p=>p.key!=='business.accounts')}));}
// Operations imply access to their page, but viewing never implies an operation.
export function projectPermissionKeys(keys:string[]){
 const result=new Set(keys);
 for(const key of keys){
  const section=key.split('.')[0];
  if(['cross','asset','content','review','publishing','version','business','analytics'].includes(section))result.add(section+'.view');
  if(key==='review.process'||key==='review.correct'||key==='review.recommend'||key==='version.upload')result.add('content.view');
 }
 return [...result];
}
export function projectPermissionGranted(keys:string[],key:string){return keys.includes('*')||projectPermissionKeys(keys).includes(key);}
export function projectRolePresets(type:string){return type==='cross_border'?[
 {name:'资料只读',permissions:['cross.view']},
 {name:'资料制作',permissions:['cross.create','cross.edit']},
 {name:'资料审核',permissions:['cross.review']},
 {name:'交付下载',permissions:['cross.download']}
]:[
 {name:'项目只读',permissions:['content.view','asset.view','review.view','publishing.view','version.view','business.view','analytics.view']},
 {name:'素材制作',permissions:['asset.upload']},{name:'素材审核',permissions:['asset.review']},
 {name:'内容制作',permissions:['content.upload','content.edit','content.submit','content.withdraw','version.upload','asset.claim']},
 {name:'内容审核',permissions:['review.process','review.recommend','version.view']},
 {name:'发布运营',permissions:['publishing.assign','publishing.status','publishing.download']}
];}
