const DEFAULT_STORAGE_KEY='4lite:user-data:v1'
const ROOT_SCHEMA_VERSION=1

const clone=value=>value==null?value:structuredClone(value)
const encodedBytes=text=>typeof TextEncoder==='function'?new TextEncoder().encode(text).byteLength:text.length*2
const createMemoryStorage=()=>{
  const values=new Map()
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}
}

export function createUserDataStore({storageKey=DEFAULT_STORAGE_KEY,storage=null}={}) {
  const namespaceConfigs=new Map(),listeners=new Map()
  let root={schemaVersion:ROOT_SCHEMA_VERSION,updatedAt:null,namespaces:{}}
  let status='empty',error=null,bytes=0,storageType='localStorage'

  if(!storage)try {storage=globalThis.localStorage}catch(caught) {
    storage=createMemoryStorage();storageType='memory';status='unavailable';error=caught?.message??String(caught)
  }
  if(!storage) {
    storage=createMemoryStorage();storageType='memory';status='unavailable';error='localStorage is unavailable'
  }

  try {
    const serialized=storage.getItem(storageKey)
    if(serialized) {
      bytes=encodedBytes(serialized)
      const candidate=JSON.parse(serialized)
      if(candidate?.schemaVersion===ROOT_SCHEMA_VERSION&&candidate.namespaces&&typeof candidate.namespaces==='object') {
        root=candidate;status='loaded'
      } else status='ignored-version'
    }
  } catch(caught) {
    status='unavailable';error=caught?.message??String(caught)
  }

  const persist=()=>{
    try {
      if(!Object.keys(root.namespaces).length) {
        storage.removeItem(storageKey);bytes=0;status='empty';error=null;return true
      }
      root.updatedAt=new Date().toISOString()
      const serialized=JSON.stringify(root)
      storage.setItem(storageKey,serialized)
      bytes=encodedBytes(serialized);status='saved';error=null;return true
    } catch(caught) {
      status='unavailable';error=caught?.message??String(caught);return false
    }
  }
  const notify=(name,value)=>{
    for(const listener of listeners.get(name)??[])listener(clone(value))
  }
  const readNamespace=name=>{
    const config=namespaceConfigs.get(name),record=root.namespaces[name]
    if(!config||!record)return clone(config?.defaultValue)
    try {
      let value=record.data
      if(record.version!==config.version) {
        if(!config.migrate)return clone(config.defaultValue)
        value=config.migrate(clone(record.data),record.version)
      }
      const validated=config.validate(clone(value))
      return validated==null||validated===false?clone(config.defaultValue):clone(validated)
    } catch {
      return clone(config.defaultValue)
    }
  }

  const registerNamespace=(name,{version=1,defaultValue=null,validate=value=>value,migrate=null}={})=>{
    if(!/^[a-z][a-zA-Z0-9]*$/.test(name))throw new Error(`Invalid user-data namespace: ${name}`)
    if(namespaceConfigs.has(name))throw new Error(`User-data namespace already registered: ${name}`)
    namespaceConfigs.set(name,{version,defaultValue:clone(defaultValue),validate,migrate})
    const write=value=>{
        const validated=validate(clone(value))
        if(validated==null||validated===false)return false
        root.namespaces[name]={version,updatedAt:new Date().toISOString(),data:clone(validated)}
        const saved=persist();notify(name,validated);return saved
    }
    return {
      name,version,get:()=>readNamespace(name),set:write,
      update:updater=>{const next=updater(readNamespace(name));return next===undefined?false:write(next)},
      clear:()=>{
        delete root.namespaces[name]
        const saved=persist();notify(name,defaultValue);return saved
      },
      subscribe:listener=>{
        if(!listeners.has(name))listeners.set(name,new Set())
        listeners.get(name).add(listener)
        return ()=>listeners.get(name)?.delete(listener)
      },
    }
  }

  return {
    registerNamespace,
    readPersistedNamespace:name=>clone(root.namespaces[name]??null),
    clearNamespace:name=>{
      if(!Object.hasOwn(root.namespaces,name))return true
      delete root.namespaces[name]
      const saved=persist();notify(name,readNamespace(name));return saved
    },
    clearAll:()=>{root.namespaces={};const saved=persist();for(const name of namespaceConfigs.keys())notify(name,readNamespace(name));return saved},
    snapshot:()=>({
      storage:storageType,storageKey,rootSchemaVersion:ROOT_SCHEMA_VERSION,status,error,bytes,
      persistedNamespaces:Object.keys(root.namespaces),registeredNamespaces:[...namespaceConfigs.keys()],updatedAt:root.updatedAt,
    }),
  }
}

let defaultStore=null
export const getUserDataStore=()=>defaultStore??=createUserDataStore()
