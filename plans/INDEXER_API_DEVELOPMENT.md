# INDEXER_API_DEVELOPMENT.md

## Geliştirme Dokümanı - Indexer REST API Implementasyonu

**Sürüm:** 1.0  
**Tarih:** 5 Mart 2026  
**Hedef AI Agent:** Claude Sonnet 4.5  
**Öncelik:** KRİTİK (Production Blocker)

---

## 1. EKSİKLİK TESPİTİ VE DOĞRULAMA

### 1.1 Eksikliğin Tanımı
**Eksiklik:** Indexer servisi için Fastify tabanlı REST API endpoint'leri bulunmuyor.

### 1.2 Eksikliğin Konumu
| Dosya Yolu | Mevcut Durum | Gereken Durum |
|------------|--------------|---------------|
| `apps/indexer/src/server.ts` | Temel HTTP sunucu mevcut ancak eksik | Tam REST API implementasyonu |
| `apps/indexer/src/main.ts` | CLI tabanlı çalışıyor | HTTP server başlatmalı |
| `apps/indexer/src/api/IndexController.ts` | Controller mevcut | Endpoint'lerle bağlantılı olmalı |

### 1.3 Doğrulama Adımları
AI Agent, geliştirmeye başlamadan önce şu dosyaları inceleyerek eksikliği doğrulamalıdır:

```bash
# 1. Mevcut server.ts dosyasını incele
cat apps/indexer/src/server.ts

# 2. IndexController.ts dosyasını incele
cat apps/indexer/src/api/IndexController.ts

# 3. main.ts dosyasını incele
cat apps/indexer/src/main.ts

# 4. Orchestrator tarafındaki IndexClient.ts'yi incele
# (Bu dosya, indexer'dan beklenen API'yi gösterir)
cat apps/orchestrator/src/indexer/IndexClient.ts
```

**Beklenen Bulgular:**
- `server.ts` dosyasında temel Fastify sunucusu olabilir ancak eksik endpoint'ler
- `IndexClient.ts` dosyasında `ensureIndex()` ve `semanticSearch()` metodları var
- Bu metodların çağırdığı endpoint'ler (`/api/v1/index/ensure`, `/api/v1/search`) indexer'da yok

---

## 2. MEVCUT KOD ANALİZİ

### 2.1 IndexClient.ts - Beklenen API (Orchestrator Tarafı)

```typescript
// apps/orchestrator/src/indexer/IndexClient.ts
// Bu dosya orchestrator'ın indexer'dan beklediği API'yi gösterir

class IndexClient {
  async ensureIndex(projectPath: string, config: IndexConfig): Promise<IndexResult>
  async semanticSearch(query: string, options: SearchOptions): Promise<SearchResult[]>
  async getContext(path: string, options?: ContextOptions): Promise<ContextResult>
}
```

**Beklenen Endpoint'ler:**
| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| POST | `/api/v1/index/ensure` | Proje indeksleme |
| POST | `/api/v1/search` | Semantik arama |
| POST | `/api/v1/context` | Bağlam getirme (RAG) |
| GET | `/health` | Sağlık kontrolü |
| GET | `/health/ready` | Hazırlık kontrolü |

### 2.2 Mevcut IndexController.ts

```typescript
// apps/indexer/src/api/IndexController.ts
// Mevcut controller - içinde kullanılabilecek metodlar olabilir
```

AI Agent bu dosyayı incelemeli ve mevcut fonksiyonları yeniden kullanmalıdır.

---

## 3. GELİŞTİRME TALİMATLARI

### 3.1 Adım 1: Fastify Server Yapılandırması

**Dosya:** `apps/indexer/src/server.ts`

**Görevler:**
1. Fastify instance oluştur
2. CORS plugin'i ekle
3. API key authentication middleware ekle
4. Health endpoint'leri ekle
5. API route'larını register et
6. Graceful shutdown handler ekle

**Kod Yapısı:**
```typescript
// apps/indexer/src/server.ts

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { IndexController } from './api/IndexController';
import { config } from './config';

const fastify = Fastify({
  logger: true,
  requestIdHeader: 'x-request-id',
});

// CORS
await fastify.register(cors, {
  origin: config.corsOrigins || ['*'],
});

// API Key Authentication Middleware
fastify.addHook('onRequest', async (request, reply) => {
  const apiKey = request.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.INDEXER_API_KEY) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
});

// Health Endpoints (Auth gerektirmez)
fastify.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }));
fastify.get('/health/ready', async () => {
  // Qdrant ve Embedding server bağlantılarını kontrol et
  return { status: 'ready', checks: { qdrant: true, embedding: true } };
});

// API Routes
fastify.register(async (instance) => {
  instance.post('/api/v1/index/ensure', IndexController.ensureIndex);
  instance.post('/api/v1/search', IndexController.search);
  instance.post('/api/v1/context', IndexController.getContext);
  instance.get('/api/v1/status', IndexController.getStatus);
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  await fastify.close();
});

export { fastify };
```

### 3.2 Adım 2: IndexController Implementasyonu

**Dosya:** `apps/indexer/src/api/IndexController.ts`

**Görevler:**
1. `ensureIndex` endpoint handler'ı
2. `search` endpoint handler'ı
3. `getContext` endpoint handler'ı
4. `getStatus` endpoint handler'ı

**Kod Yapısı:**
```typescript
// apps/indexer/src/api/IndexController.ts

import { FastifyRequest, FastifyReply } from 'fastify';
import { Scanner } from '../scanner/Scanner';
import { Chunker } from '../chunker/Chunker';
import { EmbeddingEngine } from '../embedding/EmbeddingEngine';
import { VectorIndex } from '../vector_index/VectorIndex';
import { IncrementalTracker } from '../incremental/IncrementalTracker';

// Request Schemas
interface EnsureIndexRequest {
  Body: {
    projectPath: string;
    config?: {
      excludePatterns?: string[];
      maxFileSize?: number;
      chunkSize?: number;
      chunkOverlap?: number;
    };
  };
}

interface SearchRequest {
  Body: {
    query: string;
    options?: {
      limit?: number;
      threshold?: number;
      filters?: Record<string, any>;
    };
  };
}

interface ContextRequest {
  Body: {
    path: string;
    options?: {
      maxChunks?: number;
      includeRelated?: boolean;
    };
  };
}

// Controller
export const IndexController = {
  async ensureIndex(
    request: FastifyRequest<EnsureIndexRequest>,
    reply: FastifyReply
  ) {
    const { projectPath, config } = request.body;
    
    // 1. Incremental tracking kontrolü
    const tracker = new IncrementalTracker(projectPath);
    const changes = await tracker.detectChanges();
    
    if (changes.length === 0) {
      return { status: 'unchanged', message: 'No changes detected' };
    }
    
    // 2. Scanner - dosyaları tara
    const scanner = new Scanner(projectPath, config?.excludePatterns);
    const files = await scanner.scan();
    
    // 3. Chunker - dosyaları parçala
    const chunker = new Chunker({
      chunkSize: config?.chunkSize || 512,
      chunkOverlap: config?.chunkOverlap || 50,
    });
    const chunks = await chunker.chunkFiles(files);
    
    // 4. Embedding Engine - embedding oluştur
    const embeddingEngine = new EmbeddingEngine();
    const embeddings = await embeddingEngine.embed(chunks);
    
    // 5. Vector Index - vektör veritabanına ekle
    const vectorIndex = new VectorIndex();
    await vectorIndex.upsert(embeddings);
    
    // 6. Incremental tracking güncelle
    await tracker.updateTracking(files);
    
    return {
      status: 'indexed',
      stats: {
        filesProcessed: files.length,
        chunksCreated: chunks.length,
        embeddingsGenerated: embeddings.length,
      },
    };
  },

  async search(
    request: FastifyRequest<SearchRequest>,
    reply: FastifyReply
  ) {
    const { query, options } = request.body;
    
    // 1. Query embedding oluştur
    const embeddingEngine = new EmbeddingEngine();
    const queryEmbedding = await embeddingEngine.embedSingle(query);
    
    // 2. Vector search
    const vectorIndex = new VectorIndex();
    const results = await vectorIndex.search(queryEmbedding, {
      limit: options?.limit || 10,
      threshold: options?.threshold || 0.7,
      filters: options?.filters,
    });
    
    return {
      query,
      results: results.map((r) => ({
        chunk: r.chunk,
        score: r.score,
        metadata: r.metadata,
      })),
    };
  },

  async getContext(
    request: FastifyRequest<ContextRequest>,
    reply: FastifyReply
  ) {
    const { path, options } = request.body;
    
    // 1. Path'e göre ilgili chunk'ları bul
    const vectorIndex = new VectorIndex();
    const chunks = await vectorIndex.getByPath(path, {
      limit: options?.maxChunks || 5,
    });
    
    // 2. İlgili chunk'ları da getir (opsiyonel)
    let related = [];
    if (options?.includeRelated) {
      related = await vectorIndex.getRelated(chunks, { limit: 3 });
    }
    
    return {
      path,
      context: chunks,
      related,
    };
  },

  async getStatus(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const vectorIndex = new VectorIndex();
    const stats = await vectorIndex.getStats();
    
    return {
      status: 'operational',
      indexStats: stats,
      timestamp: Date.now(),
    };
  },
};
```

### 3.3 Adım 3: main.ts Güncellemesi

**Dosya:** `apps/indexer/src/main.ts`

**Görevler:**
1. HTTP server başlatma
2. Environment variable'ları okuma
3. Port ve host konfigürasyonu

**Kod Yapısı:**
```typescript
// apps/indexer/src/main.ts

import { fastify } from './server';

const PORT = parseInt(process.env.INDEXER_PORT || '9001', 10);
const HOST = process.env.INDEXER_HOST || '0.0.0.0';

async function start() {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`Indexer API running on http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
```

### 3.4 Adım 4: Request/Response Schema Validasyonu

**Dosya:** `apps/indexer/src/api/schemas.ts`

**Görevler:**
1. JSON Schema tanımları
2. Fastify schema validation entegrasyonu

**Kod Yapısı:**
```typescript
// apps/indexer/src/api/schemas.ts

export const ensureIndexSchema = {
  body: {
    type: 'object',
    required: ['projectPath'],
    properties: {
      projectPath: { type: 'string' },
      config: {
        type: 'object',
        properties: {
          excludePatterns: { type: 'array', items: { type: 'string' } },
          maxFileSize: { type: 'number' },
          chunkSize: { type: 'number' },
          chunkOverlap: { type: 'number' },
        },
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        message: { type: 'string' },
        stats: {
          type: 'object',
          properties: {
            filesProcessed: { type: 'number' },
            chunksCreated: { type: 'number' },
            embeddingsGenerated: { type: 'number' },
          },
        },
      },
    },
  },
};

export const searchSchema = {
  body: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string' },
      options: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100 },
          threshold: { type: 'number', minimum: 0, maximum: 1 },
          filters: { type: 'object' },
        },
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chunk: { type: 'string' },
              score: { type: 'number' },
              metadata: { type: 'object' },
            },
          },
        },
      },
    },
  },
};

export const contextSchema = {
  body: {
    type: 'object',
    required: ['path'],
    properties: {
      path: { type: 'string' },
      options: {
        type: 'object',
        properties: {
          maxChunks: { type: 'number', minimum: 1, maximum: 20 },
          includeRelated: { type: 'boolean' },
        },
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        context: {
          type: 'array',
          items: { type: 'object' },
        },
        related: {
          type: 'array',
          items: { type: 'object' },
        },
      },
    },
  },
};
```

---

## 4. BAĞIMLILIKLAR

### 4.1 Gerekli npm Paketleri

```json
{
  "dependencies": {
    "@fastify/cors": "^9.0.0",
    "@fastify/helmet": "^11.0.0",
    "fastify": "^4.25.0",
    "zod": "^3.22.0"
  }
}
```

### 4.2 Mevcut Modüller (Yeniden Kullanılacak)

| Modül | Dosya | Kullanım |
|-------|-------|----------|
| Scanner | `apps/indexer/src/scanner/Scanner.ts` | Dosya tarama |
| Chunker | `apps/indexer/src/chunker/Chunker.ts` | Kod parçalama |
| EmbeddingEngine | `apps/indexer/src/embedding/EmbeddingEngine.ts` | Embedding oluşturma |
| VectorIndex | `apps/indexer/src/vector_index/VectorIndex.ts` | Vektör indeksleme |
| IncrementalTracker | `apps/indexer/src/incremental/IncrementalTracker.ts` | Değişiklik takibi |

---

## 5. TEST SENARYOLARI

### 5.1 Unit Testler

```typescript
// apps/indexer/src/api/__tests__/IndexController.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../server';

describe('IndexController', () => {
  beforeAll(async () => {
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('POST /api/v1/index/ensure', () => {
    it('should index a project successfully', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/index/ensure',
        headers: { 'x-api-key': 'test-key' },
        payload: {
          projectPath: '/test/project',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('status');
    });

    it('should reject without API key', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/index/ensure',
        payload: { projectPath: '/test/project' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/search', () => {
    it('should return search results', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/search',
        headers: { 'x-api-key': 'test-key' },
        payload: {
          query: 'authentication function',
          options: { limit: 5 },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('results');
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('status', 'ok');
    });
  });
});
```

### 5.2 Integration Testler

```typescript
// apps/indexer/src/__tests__/integration.test.ts

import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';

const INDEXER_URL = process.env.INDEXER_URL || 'http://localhost:9001';

describe('Indexer Integration Tests', () => {
  it('should complete full indexing workflow', async () => {
    // 1. Ensure index
    const ensureResponse = await axios.post(
      `${INDEXER_URL}/api/v1/index/ensure`,
      { projectPath: '/workspace/test-project' },
      { headers: { 'x-api-key': process.env.INDEXER_API_KEY } }
    );
    expect(ensureResponse.data.status).toBe('indexed');

    // 2. Search
    const searchResponse = await axios.post(
      `${INDEXER_URL}/api/v1/search`,
      { query: 'main function' },
      { headers: { 'x-api-key': process.env.INDEXER_API_KEY } }
    );
    expect(searchResponse.data.results).toBeInstanceOf(Array);

    // 3. Get context
    const contextResponse = await axios.post(
      `${INDEXER_URL}/api/v1/context`,
      { path: '/workspace/test-project/src/main.ts' },
      { headers: { 'x-api-key': process.env.INDEXER_API_KEY } }
    );
    expect(contextResponse.data).toHaveProperty('context');
  });
});
```

---

## 6. DOĞRULAMA KRİTERLERİ

AI Agent, geliştirme tamamlandığında şu kriterleri doğrulamalıdır:

### 6.1 Fonksiyonel Doğrulama

```bash
# 1. Server başlatma
cd apps/indexer && pnpm start

# 2. Health check
curl http://localhost:9001/health

# 3. API key olmadan istek (401 beklenir)
curl -X POST http://localhost:9001/api/v1/index/ensure \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/test"}'

# 4. API key ile istek (200 beklenir)
curl -X POST http://localhost:9001/api/v1/index/ensure \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"projectPath": "/test"}'

# 5. Search endpoint
curl -X POST http://localhost:9001/api/v1/search \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"query": "test query"}'
```

### 6.2 Kod Kalitesi Doğrulama

```bash
# TypeScript derleme hatasız
cd apps/indexer && pnpm build

# Testler geçmeli
pnpm test

# Lint hatasız (eslint varsa)
pnpm lint
```

---

## 7. RİSKLER VE DİKKAT EDİLECEK NOKTALAR

### 7.1 Güvenlik

| Risk | Önlem |
|------|-------|
| API Key sızdırma | Environment variable kullan, log'lama yazma |
| Path traversal | `path` parametrelerini sanitize et |
| DoS saldırısı | Rate limiting ekle (sonraki faz) |

### 7.2 Performans

| Risk | Önlem |
|------|-------|
| Büyük dosya indeksleme | `maxFileSize` limiti uygula |
| Uzun süren işlemler | Timeout ve async processing |
| Bellek taşması | Chunk sayısı limiti |

### 7.3 Hata Yönetimi

```typescript
// Merkezi hata handler'ı
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error({
    error: error.message,
    stack: error.stack,
    requestId: request.id,
  });

  if (error.validation) {
    reply.code(400).send({
      error: 'Validation Error',
      details: error.validation,
    });
    return;
  }

  reply.code(500).send({
    error: 'Internal Server Error',
    requestId: request.id,
  });
});
```

---

## 8. SONRAKI ADIMLAR

Bu geliştirme tamamlandıktan sonra:

1. **RAG_IMPLEMENTATION_GUIDE.md** - `contextForPath` fonksiyonunun orchestrator tarafında implementasyonu
2. **PRODUCTION_HARDENING.md** - Rate limiting ve circuit breaker
3. **TEST_STRATEGY.md** - Kapsamlı test coverage

---

## 9. REFERANSLAR

- [Fastify Dokümantasyonu](https://fastify.dev/)
- [Orchestrator IndexClient.ts](../apps/orchestrator/src/indexer/IndexClient.ts)
- [Indexer Mevcut Yapı](../apps/indexer/src/)
- [Docker Compose Konfigürasyonu](../docker-compose.yml)

---

**Doküman Sahibi:** GLM-5 Architect Mode  
**Son Güncelleme:** 5 Mart 2026  
**Durum:** GELİŞTİRMEYE HAZIR
