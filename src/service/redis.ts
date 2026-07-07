import { Redis } from "ioredis";
import type { RedisOptions } from "ioredis";

function retryStrategy(times: number): number | null {
  if (times > 20) return null;
  return Math.min(times * 200, 2000);
}

export function getRedisOptions(): RedisOptions {
  const sentinelHosts = process.env.VALKEY_SENTINEL_HOSTS || "";
  const password =
    process.env.VALKEY_PASSWORD || process.env.REDIS_PASSWORD || undefined;
  const sentinelPassword = process.env.VALKEY_SENTINEL_PASSWORD || undefined;

  if (sentinelHosts.trim()) {
    return {
      sentinels: sentinelHosts.split(",").map((entry) => {
        const [host, portStr] = entry.trim().split(":");
        return { host: host || "", port: parseInt(portStr || "26379", 10) };
      }),
      name: process.env.VALKEY_MASTER_NAME || "hashiden-master",
      password,
      sentinelPassword,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy,
    };
  }

  const raw = process.env.VALKEY_HOST || process.env.REDIS_HOST || "localhost";
  if (raw.startsWith("redis://") || raw.startsWith("rediss://")) {
    const url = new URL(raw);
    return {
      host: url.hostname,
      port: parseInt(url.port || "6379", 10),
      password: url.password || password,
      tls: raw.startsWith("rediss://") ? {} : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy,
    };
  }

  const isLocalhost = raw === "localhost" || raw === "127.0.0.1";
  const useTls = process.env.REDIS_TLS === "false" ? false : !isLocalhost;
  return {
    host: raw,
    port: parseInt(process.env.VALKEY_PORT || process.env.REDIS_PORT || "6379", 10),
    password,
    tls: useTls ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy,
  };
}

let redis: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redis) {
    redis = new Redis(getRedisOptions());
    redis.on("connect", () => console.log("[content-engine] Redis connected"));
    redis.on("error", (error) =>
      console.warn("[content-engine] Redis error:", error?.message || error),
    );
  }
  return redis;
}

export function createRedisConnection(): Redis {
  return new Redis(getRedisOptions());
}

export async function closeRedisConnection(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
