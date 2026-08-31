import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Cache, TextureLoader } from 'three'

const DEFAULT_TRANSCODER_PATH = '/assets/vendor/basis/'

function normalizedUrl(url) {
  return new URL(url, document.baseURI).href
}

export function createAssetLoader(renderer, { transcoderPath = DEFAULT_TRANSCODER_PATH, maxConcurrent = 4 } = {}) {
  // GLTFLoader uses ImageBitmapLoader for external images. Its cache stores the
  // in-flight Promise as well as the decoded bitmap, so concurrent GLBs that
  // reference one URL issue one fetch and one decode.
  Cache.enabled = true
  const gltfLoader = new GLTFLoader()
  const textureLoader = new TextureLoader()
  let ktx2Loader = null
  let ktx2LoaderPromise = null
  let meshoptDecoder = null
  let meshoptDecoderPromise = null
  const promises = new Map()
  const sharedTextures = new Map()
  const queue = []
  let activeRequests = 0
  const stats = {
    requests: 0,
    cacheHits: 0,
    failures: 0,
    retries: 0,
    textureReuses: 0,
    retriesEnabled: true,
    maxConcurrent,
    peakConcurrent: 0,
  }

  const drainQueue = () => {
    while (activeRequests < maxConcurrent && queue.length) {
      const job = queue.shift()
      activeRequests++
      stats.peakConcurrent = Math.max(stats.peakConcurrent, activeRequests)
      job.load().then(job.resolve, job.reject).finally(() => {
        activeRequests--
        drainQueue()
      })
    }
  }
  const enqueue = load => new Promise((resolve, reject) => {
    queue.push({ load, resolve, reject })
    drainQueue()
  })

  const loadWithRetry = async (load, { retries = 1, retryDelayMs = 180 } = {}) => {
    let attempt = 0
    while (true) {
      try {
        return await load()
      } catch (error) {
        if (attempt >= retries) throw error
        attempt++
        stats.retries++
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
      }
    }
  }

  const loadOnce = (kind, url, load) => {
    const resolvedUrl = normalizedUrl(url)
    const key = `${kind}:${resolvedUrl}`
    const cached = promises.get(key)
    if (cached) {
      stats.cacheHits++
      return cached.promise
    }

    stats.requests++
    const entry = { kind, url, resolvedUrl, status: 'queued', promise: null }
    entry.promise = enqueue(() => {
      entry.status = 'loading'
      return load(url)
    }).then(asset => {
      entry.status = 'loaded'
      return asset
    }).catch(error => {
      entry.status = 'failed'
      stats.failures++
      // A rejected Promise must not poison the registry permanently. The next
      // caller gets a real retry while all concurrent callers still share this failure.
      promises.delete(key)
      throw error
    })
    promises.set(key, entry)
    return entry.promise
  }

  const getKtx2Loader = () => {
    if (!ktx2LoaderPromise) {
      ktx2LoaderPromise = import('three/examples/jsm/loaders/KTX2Loader.js').then(({ KTX2Loader }) => {
        ktx2Loader = new KTX2Loader()
          .setTranscoderPath(transcoderPath)
          .detectSupport(renderer)
        return ktx2Loader
      })
    }
    return ktx2LoaderPromise
  }

  return {
    gltfLoader,
    loadGltf: (url, options) => loadWithRetry(
      () => loadOnce('gltf', url, value => gltfLoader.loadAsync(value)), options,
    ),
    loadTexture: (url, options) => loadWithRetry(
      () => loadOnce('texture', url, value => textureLoader.loadAsync(value)), options,
    ),
    reuseTexture: (key, candidate) => {
      const canonical = sharedTextures.get(key)
      if (!canonical) {
        sharedTextures.set(key, candidate)
        return candidate
      }
      if (canonical !== candidate) {
        candidate.dispose()
        stats.textureReuses++
      }
      return canonical
    },
    // KTX2 support is intentionally lazy: the current scene has no KTX2 assets,
    // so its decoder code and transcoder binaries must not burden first view.
    enableKtx2ForGltf: async () => {
      gltfLoader.setKTX2Loader(await getKtx2Loader())
      return gltfLoader
    },
    enableMeshoptForGltf: async () => {
      if (!meshoptDecoderPromise) {
        meshoptDecoderPromise = import('three/examples/jsm/libs/meshopt_decoder.module.js').then(module => {
          meshoptDecoder = module.MeshoptDecoder
          return meshoptDecoder
        })
      }
      gltfLoader.setMeshoptDecoder(await meshoptDecoderPromise)
      return gltfLoader
    },
    loadKtx2: async (url, options) => {
      const loader = await getKtx2Loader()
      return loadWithRetry(() => loadOnce('ktx2', url, value => loader.loadAsync(value)), options)
    },
    snapshot: () => ({
      ...stats,
      ktx2: { initialized: Boolean(ktx2Loader), transcoderPath },
      meshopt: { initialized: Boolean(meshoptDecoder) },
      queue: { active: activeRequests, pending: queue.length, maxConcurrent },
      sharedTextures: [...sharedTextures.keys()],
      entries: [...promises.values()].map(({ kind, url, resolvedUrl, status }) => ({
        kind, url, resolvedUrl, status,
      })),
    }),
    dispose: () => ktx2Loader?.dispose(),
  }
}
