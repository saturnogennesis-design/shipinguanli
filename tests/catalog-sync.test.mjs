import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const moduleUrl=source=>'data:text/javascript,'+encodeURIComponent(source);
let updates=0,inserts=0;
const legacy=[{name:'旧商品',status:'active',ownerUserId:1}];
const saved={id:70,status:'inactive'};
const db={select(){return {from(table){let existing=false;return {
  where(){existing=table==='productMasters';return this;},
  orderBy(){return this;},
  async limit(){return existing?[saved]:[{id:1}];},
  then(resolve){resolve(legacy);},
};}};},update(){updates++;throw Error('must not reactivate disabled product');},insert(){return {async values(){inserts++;}};}};
globalThis.__orbitCatalogTestDb=db;
registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.endsWith('/lib/product-catalog.ts')) {
    if(specifier==='drizzle-orm') return {url:moduleUrl('export const asc=x=>x; export const eq=(a,b)=>[a,b];'),shortCircuit:true};
    if(specifier==='@/db') return {url:moduleUrl('export const getDb=()=>globalThis.__orbitCatalogTestDb;'),shortCircuit:true};
    if(specifier==='@/db/schema') return {url:moduleUrl('export const productMasters="productMasters",products="products",users="users";'),shortCircuit:true};
  }
  return next(specifier,context);
}});
const {syncProductMasterCatalog}=await import('../lib/product-catalog.ts');
test('repeated legacy sync does not reactivate a manually disabled product or duplicate it',async()=>{
  await syncProductMasterCatalog();await syncProductMasterCatalog();
  assert.equal(saved.status,'inactive');assert.equal(updates,0);assert.equal(inserts,0);
});
