import type pg from 'pg';
import { broadcastScanProgress, type ScanProgressEvent } from '../routes/scans.js';
import { logger } from './logger.js';

let bridgeClient: pg.PoolClient | null = null;
let isStopping = false;
let reconnectTimer: NodeJS.Timeout | null = null;

/**
 * Subscribes a dedicated Postgres client to LISTEN scan_progress.
 * Forwards notifications from workers across processes/containers to local SSE subscribers.
 */
export async function startNotifyBridge(pool: pg.Pool): Promise<void> {
  isStopping = false;

  async function connectAndListen(retryDelay = 1000) {
    if (isStopping) return;

    try {
      const client = await pool.connect();
      bridgeClient = client;

      client.on('notification', (msg) => {
        if (msg.channel === 'scan_progress' && msg.payload) {
          try {
            const data = JSON.parse(msg.payload) as {
              scanId: string;
            } & ScanProgressEvent;
            if (data.scanId) {
              const { scanId, ...event } = data;
              broadcastScanProgress(scanId, event);
            }
          } catch (err) {
            logger.warn({ err }, '[notify-bridge] Failed to parse scan_progress payload');
          }
        }
      });

      client.on('error', (err) => {
        logger.warn({ err }, '[notify-bridge] Dedicated Postgres LISTEN client error');
        cleanupClient();
        scheduleReconnect();
      });

      await client.query('LISTEN scan_progress');
      logger.info('[notify-bridge] Subscribed to Postgres scan_progress channel');
    } catch (err) {
      logger.warn({ err }, '[notify-bridge] Failed to connect LISTEN client');
      cleanupClient();
      scheduleReconnect(retryDelay);
    }
  }

  function cleanupClient() {
    if (bridgeClient) {
      try {
        bridgeClient.release(true);
      } catch {
        // ignore release error
      }
      bridgeClient = null;
    }
  }

  function scheduleReconnect(delay = 1000) {
    if (isStopping) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const nextDelay = Math.min(delay * 2, 10000);
    reconnectTimer = setTimeout(() => {
      void connectAndListen(nextDelay);
    }, delay);
  }

  await connectAndListen();
}

/**
 * Stops the LISTEN notify bridge and releases client on shutdown.
 */
export async function stopNotifyBridge(): Promise<void> {
  isStopping = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (bridgeClient) {
    try {
      await bridgeClient.query('UNLISTEN scan_progress');
      bridgeClient.release();
    } catch {
      // ignore unlisten error
    }
    bridgeClient = null;
  }
}
